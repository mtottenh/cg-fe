# Deploy runbook — fresh Linode

Exact, ordered steps to stand up the portal on a new Ubuntu 26.04 LTS Linode.
All commands run from the **control machine** (your dev box) unless prefixed
`ssh …`. Paths are relative to `deploy/` unless noted.

The one-line shape: **provision → configure secrets → DNS → converge the
site → bootstrap admin → wire the scanner/demo-stats → deploy releases →
verify.**

> **Status of this checkout (2026-07-26):** releases are cut and pinned in
> `versions.yml` (api `v0.2.0`, web `v0.1.0`, demo-stats `v0.2.0`,
> steam-bot `v0.1.0` unpinned/opt-in), and `ansible/group_vars/all/vault.yml`
> is pre-seeded: postgres/JWT/Grafana secrets already generated,
> `backup_age_public_key` already set in `vars.yml` (private key:
> `~/portal-backup.key` in WSL — **move it to the password manager and
> delete it**). What remains for the operator: the step-1 accounts
> (Linode token, Object Storage keys, buckets, Steam key, domain), the
> step-3 inventory values, `ansible-vault encrypt` + optional
> `.vault_pass`, and DNS. Everything after that is `just` recipes.

---

## 0. Control-machine prerequisites (once)

Install: `ansible-core` (≥2.16), `just`, `gh` (authenticated: `gh auth login`),
`yq`, `age` (for `age-keygen`), and an SSH keypair. Node ≥20 + npm and Rust +
`cargo install cargo-deb` are only needed for the local-build fallbacks.

```bash
# SSH key used for the box (provisioning injects its .pub)
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519

cd deploy
just galaxy          # installs linode.cloud, community.postgresql, ansible.posix, geerlingguy.postgresql
just doctor          # checks every tool above and tells you what's missing
```

**Expect:** `just doctor` all-ok except `vault.yml present` (created in
step 3).

## 1. Accounts & keys to capture

Collect these before touching Ansible.

| What | Where to get it | Goes into |
|---|---|---|
| **Linode API token** | cloud.linode.com/profile/tokens — scopes: Linodes **Read/Write**, Object Storage **Read/Write** | `export LINODE_TOKEN=…` (provisioning) |
| **Object Storage key + secret** | Linode → Object Storage → Access Keys → Create | `vault_linode_access_key` / `vault_linode_secret_key` |
| **3 buckets** in `gb-lon-1` | Linode → Object Storage → Create: `portal-evidence`, `portal-demos`, `portal-backups` | (bucket names already in `vars.yml`) |
| **Steam Web API key** | steamcommunity.com/dev/apikey (any domain) | `vault_steam_api_key` |
| **JWT secret** | `openssl rand -hex 32` | `vault_jwt_secret` |
| **Postgres password** | `openssl rand -hex 24` | `vault_postgres_password` |
| **Backup age keypair** | `age-keygen -o portal-backup.key` (control machine) | public key → `backup_age_public_key` in `vars.yml`; **private key → password manager, then delete the file. It must NEVER land on the box** — off-box backups are encrypted to it, and it is the only way to read them |
| **A domain** you control | your registrar | `portal_domain` in inventory |

The scanner API key and CS2 game id are minted **after** the first converge
(steps 7–8) — you can't know them yet.

## 2. Provision the Linode

```bash
export LINODE_TOKEN=…            # from step 1
just provision                  # creates linode/ubuntu26.04, g6-standard-2, eu-west,
                                # injects ~/.ssh/id_ed25519.pub, writes ansible_host into inventory
```

**Checkpoint:** the image slug `linode/ubuntu26.04` follows Linode's naming
convention but was never verified against a live account. If provisioning
fails on the image, list what actually exists and override:
`linode-cli images list | grep ubuntu`, then
`ansible-playbook ansible/provision.yml -e linode_image=…`.

Note the IPv4 it prints (also now in `ansible/inventory/prod.yml`).
Override region/type with e.g. `-e linode_type=g6-standard-4` for more
demo-parsing RAM.

## 3. Configure inventory + vault

