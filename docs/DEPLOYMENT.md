# Deployment

## DNS

Point these names at the host:

- `impro.chat`
- `app.impro.chat`
- `api.impro.chat`
- `matrix.impro.chat`
- `auth.impro.chat`

Federation delegation is served at `https://impro.chat/.well-known/matrix/{client,server}` with `m.server = matrix.impro.chat:443`.

## TLS

Production:

```bash
IMPRO_TLS=1
SCHEME=https
CADDY_AUTO_HTTPS=on
ACME_EMAIL=you@impro.chat
./scripts/bootstrap.sh
```

## Sequence

1. Install Docker
2. Clone repo
3. Configure DNS
4. `cp .env.example .env`
5. `./scripts/bootstrap.sh`
6. `docker compose ps`
7. `curl -fsS https://api.impro.chat/health/ready`
8. Sign in at `https://app.impro.chat` as the bootstrap admin
9. Enable a bridge profile when ready

## Compose profiles

`mail`, `whatsapp`, `telegram`, `signal`, `instagram`, `messenger`, `discord`
