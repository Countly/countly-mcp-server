# Releasing

A release has **three** parts. Two are automated, one is not:

| Part | Automated? |
|---|---|
| Docker image on Docker Hub | Yes — on tag push |
| npm package | **No — manual, every time** |
| Deploy to `mcp.count.ly` | No — manual, on the VM |

Skipping the npm step is the easiest mistake to make, because the release run
goes green without it. The welcome page and the
[support article](https://support.countly.com/hc/en-us/articles/26998738930972-Connecting-Countly-to-your-AI-Assistant)
both tell users to run `npx countly-mcp-server@latest`, so an unpublished
release means users silently get the previous version. This happened between
1.4.0 and 1.5.0.

Two things guard against it: the release run's `npm publish reminder` job
prints the exact commands in its summary, and the weekly `npm drift check`
workflow fails if npm falls behind the newest tag.

---

## 1. Prepare the release commit

1. Bump `version` in `package.json` (`npm version <x.y.z> --no-git-tag-version`).
2. Add a `CHANGELOG.md` section for the new version. Write it from the actual
   commits since the last tag (`git log --oneline vX.Y.Z..main`), not from
   memory.
3. Open a PR, get it reviewed, merge it.

The version in `package.json` matters more than it looks: the server reads it
at runtime and serves it in the MCP handshake and at
`/.well-known/mcp-manifest.json`. It is how you verify a deploy from outside
the box, so the tag, `package.json`, and the served manifest must agree.

## 2. Tag

Tag the **merge commit on `main`**, then push the tag:

```bash
git tag -a v1.6.0 <merge-sha> -m "v1.6.0" && git push origin v1.6.0
```

That triggers `release.yml`, which builds `linux/amd64` and `linux/arm64` on
native runners, joins them into one manifest list, and pushes
`countly/countly-mcp-server:<version>` plus `:latest`.

`:latest` only moves on a real tag push. A `workflow_dispatch` run publishes
its version tag but leaves `:latest` alone, so you can rehearse the pipeline
without any host picking up a throwaway build:

```bash
gh workflow run release.yml -f version=0.0.0-ci-test -f publish-docker=true
```

## 3. Publish to npm (manual)

**Check your credentials first.** This is the step that wastes time otherwise:

```bash
npm whoami
```

If that returns `E401`, your stored token has expired — `npm login` and retry.
Tokens expire silently, so a publish that worked last release can fail this one
for no other reason.

> **`E404` on publish is an auth error, not a missing package.** npm answers an
> unauthorised `PUT` with `404 Not Found - PUT https://registry.npmjs.org/countly-mcp-server`
> rather than `403`, so it does not confirm a package exists to a caller who
> cannot access it. If you see E404, check `npm whoami` before anything else.

Then publish **from the tag**, not from `main` — `main` may already carry
post-release commits, and a clean clone avoids shipping anything stray from a
working tree:

```bash
rm -rf /tmp/cly-pub && git clone --depth 1 --branch v1.6.0 https://github.com/Countly/countly-mcp-server.git /tmp/cly-pub && cd /tmp/cly-pub && npm ci
```

Check what you are about to ship, then ship it:

```bash
cd /tmp/cly-pub && npm pack --dry-run | tail -8
```

```bash
cd /tmp/cly-pub && npm publish --access public
```

`prepack` runs `npm run build`, so `build/` is compiled from the tagged source
automatically. Add `--otp=<code>` if 2FA is enforced.

Verify:

```bash
npm view countly-mcp-server version
```

### Why this is not automated

OIDC trusted publishing is not available for this package: `countly-mcp-server`
is unscoped and owned by individual maintainer accounts rather than the
`countly` org, and npm only offers trusted-publisher configuration for
org-owned (`@countly/...`) packages.

It *could* be automated with a classic npm **automation token**, which does not
expire and bypasses 2FA. Add it as an `NPM_TOKEN` repo secret, set
`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` on the publish step in
`release.yml`, and change that job's `if:` to also run on tag pushes. The job
is already wired up for everything else.

### Troubleshooting

If `npm whoami` still fails right after `npm login`, check `~/.npmrc` for a
legacy `_auth` line. `npm login` writes `//registry.npmjs.org/:_authToken` and
leaves `_auth` alone, and a stale `_auth` can shadow the new token. Remove that
line and log in again.

## 4. Deploy to `mcp.count.ly`

The host is a GCE VM running two containers (nginx terminating TLS in front of
the MCP server) from a Compose project at `/opt/countly-mcp-server`. It tracks
`:latest`, so a deploy needs no file edits.

Access is IAP-only — there is no public SSH:

```bash
gcloud compute ssh mcp-countly --project=countly-dev-313620 --zone=us-central1-a --tunnel-through-iap
```

Note the current image first, so you have a rollback target:

```bash
sudo docker inspect countly-mcp-server --format '{{.Image}} {{index .Config.Labels "org.opencontainers.image.version"}}'
```

Then pull and roll:

```bash
cd /opt/countly-mcp-server && sudo docker compose pull && sudo docker compose up -d
```

### Verify from outside the box

```bash
curl -s https://mcp.count.ly/.well-known/mcp-manifest.json | jq '{version, tools: .capabilities.tools}'
```

The reported `version` must match the tag you released. If it still shows the
old one, the container did not replace — check `sudo docker compose ps`. Also
worth a look:

```bash
sudo docker compose logs --tail=30 countly-mcp-server
```

### Rollback

Because the Compose file tracks `:latest`, roll back by retagging the previous
digest locally and recreating — no file edit needed:

```bash
sudo docker tag countly/countly-mcp-server@sha256:<previous-digest> countly/countly-mcp-server:latest && sudo docker compose up -d --force-recreate
```

Use the digest captured before the deploy. Every published version also remains
pullable by its own tag.

### Host configuration notes

Two settings on that VM are easy to get wrong and were both wrong before 1.5.0:

- **`COUNTLY_TRUST_PROXY=true` is required.** From 1.3.0 the server rate-limits
  per IP and only reads `X-Forwarded-For` when this is set. Every request
  arrives from the nginx container, so without it the entire internet shares one
  bucket — 120 requests/minute and 50 concurrent connections in total.
- **`COUNTLY_SERVER_URL` should stay unset.** The image already defaults to
  `https://api.count.ly`. It was once set to `https://mcp.count.ly/`, which
  pointed the server at itself for any client that omitted the
  `X-Countly-Server-Url` header.

The production `nginx.conf` and the Compose overrides currently live only on
that VM's disk and are not in version control.