```bash
# inventory: set the domain + ACME email (ansible_host was filled by provision)
$EDITOR ansible/inventory/prod.yml
#   portal_domain:   portal.yourdomain.com
#   caddy_acme_email: you@yourdomain.com

# non-secret config: the backup encryption key from step 1
$EDITOR ansible/group_vars/all/vars.yml
#   backup_age_public_key: "age1..."

# create the encrypted vault from the example and fill the required keys
cp ansible/group_vars/all/vault.example.yml ansible/group_vars/all/vault.yml
$EDITOR ansible/group_vars/all/vault.yml     # set the keys from step 1
ansible-vault encrypt ansible/group_vars/all/vault.yml   # pick a vault password; store it in your password manager

# OPTIONAL — unattended runs: drop the vault password in the gitignored
# ansible/.vault_pass (chmod 600). Every `just` recipe then skips the
# interactive prompt, so deploys can be driven end-to-end by tooling.
printf '%s' 'your-vault-password' > ansible/.vault_pass && chmod 600 ansible/.vault_pass
```

**Required vault keys for the base deploy:** `vault_postgres_password`,
`vault_jwt_secret`, `vault_linode_access_key`, `vault_linode_secret_key`,
`vault_steam_api_key`. Leave `vault_portal_scanner_api_key` as-is for now
(minted in step 7); the `vault_steam_bot_*` keys are only needed if you enable
the bots (step 10). `vault.yml` is gitignored and never committed.

`site.yml`'s validation play refuses to run while any `CHANGE_ME` /
`example.com` placeholder remains (or `backup_age_public_key` is empty), so
it will tell you if you missed one.

## 4. DNS

Create two A records pointing at the provisioned IP:

```
portal.yourdomain.com.        A   <ipv4>
demos.portal.yourdomain.com.  A   <ipv4>
```
(The `demos.` host fronts the demo-stats service; the API's SSRF guard
requires it to be a real https host.) A third record —
`agents.portal.yourdomain.com` — is only needed when you enable the
game-server integration (see "Game-server agents" below), and a fourth —
`grafana.portal.yourdomain.com` — only when you enable the monitoring
stack with its default public ingress (`monitoring_enabled=true` +
`monitoring_ingress=public`; with `monitoring_ingress=tailnet` Grafana is
reached over your Tailscale network instead and needs no DNS record — see
deploy/README.md "Monitoring"). Wait for propagation before step 6 so
Caddy can get certificates.

## 5. Get the artifacts

**Preferred: tagged GitHub releases.** Each repo's `build-deb` /
`release-web` workflow runs the test suite, builds the deb, smoke-installs
it on a clean runner, and attaches it with `SHA256SUMS` to the release —
the `just deploy*` recipes download and verify them for you in steps 6–8.
If releases already exist (check `gh release list --repo mtottenh/cg`),
**skip to step 6.**

Current releases: **api `v0.2.0`** (portal-api + portal-scanner debs),
**web `v0.1.0`** (portal-web deb), **demo-stats `v0.2.0`**, **steam-bot
`v0.1.0`** — already pinned in `versions.yml`.

To cut the NEXT release: bump the Cargo version to match, tag, push —

```bash
cd ../api && git tag v0.2.1 && git push --tags        # portal-api + portal-scanner
cd ../demo-stats-service && git tag v0.2.1 && git push --tags
cd ../community_gaming && git tag v0.1.1 && git push --tags   # cg-fe → portal-web
```
(The workflow **refuses a tag that doesn't match the package version** —
`[workspace.package]` in api/Cargo.toml, `version` in the others — so bump
first, tag second. Web is the exception: its deb version comes from the
tag itself.)

<details>
<summary><b>Fallback: build the debs locally</b> (no releases yet, or offline)</summary>

```bash
# in the api repo
cd ../api
cargo build --release -p portal-app -p portal-scanner -p portal-cli
cargo deb --no-build -p portal-app        # → target/debian/portal-api_<ver>_amd64.deb (bundles portal-cli)
cargo deb --no-build -p portal-scanner    # → target/debian/portal-scanner_<ver>_amd64.deb

# demo-stats (sibling repo)
cd ../demo-stats-service
cargo build --release && cargo deb --no-build   # → target/debian/portal-demo-stats_<ver>_amd64.deb
cd ../deploy
```
Then pass the paths by hand where steps 6–8 use the release recipes:
`-e portal_api_deb_path=…` on the step-6 play, and the local-path recipes
`just deploy-demo-stats <deb>` / `just deploy-steam-bot <deb>`. Don't build
on the 2 GB Linode itself.
</details>

