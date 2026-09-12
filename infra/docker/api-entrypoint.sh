#!/bin/sh
set -e
if [ -f prisma/schema.prisma ]; then
  node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss || \
    npx prisma db push --skip-generate || true
fi
if [ "$ROLE" = "worker" ]; then
  exec node dist/worker.js
fi
exec node dist/main.js
