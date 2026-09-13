# Impro

[![CI](https://github.com/sedatyildiznet/impro/actions/workflows/ci.yml/badge.svg)](https://github.com/sedatyildiznet/impro/actions/workflows/ci.yml)

**All your conversations. One place.**

Impro is an early-stage, self-hosted universal inbox for personal and business messaging. It uses Matrix Synapse and Matrix Authentication Service as its internal backbone, with optional mautrix bridges for external networks. The product UI keeps homeservers, room IDs, and bridge bots out of the way.

> **Project status:** Alpha. Expect breaking changes, incomplete integrations, and manual deployment work. Review the security model before using real accounts or production data.

## Features

- One inbox for personal chats and shared workspace conversations
- Optional WhatsApp, Telegram, Signal, Instagram, Messenger, and Discord bridges
- Private-by-default conversations with explicit workspace sharing
- Assignment, internal notes, tags, saved replies, SLA, and automation models
- Matrix-based identity and message transport behind an Impro-native interface
- Docker Compose deployment with generated secrets and least-privilege database roles

## Architecture

| Component | Purpose |
| --- | --- |
| React + Vite | Web client |
| NestJS + Prisma | API and worker |
| PostgreSQL | Application, Synapse, MAS, and bridge databases |
| Redis | Queues, caching, and coordination |
| Synapse | Matrix homeserver |
| Matrix Authentication Service | Authentication and OAuth |
| mautrix bridges | Optional external network connections |
| Caddy | TLS, routing, and Matrix `.well-known` endpoints |

See [Architecture](docs/ARCHITECTURE.md) for more detail.

## Domain map

The included production configuration targets the following hosts:

| Host | Role |
| --- | --- |
| `impro.chat` | Landing page and Matrix `.well-known` delegation |
| `app.impro.chat` | Web client |
| `api.impro.chat` | Impro API |
| `matrix.impro.chat` | Synapse client and federation endpoint |
| `auth.impro.chat` | Impro authentication service |

Matrix `server_name` is `impro.chat`, so user IDs use `@username:impro.chat`.

## Requirements

For Docker deployment:

- Linux host with Docker Engine and Compose v2
- 2 GB RAM minimum; 4 GB or more recommended
- DNS records for the configured production hosts

For local development:

- Node.js 22 or newer
- pnpm 10

## Quick start

```bash
git clone https://github.com/sedatyildiznet/impro.git
cd impro
cp .env.example .env
./scripts/bootstrap.sh
```

The bootstrap script generates missing secrets, renders private runtime configuration, and starts the core services. Keep the generated `.env`, signing keys, bridge registrations, runtime configs, database files, and backups outside version control.

For production DNS, TLS, upgrades, and recovery procedures, read [Deployment](docs/DEPLOYMENT.md), [Backup](docs/BACKUP.md), and [Upgrade](docs/UPGRADE.md).

### Local development

```bash
pnpm install
pnpm --filter @impro/shared build
pnpm --filter @impro/api typecheck
pnpm --filter @impro/api test
pnpm --filter @impro/web build
```

Use `pnpm seed` only in development. The seed command refuses to run when `NODE_ENV=production`.

## Optional bridges

Start only the bridge profiles you need:

```bash
docker compose --profile telegram up -d
docker compose --profile whatsapp up -d
# Also available: signal, instagram, messenger, discord
```

Telegram requires `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from [my.telegram.org](https://my.telegram.org). Never commit these values or generated bridge configuration files.

Bridge availability and login flows can change upstream. Operators are responsible for reviewing each network's terms and security implications.

## Security and privacy

Impro does not claim end-to-end encryption for bridged or workspace-shared conversations. Those messages may be processed by the bridge and application layers. See [Security](docs/SECURITY.md) for the trust model and vulnerability reporting instructions.

Do not open a public issue containing credentials, access tokens, private logs, message content, or personal data.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Authentication](docs/AUTHENTICATION.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Bridges](docs/BRIDGES.md)
- [Security](docs/SECURITY.md)
- [Backup](docs/BACKUP.md)
- [Upgrade](docs/UPGRADE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Architecture decisions](docs/DECISIONS.md)

## Contributing

Bug reports and focused pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes. Security vulnerabilities must be reported privately as described in [docs/SECURITY.md](docs/SECURITY.md).

## License

No open-source license has been selected yet. Public availability of this repository does not by itself grant permission to copy, modify, or redistribute the code.