## 6. First converge — bring the site up

The scanner needs a game id that only exists after the API has migrated the
DB, so the **first** converge deliberately excludes the scanner and
demo-stats. One recipe does it all (downloads + verifies the api and web
release debs, runs the tagged play as root — only root has an SSH key
until `roles/base` creates the `ops` user):

```bash
just first-converge v0.2.0 v0.1.0     # <api release> <web release>
```
This installs base hardening, Postgres 16 (socket-only), the API (migrations
run on boot → seeds the `games` table), the SPA into `/var/www/portal`, Caddy
(auto-HTTPS), and the three backup timers (nightly dump, weekly config
archive, monthly restore rehearsal).

**Expect:** ~5–10 min. The portal_api role now ends with a health gate
(waits for `:3000` then `/health`), so a converge that exits green means
the API is actually up. After it finishes, `https://portal.yourdomain.com`
serves the app (login won't work yet — no users). If the play fails at the
health gate, `just logs` shows why the new binary won't start.

## 7. Bootstrap the admin + gather scanner config

`portal-cli` ships in the portal-api deb. Connect over the DB's unix socket:

```bash
SOCK='postgres:///portal_prod?host=/var/run/postgresql&user=portal'

# create the first super-admin
ssh ops@<ipv4> "sudo -u portal DATABASE_URL='$SOCK' \
  portal-cli bootstrap admin --username admin --email you@yourdomain.com"
#   (prompts for a password)

# get the CS2 game UUID (needed by the scanner) — non-interactive:
ssh ops@<ipv4> "sudo -u portal psql -d portal_prod -Atc \
  \"SELECT id FROM games WHERE slug = 'cs2'\""
#   (or interactively: just db-shell)

# mint the scanner's service API key
ssh ops@<ipv4> "sudo -u portal DATABASE_URL='$SOCK' \
  portal-cli api-key create --service portal-scanner \
  --permissions demos.write,discovered_matches.write"
#   copy the printed cgp_… key
```

Put the results into config:
```bash
ansible-vault edit ansible/group_vars/all/vault.yml
#   vault_portal_scanner_api_key: "cgp_…"      (the key you just minted)

$EDITOR ansible/group_vars/all/vars.yml
#   scanner_game_id: "<the CS2 uuid>"
```

## 8. Deploy the scanner + demo-stats

```bash
# scanner (now that scanner_game_id is set) — re-uses the api release debs
just deploy v0.2.0

# demo-stats from its release
just deploy-demo-stats-release v0.2.0
```

**Expect:** each recipe downloads the debs, verifies `SHA256SUMS`,
converges, and ends with the role's health gate (scanner: unit active;
demo-stats: `/health` on :3100). `just deploy` also snapshots the DB first
— every deploy does.

## 9. Verify

```bash
just verify        # /health + /health/ready through Caddy, then unit status
```
Then in a browser: open the site, click **Sign in through Steam**, confirm
the round-trip lands you signed in (this exercises PORTAL_PUBLIC_URL /
STEAM_API_KEY end to end). Finally confirm `versions.yml` pins match what
you shipped (`just installed` vs the pins) — they're pre-set to the
current releases.

## 10. Optional

**Import the legacy players** (89 accounts from the old cs210mans DB). Copy
the export to the box and run the importer (`$SOCK` as defined in step 7 —
re-export it if this is a new shell):
```bash
SOCK='postgres:///portal_prod?host=/var/run/postgresql&user=portal'

scp ~/tenmans_players.json ops@<ipv4>:/tmp/
ssh ops@<ipv4> "sudo -u portal DATABASE_URL='$SOCK' \
  portal-cli user import-steam --file /tmp/tenmans_players.json"
```
Everyone then signs in through Steam and lands on their imported account.

