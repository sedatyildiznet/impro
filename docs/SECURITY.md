# Security

Trust model:

- Impro is **not** advertised as E2EE for bridged or shared-workspace conversations. Those messages are processed by bridges and/or the Impro application layer.
- Native Impro DMs inherit whatever encryption Synapse/clients negotiate. The UI does not show an “End-to-end encrypted” badge until that path is proven in a given deployment.

Controls in this MVP:

- Argon2id passwords in MAS
- HttpOnly session cookies
- Helmet + CORS allowlist (`APP_URL`, `SITE_URL`)
- Rate limits (Nest throttler + Synapse rc_* + MAS rate_limiting)
- Encrypted connection/session material (`APP_ENCRYPTION_KEY`)
- Secret redaction helper for logs
- Synapse Admin API and MAS admin API blocked on the public proxy
- Least-privilege PostgreSQL roles
- Share boundary so workspace members cannot read unshared private history
- Delegated send is authorized in Impro policy, not via Synapse login-as-user

See also ADR-005 and ADR-006.
