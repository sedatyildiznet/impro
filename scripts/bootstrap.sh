#!/usr/bin/env bash
# Idempotent Impro bootstrap: secrets, configs, keys, compose, migrations, health.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

need_cmd docker
need_cmd openssl
need_cmd python3
need_cmd curl
docker compose version >/dev/null || die "docker compose plugin is required"

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  log "Created .env from .env.example"
fi

load_env_file

[[ "${MATRIX_SERVER_NAME:-}" == "impro.chat" ]] || die "MATRIX_SERVER_NAME must be impro.chat (got '${MATRIX_SERVER_NAME:-}')"
# Local/dev hosts have no public ACME. Force HTTP unless IMPRO_TLS=1.
if [[ "${IMPRO_TLS:-}" != "1" ]]; then
  env_set SCHEME http
  env_set CADDY_AUTO_HTTPS off
  log "TLS disabled (set IMPRO_TLS=1 for Let's Encrypt)"
fi
[[ "${APP_URL:-}" == *"://app.impro.chat"* || "${APP_URL:-}" == *"://app.${DOMAIN}"* ]] || \
  warn "APP_URL should be the web client host (app.impro.chat), currently ${APP_URL:-unset}"

log "Generating missing secrets"
ensure_env_secret POSTGRES_PASSWORD "rand_alnum 32"
ensure_env_secret IMPRO_DB_PASSWORD "rand_alnum 32"
ensure_env_secret SYNAPSE_DB_PASSWORD "rand_alnum 32"
ensure_env_secret MAS_DB_PASSWORD "rand_alnum 32"
ensure_env_secret MAUTRIX_WHATSAPP_DB_PASSWORD "rand_alnum 24"
ensure_env_secret MAUTRIX_TELEGRAM_DB_PASSWORD "rand_alnum 24"
ensure_env_secret MAUTRIX_SIGNAL_DB_PASSWORD "rand_alnum 24"
ensure_env_secret MAUTRIX_INSTAGRAM_DB_PASSWORD "rand_alnum 24"
ensure_env_secret MAUTRIX_MESSENGER_DB_PASSWORD "rand_alnum 24"
ensure_env_secret MAUTRIX_DISCORD_DB_PASSWORD "rand_alnum 24"
ensure_env_secret REDIS_PASSWORD "rand_alnum 32"
ensure_env_secret APP_ENCRYPTION_KEY "rand_hex 32"
ensure_env_secret SESSION_SECRET "rand_hex 32"
ensure_env_secret MAS_MATRIX_SECRET "rand_hex 32"
ensure_env_secret SYNAPSE_MACAROON_SECRET "rand_hex 32"
ensure_env_secret SYNAPSE_REGISTRATION_SHARED_SECRET "rand_hex 32"
ensure_env_secret SYNAPSE_FORM_SECRET "rand_hex 32"
ensure_env_secret MAS_ENCRYPTION_KEY "rand_hex 32"
ensure_env_secret MAS_IMPRO_API_CLIENT_SECRET "rand_alnum 48"
ensure_env_secret BOOTSTRAP_ADMIN_PASSWORD "rand_alnum 20"
ensure_env_secret MAS_IMPRO_API_CLIENT_ID "new_ulid"
ensure_env_secret MAS_IMPRO_WEB_CLIENT_ID "new_ulid"

# Keep DATABASE_URL in sync with generated db password
IMPRO_DB_PASSWORD="$(env_get IMPRO_DB_PASSWORD)"
IMPRO_DB_USER="$(env_get IMPRO_DB_USER)"
IMPRO_DB_NAME="$(env_get IMPRO_DB_NAME)"
env_set DATABASE_URL "postgresql://${IMPRO_DB_USER}:${IMPRO_DB_PASSWORD}@postgres:5432/${IMPRO_DB_NAME}?sslmode=disable"

