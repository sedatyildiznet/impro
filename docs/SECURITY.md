# Security policy

## Supported versions

Impro is currently an alpha project. Security fixes are applied to the latest revision of the default branch only; older revisions and forks are not supported.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to **support@impro.chat**. Do not open a public GitHub issue for a security problem.

Include, when possible:

- affected component and revision
- reproduction steps or a minimal proof of concept
- expected and observed behavior
- potential impact
- suggested remediation, if known

Do not include real access tokens, passwords, message content, personal data, or production database records. Use synthetic examples and redact logs before sharing them.

## Secret exposure

If a credential is committed or posted publicly, removing the file is not sufficient because Git history and caches may retain it. Revoke or rotate the credential first, then remove it from the repository and, when necessary, rewrite history.

Generated files such as `.env`, Matrix signing keys, MAS keys, bridge configurations and registrations, database dumps, uploaded media, and backups must never be committed.

## Trust model

Impro does **not** claim end-to-end encryption for bridged or workspace-shared conversations. Those messages can be processed by bridges and/or the Impro application layer. Native Matrix encryption must be evaluated separately for each deployment and client path.

Current controls include:

- Argon2id password hashing in MAS
- HttpOnly session cookies
- Helmet and a CORS allowlist
- application and homeserver rate limits
- encrypted connection/session material
- secret redaction for logs
- public proxy restrictions for Synapse and MAS admin APIs
- least-privilege PostgreSQL roles
- explicit workspace-sharing boundaries

See [ADR-005](adr/ADR-005.md) and [ADR-006](adr/ADR-006.md) for related decisions.
