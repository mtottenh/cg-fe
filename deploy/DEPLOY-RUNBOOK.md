# Deploy runbook — fresh Linode

Exact, ordered steps to stand up the portal on a new Ubuntu 26.04 LTS Linode.
All commands run from the **control machine** (your dev box) unless prefixed
`ssh …`. Paths are relative to `deploy/` unless noted.

The one-line shape: **provision → configure secrets → DNS → build debs →
converge the site → bootstrap admin → wire the scanner/demo-stats → verify.**

---

## 0. Control-machine prerequisites (once)

Install: `ansible-core` (≥2.16), `just`, `gh`, `yq`, Node ≥20 + npm, Rust +
`cargo install cargo-deb`, and an SSH keypair.

```bash
# SSH key used for the box (provisioning injects its .pub)
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519

cd deploy
just galaxy          # installs linode.cloud, community.postgresql, ansible.posix, geerlingguy.postgresql
```

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
| **A domain** you control | your registrar | `portal_domain` in inventory |

The scanner API key and CS2 game id are minted **after** the first converge
(steps 7–8) — you can't know them yet.

## 2. Provision the Linode

```bash
export LINODE_TOKEN=…            # from step 1
just provision                  # creates linode/ubuntu26.04, g6-standard-2, eu-west,
                                # injects ~/.ssh/id_ed25519.pub, writes ansible_host into inventory
```
Note the IPv4 it prints (also now in `ansible/inventory/prod.yml`).
Override region/type/image with e.g. `-e linode_type=g6-standard-4` if you
want more RAM for demo parsing (`ansible-playbook ansible/provision.yml -e …`).

## 3. Configure inventory + vault

```bash
# inventory: set the domain + ACME email (ansible_host was filled by provision)
$EDITOR ansible/inventory/prod.yml
#   portal_domain:   portal.yourdomain.com
#   caddy_acme_email: you@yourdomain.com

# create the encrypted vault from the example and fill the required keys
cp ansible/group_vars/all/vault.example.yml ansible/group_vars/all/vault.yml
$EDITOR ansible/group_vars/all/vault.yml     # set the keys from step 1
ansible-vault encrypt ansible/group_vars/all/vault.yml   # pick a vault password; store it in your password manager
```

**Required vault keys for the base deploy:** `vault_postgres_password`,
`vault_jwt_secret`, `vault_linode_access_key`, `vault_linode_secret_key`,
`vault_steam_api_key`. Leave `vault_portal_scanner_api_key` as-is for now
(minted in step 7); the `vault_steam_bot_*` keys are only needed if you enable
the bots (step 10). `vault.yml` is gitignored and never committed.

`site.yml`'s validation play refuses to run while any `CHANGE_ME` /
`example.com` placeholder remains, so it will tell you if you missed one.

## 4. DNS

Create two A records pointing at the provisioned IP:

```
portal.yourdomain.com.        A   <ipv4>
demos.portal.yourdomain.com.  A   <ipv4>
```
(The `demos.` host fronts the demo-stats service; the API's SSRF guard
requires it to be a real https host.) Wait for propagation before step 6 so
Caddy can get certificates.

## 5. Build the artifacts (control machine)

The `portal-api`, `portal-scanner`, and `portal-demo-stats` debs are built
locally and shipped by Ansible (built for amd64; your dev box and the Linode
are both x86_64). The SPA builds during the converge.

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
(Once you publish tagged GitHub releases with these debs via the `build-deb`
workflow, `just deploy vX.Y.Z` fetches them for you instead — see step 11.)

## 6. First converge — bring the site up

The scanner needs a game id that only exists after the API has migrated the
DB, so the **first** converge deliberately excludes the scanner and
demo-stats. Run it as **root** (only root has an SSH key until `roles/base`
creates the `ops` user):

