# Security Policy

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Report privately through GitHub's **Private Vulnerability Reporting**: open the
repository's **Security** tab and click **"Report a vulnerability"**
([direct link](https://github.com/michaelinghilterra-creator/outreach-grader/security/advisories/new)).
Include:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

You will receive a response within 72 hours, and we will coordinate a fix before
public disclosure.

## Scope

Security issues in the following are in scope:

- **Server** (`server.mjs`, `lib/`) — injection, path traversal, SSRF, rate-limit bypass
- **Frontend** (`public/`) — XSS via rendered message content or scores
- **Configuration** — secrets exposure, unsafe defaults

## Out of Scope

- Issues in third-party dependencies (report upstream)
- Issues requiring physical access to the user's machine
- Social engineering attacks
- Outreach Grader runs locally against your own Claude subscription — there is
  no hosted multi-tenant service to attack

## Disclosure Policy

We follow coordinated disclosure. Once a fix is released, we will credit the
reporter (unless they prefer anonymity) in the release notes.
