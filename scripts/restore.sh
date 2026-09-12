#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

DIR="${1:-}"
[[ -n "$DIR" && -d "$DIR" ]] || die "Usage: $0 /path/to/backup-dir"
need_cmd docker
[[ -f "$DIR/postgres.sql" ]] || die "postgres.sql missing in $DIR"

warn "This will overwrite live PostgreSQL data."
compose up -d postgres
sleep 5
log "Restoring PostgreSQL"
compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres < "$DIR/postgres.sql"

if [[ -f "$DIR/synapse-data.tgz" ]]; then
  tar -C "$ROOT" -xzf "$DIR/synapse-data.tgz"
fi
if [[ -f "$DIR/mas-keys.tgz" ]]; then
  tar -C "$ROOT" -xzf "$DIR/mas-keys.tgz"
fi
if [[ -f "$DIR/bridge-registrations.tgz" ]]; then
  tar -C "$ROOT" -xzf "$DIR/bridge-registrations.tgz"
fi

log "Restarting core services"
compose up -d synapse mas api worker web proxy
log "Restore complete. Verify health: curl -fsS ${API_URL}/health/ready"
