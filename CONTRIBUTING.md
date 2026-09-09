# Contributing to Outreach Grader

Thanks for your interest in contributing!

## Before Submitting a PR

For anything beyond a small fix, please [open an issue](https://github.com/michaelinghilterra-creator/outreach-grader/issues) first to discuss the change. This helps align on direction before you invest time coding.

## Quick Start

1. Fork the repo
2. Create a branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run the tests: `npm test`
5. Commit using a [Conventional Commit](https://www.conventionalcommits.org/) message (e.g. `fix: handle empty message body in scorer`) — PR titles are checked for this on merge, since this project uses Release Please for versioning
6. Open a Pull Request referencing the issue

## What to Contribute

**Good first contributions:**
- Bug fixes with a clear repro
- Improvements to the scoring rubric or rewrite quality
- Documentation and screenshot updates

**Bigger contributions:**
- New scoring dimensions
- Frontend UX improvements (`public/`)

## Guidelines

- Keep the tool local-first: no telemetry, no external API calls beyond the
  user's own Claude subscription
- Don't add dependencies without discussing them in an issue first
- Don't commit real outreach messages, names, or contact details in tests or
  fixtures — use fictional data

## Contributor License and Sign-Off (DCO)

Sign off each commit to certify you wrote the change, or have the right to
submit it:

```bash
git commit -s -m "your message"
```

This adds a `Signed-off-by:` line, certifying the
[Developer Certificate of Origin 1.1](https://developercertificate.org/).

By contributing, you agree your contribution is licensed under the project's
[MIT LICENSE](LICENSE). You keep the copyright to your own contribution.

## Need Help?

[Open an issue](https://github.com/michaelinghilterra-creator/outreach-grader/issues).
