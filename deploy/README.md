# deploy/

Operational tooling for the community-gaming-portal. Target: a single
Ubuntu 24.04 Linode running everything — Postgres, the Rust API, Caddy
(TLS + reverse proxy + frontend static serving), the steam bots, and a
pg_dump-to-Linode-Object-Storage backup timer.

## Model

Native `.deb` packages + systemd units + Ansible, **not containers in
prod**. Reasoning:

- Rust binaries are small, statically-linked-ish, and ship as a single
  file. `.deb` gives atomic install/upgrade/rollback via apt, ownership
  tracking via `dpkg -L`, and real rollback via version pinning.
- systemd gives process supervision, journald log aggregation, cgroup
  resource limits, and sandboxing (`ProtectSystem=strict` etc.) with
  zero configuration effort.
- Ansible is push-based and agentless — right-sized for one host, scales
  cleanly to three or four without adopting a whole orchestration
  platform.

Dev uses Docker Compose (`../api/docker-compose.yml`) for a Postgres +
MinIO stack. This directory is prod-only.

## Layout

```
deploy/
├── ansible/
│   ├── ansible.cfg
│   ├── requirements.yml        # Galaxy roles (geerlingguy.postgresql etc.)
│   ├── site.yml                # Top-level: base + postgres + caddy + api + backups
│   ├── inventory/
│   │   └── prod.yml            # Hosts; edit for your Linode public IP
│   ├── group_vars/
│   │   └── all/
│   │       ├── vars.yml        # Non-secret config
│   │       └── vault.yml       # Ansible Vault: secrets (encrypt before commit)
│   └── roles/
│       ├── base/               # User, unattended-upgrades, fail2ban, ufw
│       ├── postgres/           # Postgres + portal role + portal_prod DB
│       ├── caddy/              # Caddy with auto-HTTPS; reverse-proxies API
│       ├── portal_api/         # Installs the portal-api.deb; renders api.env
│       └── backups/            # pg_dump → Linode Object Storage, nightly
├── justfile                    # bootstrap, deploy, db-shell, logs, tail-errors
└── README.md
```

## Flow

Artifacts flow: **tag → CI → release → apt install on box.**

1. `git tag v0.2.1 && git push --tags` in `api/`.
2. `.github/workflows/build-deb.yml` builds `portal-api_0.2.1_amd64.deb`
   and `portal-scanner_0.2.1_amd64.deb`, attaches them to the GitHub
   release.
3. From your laptop: `just deploy v0.2.1`. The justfile downloads the
   debs from the release, `scp`s them to the box, and runs
   `ansible-playbook ... -e portal_api_deb_path=...`.
4. The Ansible role installs with `apt install ./portal-api_*.deb`,
   which triggers the postinst (creates user/dirs, seeds env on first
   install), then systemd reload + restart. The service's startup code
   runs migrations before binding the port.

Rollback: `just deploy v0.2.0` — apt downgrades, postinst re-runs,
service restarts. DB migrations are forward-only, so if v0.2.1 added a
migration the downgrade will run the old binary against the new schema
— keep the schema backwards-compatible with the previous release for
one version, or use expand/contract migrations.

## First-time bootstrap

```bash
# On your laptop, from deploy/
ansible-galaxy install -r ansible/requirements.yml
ansible-vault create ansible/group_vars/all/vault.yml    # see vault.example.yml
just bootstrap                                            # full site play
```

`bootstrap` is idempotent: it's safe to re-run, and it's how you
converge drift. Run it monthly as a habit.

## Daily ops

```bash
just logs                # journalctl -fu portal-api on the box
just tail-errors         # last 200 lines of ERROR/WARN from journald
just db-shell            # psql into portal_prod over SSH
just deploy v0.2.1       # push a release
just status              # systemctl status for all portal-* units
just backup-now          # kick a pg_dump immediately, off-schedule
just ssh                 # plain SSH into the box
```

## Secrets

`ansible/group_vars/all/vault.yml` is an Ansible Vault file. Commit it
encrypted. The password lives in a password manager (or a Linode
metadata entry if you want a CI-readable source). `vault.example.yml`
shows the keys that must be set.

Secrets land on the box in `/etc/portal/api.env` and
`/etc/portal/scanner.env`, both `root:portal 0640`. Nothing writes
secrets to journald, and the env files are listed as `conf-files` in
the debs so upgrades won't clobber them.

## What's not here yet

- Frontend: `../web/dist/` needs an Ansible role that rsyncs the built
  SPA to `/var/www/portal`, served by Caddy. Stub it in
  `roles/portal_web/` when the frontend is production-ready.
- Steam bots (`cs2-poller`, `cs2-enricher`): mirror `portal-scanner`'s
  pattern in their own `../steam_bot/bins/*/Cargo.toml` with
  `[package.metadata.deb]`, then add
  `roles/portal_bots/` that installs all bot debs at once.
- Monitoring: there is no Prometheus yet. When added (see the audit
  report), a `roles/monitoring/` role will install node_exporter +
  Caddy-proxied Grafana.