```bash
API_DEB=$(ls ../api/target/debian/portal-api_*_amd64.deb)

ansible-playbook -i ansible/inventory/prod.yml ansible/site.yml \
  --ask-vault-pass -e ansible_user=root \
  --tags base,postgres,portal_api,portal_web,caddy,backups \
  -e portal_api_deb_path="$API_DEB"
```
This installs base hardening, Postgres 16 (socket-only), the API (migrations
run on boot → seeds the `games` table), the SPA into `/var/www/portal`, Caddy
(auto-HTTPS), and the backup timer. After it finishes, `https://portal.yourdomain.com`
serves the app (login won't work yet — no users).

## 7. Bootstrap the admin + gather scanner config

`portal-cli` now ships in the deb. Connect over the DB's unix socket:

```bash
SOCK='postgres:///portal_prod?host=/var/run/postgresql&user=portal'

# create the first super-admin
ssh ops@<ipv4> "sudo -u portal DATABASE_URL='$SOCK' \
  portal-cli bootstrap admin --username admin --email you@yourdomain.com"
#   (prompts for a password)

# get the CS2 game UUID (needed by the scanner)
just db-shell        # then:  SELECT id, name FROM games WHERE slug = 'cs2';  \q

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
SCAN_DEB=$(ls ../api/target/debian/portal-scanner_*_amd64.deb)

# scanner (now that scanner_game_id is set)
ansible-playbook -i ansible/inventory/prod.yml ansible/site.yml \
  --ask-vault-pass --tags portal_scanner -e portal_scanner_deb_path="$SCAN_DEB"

# demo-stats
just deploy-demo-stats ../demo-stats-service/target/debian/portal-demo-stats_*_amd64.deb
```

## 9. Verify

```bash
just status                                   # all units active
curl -fsS https://portal.yourdomain.com/health && echo OK
curl -fsS https://portal.yourdomain.com/health/ready   # db + demo-service reachability
```
Then in a browser: open the site, click **Sign in through Steam**, confirm
the round-trip lands you signed in (this exercises PORTAL_PUBLIC_URL /
STEAM_API_KEY end to end).

## 10. Optional

**Import the legacy players** (89 accounts from the old cs210mans DB). Copy
the export to the box and run the importer:
```bash
scp ~/tenmans_players.json ops@<ipv4>:/tmp/
ssh ops@<ipv4> "sudo -u portal DATABASE_URL='$SOCK' \
  portal-cli user import-steam --file /tmp/tenmans_players.json"
```
Everyone then signs in through Steam and lands on their imported account.

**Steam match-tracking bots** (cs2-poller + cs2-enricher). Set the
`vault_steam_bot_*` keys (dedicated Steam bot account for the enricher), build
and ship:
```bash
cd ../steam_bot && cargo build --release -p cs2-poller -p cs2-enricher && cargo deb -p cs2-enricher --no-build && cd ../deploy
just deploy-steam-bot ../steam_bot/target/debian/portal-steam-bot_*_amd64.deb
```

## 11. Day-2 operations

```bash
just deploy vX.Y.Z     # once CI publishes a release with the debs (fetches + converges portal_api+scanner)
just deploy-web        # rebuild + ship the SPA after a frontend change
just backup-now        # on-demand pg backup (also nightly at 03:15 + pre-deploy)
just status | logs | tail-errors | installed
just db-shell          # psql over ssh (socket auth, no network password)
```

Full converge later (e.g. after editing roles): `just bootstrap`. Every
`site.yml` run snapshots the DB before migrations, so upgrades are safe to
roll back from the `portal-backups` bucket (restore runbook in `README.md`).

## Notes / rough edges

- **`just deploy` repo slug**: the recipe downloads from
  `community-gaming/gaming-portal`; the actual remote is `mtottenh/cg`. Fix the
  `--repo` in the justfile (or publish under that org) before using the
  release path.
- **Rotate the leaked keys** from the old box (the Object Storage pair and the
  Steam API key were exposed — see `../api/docs/deployment-cs210mans-audit.md`).
- Building the debs on the 2 GB Linode itself is not recommended; build on the
  control machine as above (or in CI).
