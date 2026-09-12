# Troubleshooting

**Wrong Matrix ID (`@user:matrix.impro.chat`)**  
`server_name` in Synapse and `matrix.homeserver` in MAS must be `impro.chat`. Rebuild configs with `./scripts/bootstrap.sh` only on a **fresh** database — this value cannot be renamed in place.

**Login page not found on impro.chat**  
The app lives at **app.impro.chat**. `impro.chat/login` redirects there.

**MAS health failing**  
Admin/health listen on `:8081`. Logs: `docker compose logs mas`.

**Can't send as a workspace agent**  
The connection owner must have an active Impro session. We do not use Synapse admin login-as.

**Bridge “Setup required”**  
Missing operator credentials (e.g. Telegram API ID). Core chat still works.

**Well-known CORS**  
Client well-known is served from `impro.chat` with `Access-Control-Allow-Origin: *` as required by the spec.
