# Impro

**All your conversations. One place.**

Impro is a universal inbox for personal and business messaging. It uses Matrix (Synapse + Matrix Authentication Service) as the hidden backbone and mautrix bridges for external networks. People use Impro — they never see homeservers, room IDs, or bridge bots.

## Domain map

| Host | Role |
| --- | --- |
| `impro.chat` | Marketing / landing + Matrix `.well-known` delegation |
| `app.impro.chat` | Web client (login, inbox, settings) |
| `api.impro.chat` | Impro API |
| `matrix.impro.chat` | Synapse client + federation endpoint |
| `auth.impro.chat` | MAS, branded as Impro authentication |

Matrix `server_name` is **`impro.chat`**. User IDs are always:

```text
@alice:impro.chat
```

Never `@alice:app.impro.chat` or `@alice:matrix.impro.chat`.

## Requirements

- Docker + Compose v2
- DNS A/AAAA for the five hosts above (production)
- 2+ GB RAM (4 GB recommended). Bridges are optional profiles.

## Fresh server

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
git clone <this-repo> impro && cd impro
cp .env.example .env
# edit DOMAIN / ACME_EMAIL if needed
./scripts/bootstrap.sh
docker compose up -d
```

## Restore this server on a new Ubuntu host

The public/private Git repository contains the source, Compose file, Dockerfiles, templates, and scripts. It **does not** contain production data or secrets. The matching backup set was created on 2026-09-12 at `/root/impro-backups/2026-09-12T-backup` on the original host. Copy that entire directory to secure storage **before deleting the original server**; a GitHub push alone is not a complete backup. Check `SHA256SUMS` after transfer. The archive `private-bind-mounts.tar.gz` contains `.env`, Matrix signing key, MAS keys/config, and bridge credentials. Restrict access to it and all backup files.

1. Install Ubuntu, Docker Engine with the Compose plugin, Git, `tar`, `gzip`, and `sha256sum`. Configure DNS A/AAAA records for `impro.chat`, `app.impro.chat`, `api.impro.chat`, `matrix.impro.chat`, and `auth.impro.chat` to point to the new host. Allow TCP 80, 443, 8448 and UDP 443 as needed.
2. Clone the private repository into `/root/impro` and copy the backup set to `/root/impro-backups/2026-09-12T-backup` on the new host. Run `cd /root/impro-backups/2026-09-12T-backup && sha256sum -c SHA256SUMS`.
3. In `/root/impro`, restore the private bind mounts with `tar -xzf /root/impro-backups/2026-09-12T-backup/private-bind-mounts.tar.gz`. Confirm `.env` and `infra/synapse/impro.chat.signing.key` exist. Keep their original values; regenerating secrets breaks existing logins and encrypted data.
4. Run `docker compose config --quiet` to validate the restored `.env` and Compose configuration. Create the service volumes with `docker compose create --no-recreate postgres redis synapse mas api worker web proxy`; this creates containers without starting them.
5. Restore the empty or file-based named volumes before starting services. For each archive `impro_NAME.tar.gz`, locate the matching volume mountpoint with `docker volume inspect impro_NAME --format '{{ .Mountpoint }}'`, then extract the archive into that mountpoint as root with `tar -xzf ARCHIVE -C MOUNTPOINT`. Restore `impro_caddy-data`, `impro_caddy-config`, `impro_media-data`, `impro_redis-data`, and `impro_synapse-data`. The `impro_postgres-data.tar.gz` archive was taken while PostgreSQL was running and is **not** a consistent database restore source; use the SQL dump in step 6.
6. Start only PostgreSQL: `docker compose up -d postgres`. Restore the logical dump to this **fresh** cluster: `gzip -dc /root/impro-backups/2026-09-12T-backup/postgres-all.sql.gz | docker compose exec -T postgres psql -U impro_admin -d postgres`. The dump contains all project databases and roles. It may emit harmless already-exists messages for the initial admin role/database; review the final exit status and database list. Do not run this command against a populated server.
7. Start the remaining core services with `docker compose up -d`. Start the previously enabled bridges with `docker compose --profile discord --profile signal --profile instagram --profile messenger --profile telegram --profile whatsapp up -d`. Check `docker compose ps`, API health, Matrix login/federation, bridge connections, uploaded media, and TLS. Telegram and WhatsApp were stopped at backup time; MAS was unhealthy, so investigate their logs if they remain so.

The PostgreSQL dump and six named-volume archives are all in `/root/impro-backups/2026-09-12T-backup` on the original host, outside this repository. Volume archives of running services are point-in-time file copies; the SQL dump is the authoritative PostgreSQL backup. Preserve the original Matrix server name `impro.chat`.

Local development without public DNS:

```bash
# bootstrap writes 127.0.0.1 app.impro.chat … into /etc/hosts
# and sets SCHEME=http unless IMPRO_TLS=1
./scripts/bootstrap.sh
```

Then open `http://app.impro.chat` (or `http://impro.chat` for the landing page).

## Optional bridges

```bash
docker compose --profile telegram up -d
docker compose --profile whatsapp up -d
# signal, instagram, messenger, discord
```

Telegram also needs `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` from https://my.telegram.org. Without them the UI shows **Setup required** and the rest of Impro keeps working.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Authentication](docs/AUTHENTICATION.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Bridges](docs/BRIDGES.md)
- [Security](docs/SECURITY.md)
- [Backup](docs/BACKUP.md)
- [Upgrade](docs/UPGRADE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Decisions](docs/DECISIONS.md)

## Development

```bash
pnpm install
pnpm --filter @impro/shared build
pnpm --filter @impro/api test
pnpm --filter @impro/web build
pnpm seed   # development only
```

## Product principles

- One Impro account. No separate Matrix account in the UI.
- No Personal Mode / Business Mode. Business tools appear on a conversation after **Share with workspace**.
- Private by default. Workspace owners cannot see unshared chats.
- Share boundary defaults to **from now on**.
- Unified inbox. Platform is a badge, not a folder.