SCHEME="$(env_get SCHEME)"
DOMAIN="$(env_get DOMAIN)"
env_set SITE_URL "${SCHEME}://${DOMAIN}"
env_set APP_URL "${SCHEME}://app.${DOMAIN}"
env_set API_URL "${SCHEME}://api.${DOMAIN}"
env_set MATRIX_PUBLIC_URL "${SCHEME}://matrix.${DOMAIN}"
env_set AUTH_PUBLIC_URL "${SCHEME}://${DOMAIN:+auth.${DOMAIN}}"
env_set MAS_ISSUER "${SCHEME}://auth.${DOMAIN}/"
env_set APP_HOST "app.${DOMAIN}"

load_env_file

mkdir -p "$ROOT/infra/mas/keys" \
  "$ROOT/infra/synapse" \
  "$ROOT/infra/bridges/"{whatsapp,telegram,signal,instagram,messenger,discord} \
  "$ROOT/infra/caddy/well-known" \
  "$ROOT/data"

chmod 700 "$ROOT/infra/mas/keys" || true
chmod +x "$ROOT/infra/postgres/init.sh"

if [[ ! -f "$ROOT/infra/mas/keys/rsa.pem" ]]; then
  openssl genrsa -out "$ROOT/infra/mas/keys/rsa.pem" 2048 >/dev/null 2>&1
  log "Generated MAS RSA signing key"
fi
if [[ ! -f "$ROOT/infra/mas/keys/ec.pem" ]]; then
  openssl ecparam -name prime256v1 -genkey -noout -out "$ROOT/infra/mas/keys/ec.pem"
  log "Generated MAS EC signing key"
fi
chmod 600 "$ROOT/infra/mas/keys/"*.pem

log "Rendering Synapse + MAS configs"
render_template "$ROOT/infra/synapse/homeserver.yaml.template" "$ROOT/infra/synapse/homeserver.yaml"
render_template "$ROOT/infra/mas/config.yaml.template" "$ROOT/infra/mas/config.yaml"

# Well-known must be served from the server_name domain (impro.chat), not app.
python3 - "$ROOT" "$SCHEME" "$DOMAIN" <<'PY'
import json, pathlib, sys
root, scheme, domain = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
wk = root / "infra/caddy/well-known"
matrix = f"{scheme}://matrix.{domain}"
auth = f"{scheme}://auth.{domain}/"
(wk / "client.json").write_text(json.dumps({
  "m.homeserver": {"base_url": matrix},
  "org.matrix.msc2965.authentication": {
    "issuer": auth,
    "account": f"{auth}account",
  },
  "m.authentication": {
    "issuer": auth,
    "account": f"{auth}account",
  },
}, indent=2) + "\n")
(wk / "server.json").write_text(json.dumps({"m.server": f"matrix.{domain}:443"}, indent=2) + "\n")
PY

# Synapse signing key (ed25519, Synapse format)
if [[ ! -f "$ROOT/infra/synapse/impro.chat.signing.key" ]]; then
  log "Generating Synapse signing key"
  docker run --rm --entrypoint python \
    -v "$ROOT/infra/synapse:/data" \
    matrixdotorg/synapse:v1.160.0 \
    -c "from signedjson.key import generate_signing_key, write_signing_keys
with open('/data/impro.chat.signing.key','w') as f:
    write_signing_keys(f, [generate_signing_key('1')])
print('ok')"
fi

# Local DNS convenience (does not replace production DNS)
if [[ "${IMPRO_WRITE_HOSTS:-1}" == "1" ]]; then
  HOSTS_LINE="127.0.0.1 impro.chat app.impro.chat api.impro.chat matrix.impro.chat auth.impro.chat"
  if [[ -w /etc/hosts ]] && ! grep -q "app.impro.chat" /etc/hosts; then
    echo "$HOSTS_LINE" >> /etc/hosts
    log "Added Impro hosts entries"
  elif grep -q "app.impro.chat" /etc/hosts; then
    log "Hosts entries already present"
  else
    warn "Cannot write /etc/hosts. Add: $HOSTS_LINE"
  fi
fi

log "Validating compose file"
compose config >/dev/null
log "docker compose config: OK"

log "Starting postgres + redis"
compose up -d postgres redis
wait_http() { :; }

