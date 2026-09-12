#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need_cmd docker
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-$ROOT/backups/impro-$STAMP}"
mkdir -p "$OUT"

log "Backing up PostgreSQL (all Impro databases)"
compose exec -T postgres pg_dumpall -U "$POSTGRES_USER" --clean --if-exists > "$OUT/postgres.sql"

log "Archiving Synapse media + signing material (no raw .env)"
tar -C "$ROOT" -czf "$OUT/synapse-data.tgz" infra/synapse/impro.chat.signing.key infra/synapse/homeserver.yaml || true
tar -C "$ROOT" -czf "$OUT/mas-keys.tgz" infra/mas/keys || true
tar -C "$ROOT" -czf "$OUT/bridge-registrations.tgz" \
  infra/bridges/*/registration.yaml infra/bridges/*/config.yaml 2>/dev/null || true

if compose exec -T synapse true >/dev/null 2>&1; then
  compose exec -T synapse tar -C /data -czf - media_store 2>/dev/null > "$OUT/synapse-media.tgz" || true
fi

cat > "$OUT/MANIFEST.txt" <<EOF
Impro backup $STAMP
Includes: postgres dump, synapse signing key, MAS keys, bridge configs, media.
Does not include .env. Keep APP_ENCRYPTION_KEY and MAS_ENCRYPTION_KEY separately — restoring
without them makes encrypted connection material unreadable.
server_name must remain impro.chat
app host is app.impro.chat
EOF

log "Backup written to $OUT"
echo "$OUT"
