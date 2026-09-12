#!/usr/bin/env bash
# Generate mautrix configs + appservice registrations for Impro.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib.sh"
load_env_file

SECRET="$(env_get BRIDGE_PROVISIONING_SECRET)"
if [[ -z "$SECRET" ]]; then
  SECRET="$(openssl rand -hex 24)"
  env_set BRIDGE_PROVISIONING_SECRET "$SECRET"
fi

setup_one() {
  local name="$1" image="$2" port="$3" bot="$4" dbuser_key="$5" dbpass_key="$6" dbname_key="$7" addr="$8"
  local dir="$ROOT/infra/bridges/$name"
  mkdir -p "$dir"
  local dbuser dbpass dbname
  dbuser="$(env_get "$dbuser_key")"
  dbpass="$(env_get "$dbpass_key")"
  dbname="$(env_get "$dbname_key")"
  if [[ ! -f "$dir/config.yaml" ]]; then
    log "Generating $name config"
    docker run --rm -v "$dir:/data" "$image" || true
  fi
  if [[ ! -f "$dir/config.yaml" ]]; then
    warn "No config for $name"
    return 1
  fi
  python3 - "$dir/config.yaml" "$port" "$bot" "$dbuser" "$dbpass" "$dbname" "$addr" "$SECRET" "$name" <<'PY'
import pathlib, re, sys
path, port, bot, dbuser, dbpass, dbname, addr, secret, name = sys.argv[1:]
t = pathlib.Path(path).read_text()
repls = [
    (r"address: http://example\.localhost:8008", "address: http://synapse:8008"),
    (r"domain: example\.com", "domain: impro.chat"),
    (r"address: http://localhost:\d+", f"address: {addr}"),
    (r"hostname: 127\.0\.0\.1", "hostname: 0.0.0.0"),
    (r"uri: postgres://user:password@host/database\?sslmode=disable",
     f"uri: postgres://{dbuser}:{dbpass}@postgres/{dbname}?sslmode=disable"),
    (r"shared_secret: generate", f"shared_secret: {secret}"),
    (r'"example\.com": user', '"impro.chat": user'),
    (r'"@admin:example\.com": admin', '"@*:impro.chat": user'),
    (r"example.com: as_token:foobar", f"impro.chat: as_token:{secret}"),
    (r"request_full_sync: false", "request_full_sync: true"),
]
t = re.sub(r"(backfill:\n\s+# Whether to do backfilling at all.\n\s+enabled:) false", r"\1 true", t, count=1)
for a,b in repls:
    t = re.sub(a, b, t, count=1)
pathlib.Path(path).write_text(t)
print("patched", name)
PY
  if [[ ! -f "$dir/registration.yaml" ]]; then
    log "Generating $name registration"
    docker run --rm -v "$dir:/data" "$image" || true
  fi
  chmod 644 "$dir/config.yaml" "$dir/registration.yaml" 2>/dev/null || true
}

setup_one whatsapp dock.mau.dev/mautrix/whatsapp:v26.08 29318 whatsappbot MAUTRIX_WHATSAPP_DB_USER MAUTRIX_WHATSAPP_DB_PASSWORD MAUTRIX_WHATSAPP_DB_NAME http://bridge-whatsapp:29318
setup_one telegram dock.mau.dev/mautrix/telegram:v26.08 29317 telegrambot MAUTRIX_TELEGRAM_DB_USER MAUTRIX_TELEGRAM_DB_PASSWORD MAUTRIX_TELEGRAM_DB_NAME http://bridge-telegram:29317
setup_one signal dock.mau.dev/mautrix/signal:v26.08 29328 signalbot MAUTRIX_SIGNAL_DB_USER MAUTRIX_SIGNAL_DB_PASSWORD MAUTRIX_SIGNAL_DB_NAME http://bridge-signal:29328
setup_one instagram dock.mau.dev/mautrix/meta:ig-v26.08 29319 instagrambot MAUTRIX_INSTAGRAM_DB_USER MAUTRIX_INSTAGRAM_DB_PASSWORD MAUTRIX_INSTAGRAM_DB_NAME http://bridge-instagram:29319
setup_one messenger dock.mau.dev/mautrix/meta:v26.08.1 29319 messengerbot MAUTRIX_MESSENGER_DB_USER MAUTRIX_MESSENGER_DB_PASSWORD MAUTRIX_MESSENGER_DB_NAME http://bridge-messenger:29319
setup_one discord dock.mau.dev/mautrix/discord:v26.08 29334 discordbot MAUTRIX_DISCORD_DB_USER MAUTRIX_DISCORD_DB_PASSWORD MAUTRIX_DISCORD_DB_NAME http://bridge-discord:29334

# Telegram API placeholders stay empty; login will fail until operator fills them.
if [[ -n "$(env_get TELEGRAM_API_ID)" ]]; then
  python3 - "$ROOT/infra/bridges/telegram/config.yaml" "$(env_get TELEGRAM_API_ID)" "$(env_get TELEGRAM_API_HASH)" <<'PY'
import pathlib, re, sys
p, api_id, api_hash = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
t = p.read_text()
t = re.sub(r"api_id:.*", f"api_id: {api_id}", t, count=1)
t = re.sub(r"api_hash:.*", f"api_hash: {api_hash}", t, count=1)
p.write_text(t)
PY
fi

python3 - "$ROOT/infra/synapse/homeserver.yaml" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
files = []
root = Path("/root/impro/infra/bridges")
for name in ["whatsapp","telegram","signal","instagram","messenger","discord"]:
    reg = root / name / "registration.yaml"
    if reg.exists():
        files.append(f"  - /bridges/{name}/registration.yaml")
block = "app_service_config_files:\n" + "\n".join(files)
t = p.read_text()
import re
t2, n = re.subn(r"app_service_config_files:.*?(?=\nretention:)", block + "\n\n", t, count=1, flags=re.S)
if n == 0:
    t2 = t.replace("app_service_config_files: []", block)
p.write_text(t2)
print("synapse appservices:\n", block)
PY

log "mautrix configs ready"
