# Upgrade

1. `git pull`
2. Review image pins in `docker-compose.yml` (Dependabot/Renovate open PRs)
3. `./scripts/backup.sh`
4. `docker compose pull`
5. `docker compose up -d --build`
6. `docker compose exec api node dist/migrate.js`
7. `curl -fsS https://api.impro.chat/health/ready`

MAS: `mas-cli database migrate` then `mas-cli config sync` if the config template changed.
