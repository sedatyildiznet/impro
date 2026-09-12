# syntax=docker/dockerfile:1
FROM node:22.17.0-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
WORKDIR /app
COPY packages packages
COPY apps/api apps/api
ENV NODE_OPTIONS=--max-old-space-size=768
RUN pnpm --filter @impro/shared build && pnpm --filter @impro/types build && pnpm --filter @impro/config build
WORKDIR /app/apps/api
RUN pnpm prisma generate && pnpm build

FROM node:22.17.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget openssl libc6-compat \
  && adduser -D -u 1001 impro
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/api/dist /app/dist
COPY --from=build /app/apps/api/package.json /app/package.json
COPY --from=build /app/apps/api/prisma /app/prisma
RUN mkdir -p /app/node_modules/@impro \
  && ln -sfn /app/packages/shared /app/node_modules/@impro/shared \
  && ln -sfn /app/packages/types /app/node_modules/@impro/types \
  && ln -sfn /app/packages/config /app/node_modules/@impro/config
COPY infra/docker/api-entrypoint.sh /app/entrypoint.sh
USER root
RUN chmod +x /app/entrypoint.sh && chown -R impro:impro /app
USER impro
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1
ENTRYPOINT ["/app/entrypoint.sh"]