# Wait for postgres
for i in $(seq 1 40); do
  if compose exec -T postgres pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
    log "postgres is ready"
    break
  fi
  sleep 2
  [[ "$i" -eq 40 ]] && die "postgres did not become ready"
done

log "Starting synapse + mas"
compose up -d synapse mas

log "Running MAS database migrate + config sync"
compose exec -T mas mas-cli database migrate || compose run --rm --no-deps mas mas-cli database migrate
compose exec -T mas mas-cli config sync || compose run --rm --no-deps mas mas-cli config sync

# Wait for synapse /health and mas /health
python3 - <<'PY'
import time, urllib.request, sys
checks = [
  ("Synapse", "http://127.0.0.1:80/health", {"Host": "matrix.impro.chat"}),
]
# Direct container health via compose is more reliable before proxy is up.
print("waiting for synapse/mas via docker exec")
PY

for i in $(seq 1 60); do
  if compose exec -T synapse python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8008/health')" >/dev/null 2>&1; then
    log "Synapse /health OK"
    break
  fi
  sleep 3
  [[ "$i" -eq 60 ]] && { compose logs --tail=80 synapse; die "Synapse failed health"; }
done

for i in $(seq 1 40); do
  if compose exec -T mas wget -qO- http://127.0.0.1:8081/health >/dev/null 2>&1; then
    log "MAS /health OK"
    break
  fi
  sleep 3
  [[ "$i" -eq 40 ]] && { compose logs --tail=80 mas; die "MAS failed health"; }
done

log "Building and starting api, worker, web, proxy"
compose up -d --build api worker web proxy

log "Applying Impro database migrations"
compose exec -T api node dist/migrate.js || compose exec -T api npx prisma migrate deploy || warn "API migrate will retry after image includes prisma"

ADMIN_USER="$(env_get BOOTSTRAP_ADMIN_USERNAME)"
ADMIN_PASS="$(env_get BOOTSTRAP_ADMIN_PASSWORD)"
ADMIN_EMAIL="$(env_get BOOTSTRAP_ADMIN_EMAIL)"
ADMIN_NAME="$(env_get BOOTSTRAP_ADMIN_DISPLAY_NAME)"
if [[ -n "$ADMIN_USER" && -n "$ADMIN_PASS" ]]; then
  log "Ensuring bootstrap user ${ADMIN_USER} exists in MAS"
  compose exec -T mas mas-cli manage register-user --yes \
    --password "$ADMIN_PASS" \
    --email "$ADMIN_EMAIL" \
    --display-name "$ADMIN_NAME" \
    --admin \
    --ignore-password-complexity \
    "$ADMIN_USER" || warn "register-user returned non-zero (user may already exist)"
else
  log "No BOOTSTRAP_ADMIN_USERNAME set — skipping auto-created admin. Register at ${SCHEME}://app.${DOMAIN}/register"
fi

log "Verifying well-known + Matrix ID convention"
python3 - "$SCHEME" "$DOMAIN" <<'PY'
import json, sys, urllib.request
scheme, domain = sys.argv[1:3]
def get(url, host=None):
    req = urllib.request.Request(url, headers={"Host": host} if host else {})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.load(r)
base = "http://127.0.0.1"
client = get(f"{base}/.well-known/matrix/client", domain)
server = get(f"{base}/.well-known/matrix/server", domain)
hs = client["m.homeserver"]["base_url"]
assert "matrix." + domain in hs, hs
assert server["m.server"].startswith("matrix." + domain), server
print("well-known client:", json.dumps(client, indent=2))
print("well-known server:", json.dumps(server, indent=2))
print("Matrix IDs are @username:" + domain)
PY

log "Bootstrap complete."
log "Landing:  ${SCHEME}://${DOMAIN}"
log "App:      ${SCHEME}://app.${DOMAIN}"
log "API:      ${SCHEME}://api.${DOMAIN}"
log "Matrix:   ${SCHEME}://matrix.${DOMAIN}"
log "Auth:     ${SCHEME}://auth.${DOMAIN}"
