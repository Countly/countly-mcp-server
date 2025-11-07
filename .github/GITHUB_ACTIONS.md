# GitHub Actions - Docker Hub Publishing

This repository includes a GitHub Actions workflow that automatically builds and publishes Docker images to Docker Hub when you create a new version tag.

## How It Works

The workflow is triggered when you push a tag matching the pattern `v*.*.*` (e.g., `v1.0.0`, `v2.1.3`).

### What the Workflow Does

1. **Checks out the code** from the tagged commit
2. **Sets up multi-platform builds** (amd64 and arm64)
3. **Extracts version** from the git tag (removes the `v` prefix)
4. **Logs in to Docker Hub** using credentials from GitHub Secrets
5. **Builds the Docker image** for multiple architectures
6. **Pushes two tags**:
   - `countly/countly-mcp-server:X.Y.Z` (specific version)
   - `countly/countly-mcp-server:latest` (always points to latest version)
7. **Updates Docker Hub description** with content from DOCKER.md

## Setup Requirements

### 1. Create Docker Hub Access Token

1. Log in to [Docker Hub](https://hub.docker.com)
2. Go to **Account Settings** → **Security**
3. Click **New Access Token**
4. Name: `github-actions-countly-mcp`
5. Permissions: **Read, Write, Delete**
6. Click **Generate** and copy the token (you won't see it again!)

### 2. Add Secret to GitHub Repository

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `DOCKERHUB_TOKEN`
5. Value: Paste the Docker Hub access token
6. Click **Add secret**

### 3. Verify Docker Hub Repository Exists

Ensure the Docker Hub repository exists:
- Repository: `countly/countly-mcp-server`
- If it doesn't exist, create it at https://hub.docker.com

## Creating a Release

### Step 1: Update Version

Update the version in `package.json`:

```json
{
  "version": "1.2.3"
}
```

Commit the change:
```bash
git add package.json
git commit -m "Bump version to 1.2.3"
```

### Step 2: Create and Push Tag

```bash
# Create annotated tag
git tag -a v1.2.3 -m "Release version 1.2.3"

# Push commits and tags
git push origin main
git push origin v1.2.3
```

### Step 3: Monitor Workflow

1. Go to **Actions** tab in GitHub repository
2. Watch the "Build and Push Docker Image" workflow
3. Wait for completion (usually 5-10 minutes for multi-platform builds)

### Step 4: Verify on Docker Hub

Check that the image is published:
```bash
docker pull countly/countly-mcp-server:1.2.3
docker pull countly/countly-mcp-server:latest
```

## Workflow Configuration

### Image Names

The workflow publishes to:
- **Docker Hub**: `countly/countly-mcp-server`

To change the Docker Hub organization/username, edit `.github/workflows/docker-publish.yml`:

```yaml
env:
  DOCKER_IMAGE: your-username/countly-mcp-server
  DOCKERHUB_USERNAME: your-username
```

### Platforms

Currently builds for:
- `linux/amd64` (x86_64)
- `linux/arm64` (ARM 64-bit, Apple Silicon, Raspberry Pi 4+)

To add more platforms, edit the workflow:

```yaml
platforms: linux/amd64,linux/arm64,linux/arm/v7
```

### Caching

The workflow uses Docker layer caching to speed up builds:
- Cache is stored in Docker Hub with tag `:buildcache`
- Subsequent builds reuse unchanged layers
- Significantly reduces build time

## Troubleshooting

### Workflow Fails with "Authentication Required"

**Problem**: Docker Hub credentials are not configured or are invalid.

**Solution**:
1. Verify `DOCKERHUB_TOKEN` secret exists in GitHub
2. Check token hasn't expired
3. Regenerate token if needed
4. Update secret in GitHub

### Build Fails for ARM64

**Problem**: ARM64 builds can be slower or fail due to QEMU emulation.

**Solution**:
1. Check workflow logs for specific errors
2. Consider using native ARM64 runners (GitHub Actions doesn't provide these by default)
3. Or remove arm64 from platforms temporarily

### Image Not Updating on Docker Hub

**Problem**: Image tag exists but not updating.

**Solution**:
1. Check if workflow completed successfully
2. Force pull: `docker pull countly/countly-mcp-server:latest --no-cache`
3. Verify tag was pushed: `git ls-remote --tags origin`

### Description Not Updating

**Problem**: Docker Hub description doesn't match DOCKER.md.

**Solution**:
1. Verify `DOCKERHUB_TOKEN` has write permissions
2. Check DOCKER.md exists in repository root
3. Check workflow logs for description update step
4. May need to manually update first time on Docker Hub

## Manual Publishing

If you need to publish manually without GitHub Actions:

```bash
# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag countly/countly-mcp-server:1.2.3 \
  --tag countly/countly-mcp-server:latest \
  --push \
  .

# Or build locally for testing (single platform)
docker build -t countly/countly-mcp-server:dev .
docker run --rm countly/countly-mcp-server:dev
```

## Version Tagging Best Practices

### Semantic Versioning

Follow [Semantic Versioning](https://semver.org/):
- `v1.0.0` - Major version (breaking changes)
- `v1.1.0` - Minor version (new features, backwards compatible)
- `v1.1.1` - Patch version (bug fixes)

### Tag Format

Always use `v` prefix: `v1.2.3` (not `1.2.3`)

### Changelog

Maintain a CHANGELOG.md file:

```markdown
## [1.2.3] - 2025-10-10

### Added
- New feature X

### Changed
- Improved Y

### Fixed
- Bug Z
```

### Pre-release Versions

For beta/RC versions:

```bash
git tag -a v2.0.0-beta.1 -m "Beta release 2.0.0-beta.1"
git push origin v2.0.0-beta.1
```

These will trigger the workflow but won't update the `latest` tag.

## Security Notes

1. **Never commit Docker Hub credentials** to the repository
2. **Use GitHub Secrets** for all sensitive data
3. **Rotate tokens regularly** (every 6-12 months)
4. **Use minimal permissions** (read/write, not admin)
5. **Monitor workflow runs** for suspicious activity

## Related Documentation

- [Docker Hub Documentation](https://docs.docker.com/docker-hub/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Buildx Documentation](https://docs.docker.com/build/buildx/)
- [Semantic Versioning](https://semver.org/)