**Steam match-tracking bots** (cs2-poller + cs2-enricher). Set the
`vault_steam_bot_*` keys (dedicated Steam bot account for the enricher),
then:
```bash
just deploy-steam-bot-release v0.1.0     # from the cg-steam-bot release
```

**Monitoring stack** (Prometheus + Grafana + Loki — README "Monitoring"
has the full picture). `vault_grafana_admin_password` is already seeded in
the vault; choose the ingress:
```bash
$EDITOR ansible/group_vars/all/vars.yml
#   monitoring_enabled: true
#   monitoring_ingress: public      # + grafana.<domain> DNS A record (step 4)
#                     | tailnet     # + vault_tailscale_auth_key in the vault, no DNS

just bootstrap        # converges the monitoring role + Caddy/tailnet ingress
```
**Expect:** Grafana at `https://grafana.<domain>` (public) or the tailnet
URL, dashboards pre-provisioned; every service's `/metrics` stays
loopback-only.

## 11. Day-2 operations

```bash
just deploy-all        # deploy every pin in versions.yml, then verify
just deploy vX.Y.Z     # api + scanner only
just deploy-web-release vX.Y.Z
just backup-now        # on-demand dump + config archive (also nightly/weekly + pre-deploy)
just backup-list       # local restore points + encrypted bucket copies
just restore-verify    # restore rehearsal on demand (also monthly by timer)
just status | logs | tail-errors | installed | verify
just db-shell          # psql over ssh (socket auth, no network password)
```

Full converge later (e.g. after editing roles): `just bootstrap`. Every
`site.yml` run snapshots the DB before migrations.

## Rollback

Application rollback is just deploying the previous release — the roles
pass `allow_downgrade`, so apt accepts the older deb:

```bash
just deploy vPREV                  # api + scanner binaries roll back
just deploy-web-release vPREV      # SPA rolls back (deb removes newer assets)
```

The **database does not roll back with the binaries** — migrations are
forward-only:

- If the newer version added **no** migration: the plain rollback above is
  complete.
- If it **did**: the older binary will usually run fine against the newer
  schema (columns it doesn't know about), but for a true rollback restore
  the pre-deploy snapshot that every `just deploy` takes:
  `just backup-list`, then `just restore <file>` (local dump) or
  `just restore-remote <name> <age-key-file>` (bucket copy). Both are
  confirm-gated and health-check on completion.

Keep the schema backwards-compatible with the previous release for one
version (expand/contract migrations) so the plain rollback path is always
available.

## Game-server agents (optional, MatchZy integration)

Off by default. To enable match automation on CS2 hosts
(docs/matchzy-integration.md):

1. **DNS**: add `agents.portal.yourdomain.com. A <ipv4>` (third record).
2. **CA init** (once, on the box):
   `ssh ops@<ipv4> "sudo -u portal portal-cli gameserver ca-init --dir /etc/portal/agent-ca"`.
   The CA private key now exists ONLY there — it's covered by the weekly
   `config-backup` timer, and losing it means re-enrolling every agent.
3. **Enable**: set `gameserver_integration_enabled: true` in
   `ansible/group_vars/all/vars.yml`, then `just bootstrap`. This adds the
   `agents.<domain>` Caddy site (mTLS client certs) and the API env.
4. **Each game host**: install `portal-server-agent_*.deb` from the
   `mtottenh/cg-server-agent` release, mint a one-time enrollment token
   (admin UI → Game Servers, or `portal-cli gameserver enroll-token`), then
   on the host: `sudo portal-server-agent enroll --url https://portal.… --token cgs_…`
   and `sudo systemctl start portal-server-agent`. Full prerequisites
   (MatchZy, `-usercon`, GOTV) are in that repo's README.

**Expect:** the server flips `offline → available` in the admin UI on the
first heartbeat (~30 s).

## Notes / rough edges

- **Rotate the leaked keys** from the old box (the Object Storage pair and the
  Steam API key were exposed — see `../api/docs/deployment-cs210mans-audit.md`).
- Building the debs on the 2 GB Linode itself is not recommended; use the
  releases, or build on the control machine (step 5 fallback).
- The backup **age private key** is the single credential that can read
  off-box backups. Password manager only; never the box, never the repo.
