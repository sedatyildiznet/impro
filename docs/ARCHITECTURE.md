# Architecture

```
impro.chat            landing + .well-known
app.impro.chat        React web client
        │
api.impro.chat        NestJS Impro API + worker
        │
   postgres / redis / MAS / Synapse
        │
   mautrix bridges (optional compose profiles)
```

## Versions (pinned)

| Component | Image |
| --- | --- |
| Synapse | `matrixdotorg/synapse:v1.160.0` |
| MAS | `ghcr.io/element-hq/matrix-authentication-service:1.24.0` |
| Postgres | `postgres:16.10-alpine` |
| Redis | `redis:7.4.5-alpine` |
| Caddy | `caddy:2.10.0-alpine` |
| mautrix-whatsapp / telegram / signal | `dock.mau.dev/mautrix/*:v26.08` |
| mautrix-meta (Messenger) | `dock.mau.dev/mautrix/meta:v26.08.1` |
| mautrix-instagram | `dock.mau.dev/mautrix/meta:ig-v26.08` |
| mautrix-discord | `dock.mau.dev/mautrix/discord:v26.08` |

## Identity

- MAS is the authentication source of truth (passwords via argon2id).
- Impro PostgreSQL stores product profile, workspaces, shares, notes, search projection.
- Synapse stores Matrix rooms/events. `server_name: impro.chat`.
- Mapping is deterministic: Impro username `alice` → `@alice:impro.chat`.

## Why messages are not fully duplicated

Canonical message bodies live in Synapse. Impro DB keeps:

- conversation metadata
- share/assignment/tag/note state
- a **search projection** (`MessageIndex`) so authorization-aware search does not scrape Synapse

## Business sharing

Workspace agents are **not** invited into the owner's private Matrix room. Sharing is an Impro application-layer view with a history boundary. Delegated replies use the owner's existing Matrix session (encrypted at rest), never Synapse admin login-as.

## Public vs internal

Not exposed on the reverse proxy:

- PostgreSQL, Redis
- `/_synapse/admin/*`
- MAS `/api/admin/*`
- bridge provisioning ports
