# syntax=docker/dockerfile:1
FROM node:26.8-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN pnpm install --frozen-lockfile || pnpm install
COPY packages packages
COPY apps/web apps/web
ARG VITE_API_URL
ARG VITE_APP_URL
ARG VITE_SITE_URL
ARG VITE_MATRIX_URL
ARG VITE_AUTH_URL
ARG VITE_SERVER_NAME=impro.chat
ARG VITE_APP_HOST=app.impro.chat
ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_URL=$VITE_APP_URL \
    VITE_SITE_URL=$VITE_SITE_URL \
    VITE_MATRIX_URL=$VITE_MATRIX_URL \
    VITE_AUTH_URL=$VITE_AUTH_URL \
    VITE_SERVER_NAME=$VITE_SERVER_NAME \
    VITE_APP_HOST=$VITE_APP_HOST \
    NODE_OPTIONS=--max-old-space-size=768
RUN pnpm --filter @impro/web build

FROM caddy:2.10.0-alpine
COPY infra/docker/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /usr/share/caddy
EXPOSE 80
