# Security Policy

Security is very important to us. If you discover a security issue in this project, please report it privately by email to security@count.ly, or through GitHub's private vulnerability reporting for this repository, not by opening a public issue or pull request.

# No bug bounty

Countly does not run a bug bounty programme. We do not offer, promise or negotiate payment or rewards for security reports, and a report does not create any obligation to pay. Reports are still very welcome.

# What happens to a report

- **Every report is evaluated.** Each report is recorded and assessed by our team, and confirmed issues are fixed and released according to their severity.
- **Replies are not guaranteed.** Because of the volume of reports we receive, we cannot promise to acknowledge or answer every report, or to give status updates. Not hearing back does not mean a report was not read.
- **Duplicates.** Once a root cause is known to us, further reports of it are recorded against the original assessment.

# How to report

Please include the affected version or commit, the component involved, clear steps to reproduce on a setup you control with a working proof of concept, and what an attacker needs beforehand and what they gain. Send one root cause per report.

Test only against your own setup. Do not test against our hosted, demo or production services or touch data that is not yours, and keep details private until a fix has been released. We will not pursue legal action against good-faith research that follows this policy.

# How we assess reports

Reports are assessed with the severity levels and exclusions in the [Countly Server security policy](https://github.com/Countly/countly-server/blob/master/SECURITY.md). This server acts on a Countly deployment with the credentials it is given, so a finding that requires those credentials, or access the credential holder already has, is not a vulnerability in this project.
