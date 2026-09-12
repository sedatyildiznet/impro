# Backup

```bash
./scripts/backup.sh
./scripts/restore.sh /path/to/backup-dir
```

The archive contains PostgreSQL (`pg_dumpall`), Synapse signing key, MAS keys, bridge registrations, and media.

**Keep `.env` secrets separately.** Losing `APP_ENCRYPTION_KEY` or `MAS_ENCRYPTION_KEY` makes stored tokens and MAS encrypted fields unreadable. `server_name` cannot be changed after the first start.
