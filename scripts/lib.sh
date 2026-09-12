#!/usr/bin/env bash
# Shared helpers for Impro scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

load_env_file() {
  local file="${1:-$ROOT/.env}"
  [[ -f "$file" ]] || return 0
  eval "$(python3 - "$file" <<'PY'
import pathlib, shlex, sys
path = pathlib.Path(sys.argv[1])
for raw in path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, _, value = line.partition("=")
    key = key.strip()
    value = value.strip()
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        value = value[1:-1]
    print(f"export {key}={shlex.quote(value)}")
PY
)"
}
load_env_file

log() { printf '\033[1;36m[impro]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[impro]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[impro]\033[0m %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

rand_hex() {
  local bytes="${1:-32}"
  openssl rand -hex "$bytes"
}

rand_alnum() {
  local len="${1:-32}"
  openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$len"
}

# Crockford ULID (26 chars). Required for MAS client_id values.
new_ulid() {
  python3 - <<'PY'
import os, time
A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
def enc(n, length):
    out = []
    for _ in range(length):
        out.append(A[n & 31])
        n >>= 5
    return "".join(reversed(out))
ts = int(time.time() * 1000)
rand = int.from_bytes(os.urandom(10), "big")
print(enc(ts, 10) + enc(rand, 16))
PY
}

env_set() {
  local key="$1" value="$2" file="${3:-$ROOT/.env}"
  python3 - "$file" "$key" "$value" <<'PY'
import sys, pathlib, re
path, key, value = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text() if path.exists() else ""
pattern = re.compile(rf"^{re.escape(key)}=.*$", re.M)
line = f"{key}={value}"
if pattern.search(text):
    text = pattern.sub(line, text, count=1)
else:
    if text and not text.endswith("\n"):
        text += "\n"
    text += line + "\n"
path.write_text(text)
PY
}

env_get() {
  local key="$1"
  python3 - "$ROOT/.env" "$key" <<'PY'
import sys, pathlib, re
text = pathlib.Path(sys.argv[1]).read_text() if pathlib.Path(sys.argv[1]).exists() else ""
key = sys.argv[2]
m = re.search(rf"^{re.escape(key)}=(.*)$", text, re.M)
print(m.group(1) if m else "")
PY
}

ensure_env_secret() {
  local key="$1" gen="$2"
  local current
  current="$(env_get "$key")"
  if [[ -z "$current" ]]; then
    local value
    value="$(eval "$gen")"
    env_set "$key" "$value"
    log "Generated $key"
  fi
}

render_template() {
  local src="$1" dest="$2"
  python3 - "$src" "$dest" "$ROOT/.env" <<'PY'
import os, sys, pathlib, re
src, dest, envfile = sys.argv[1], sys.argv[2], sys.argv[3]
env = {}
for line in pathlib.Path(envfile).read_text().splitlines():
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    env[k.strip()] = v
text = pathlib.Path(src).read_text()
def repl(m):
    key = m.group(1)
    if key not in env:
        raise SystemExit(f"Missing env {key} while rendering {src}")
    return env[key]
pathlib.Path(dest).write_text(re.sub(r"\$\{([A-Z0-9_]+)\}", repl, text))
PY
}

wait_http() {
  local url="$1" name="$2" tries="${3:-60}"
  local i
  for i in $(seq 1 "$tries"); do
    if curl -fsS -o /dev/null --max-time 3 "$url"; then
      log "$name is healthy ($url)"
      return 0
    fi
    sleep 2
  done
  die "$name failed to become healthy: $url"
}

compose() {
  docker compose -f "$ROOT/docker-compose.yml" --env-file "$ROOT/.env" "$@"
}
