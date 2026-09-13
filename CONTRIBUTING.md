# Contributing to Impro

Thanks for helping improve Impro. The project is in alpha, so focused changes with a clear problem statement are easiest to review.

## Before opening a pull request

1. Search existing issues and pull requests for related work.
2. Keep the change scoped to one concern.
3. Add or update tests when behavior changes.
4. Update documentation for configuration, deployment, or user-visible changes.
5. Confirm that no credentials, private logs, message content, personal data, generated configs, or backups are included.

## Development checks

```bash
pnpm install
pnpm --filter @impro/shared build
pnpm --filter @impro/api typecheck
pnpm --filter @impro/api test
pnpm --filter @impro/web build
docker compose -f docker-compose.yml config
```

Copy `.env.example` to `.env` for local configuration. Never commit the resulting `.env` or generated runtime files.

## Pull requests

Describe what changed, why it changed, how it was tested, and any migration or security impact. Screenshots are useful for visible UI changes, but redact account information and message content.

## Security issues

Do not report vulnerabilities in a public issue. Follow the private reporting instructions in [docs/SECURITY.md](docs/SECURITY.md).

## Licensing

The repository does not currently include an open-source license. Contributions are not accepted under a defined open-source license until the project owner selects one.
