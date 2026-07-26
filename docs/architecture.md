# Architecture overview

Who talks to whom, over what, and where everything runs. Companion docs:
[`matchzy-integration.md`](matchzy-integration.md) (game-server automation
design), [`observability-design.md`](observability-design.md) (metrics/
monitoring), `../deploy/README.md` (ops model), `../deploy/DEPLOY-RUNBOOK.md`
(standing a site up).

## The one-paragraph version

A **single Linode VM** ("the portal box") runs everything user-facing:
Caddy terminates TLS and fronts a Vue SPA, the Rust API, and the demo
parser; Postgres is socket-only; two opt-in Steam bots and a demo scanner
feed the match pipeline. **CS2 game servers** (any host, anywhere) are
integrated *outbound-only* — a small agent dials the portal over mTLS
WebSocket and drives the local server via RCON on localhost, so game hosts
never accept portal-initiated connections and the portal never stores RCON
passwords. **Linode Object Storage** holds evidence, demos, and encrypted
backups. Every service ships as a `.deb` from a test-gated GitHub release
and is converged by Ansible from the operator's **control machine**.

## Topology

```mermaid
flowchart TB
    subgraph ext["External services"]
        steamweb["Steam Web API"]
        steamgc["Steam Game Coordinator"]
        acme["Let's Encrypt"]
        gh["GitHub (repos + release debs)"]
    end

    browser["Player browser<br/>(Vue 3 SPA)"]

    subgraph box["Portal box — Linode g6-standard-2, Ubuntu 26.04 LTS"]
        caddy["Caddy :443<br/>portal.&lt;domain&gt; · demos.&lt;domain&gt;<br/>agents.&lt;domain&gt;* · grafana.&lt;domain&gt;*"]
        api["portal-api :3000<br/>(axum, ~230 endpoints)<br/>bundles portal-cli"]
        pg[("Postgres 16<br/>unix socket ONLY")]
        scanner["portal-scanner<br/>(demo catalog poller)"]
        demostats["portal-demo-stats :3100<br/>(CS2 .dem parser)"]
        poller["cs2-poller*<br/>(share-code discovery)"]
        enricher["cs2-enricher*<br/>(GC match/rank fetch)"]
        backups["backup timers<br/>pg-backup · config-backup ·<br/>pg-restore-verify (age-encrypted)"]
        mon["monitoring*<br/>Prometheus :9090 · Grafana :3001<br/>Loki :3110 · Alloy · exporters"]
    end

    subgraph gamehosts["Game-server hosts — N boxes, operator- or community-owned"]
        agent["portal-server-agent<br/>(systemd, user portal-agent)"]
        cs2["CS2 dedicated server<br/>MatchZy + CounterStrikeSharp<br/>RCON on 127.0.0.1:27015 only"]
    end

    subgraph objstore["Linode Object Storage (gb-lon-1)"]
        evidence[("portal-evidence")]
        demos[("portal-demos")]
        bkts[("portal-backups")]
    end

    browser -- "HTTPS + WSS (lobby/veto)" --> caddy
    browser -- "Steam OpenID sign-in" --> steamweb
    caddy -- "reverse proxy /v1, /health, SPA static" --> api
    caddy -- "demos.&lt;domain&gt; → :3100" --> demostats
    caddy -- "ACME" --> acme

    api -- "unix socket, peer auth" --> pg
    api -- "S3 API (evidence, demo uploads)" --> evidence
    api -- "S3 API" --> demos
    api -- "HTTPS via demos.&lt;domain&gt;<br/>(SSRF guard: public https only)" --> caddy
    api -- "persona/avatar enrichment" --> steamweb

    scanner -- "poll new .dem keys" --> demos
    scanner -- "batch register, cgp_ API key<br/>http://127.0.0.1:3000" --> api
    scanner -- "parsed stats via demos.&lt;domain&gt;" --> caddy

    demostats -- "pull .dem / .dem.bz2" --> demos

    poller -- "share codes (auth-code opt-in)" --> steamweb
    poller -- "http://127.0.0.1:3000/v1, cgp_ key" --> api
    enricher -- "bot account login,<br/>full match + rank/ELO" --> steamgc
    enricher -- "http://127.0.0.1:3000/v1, cgp_ key" --> api

    backups -- "age-encrypted dumps +<br/>/etc/portal archive" --> bkts

    agent -- "outbound WSS + mTLS client cert<br/>agents.&lt;domain&gt; (Caddy client_auth)" --> caddy
    agent -- "Source RCON, localhost only" --> cs2
    cs2 -- "HTTPS: match config GET, event webhooks,<br/>GOTV demo upload (Bearer tokens)" --> caddy
```

\* = opt-in (`portal_steam_bot_enabled`, `monitoring_enabled`,
`gameserver_integration_enabled` in `deploy/ansible/group_vars/all/vars.yml`).

## Who runs where — and why

| Service | Host today | Why there | Where it could move |
|---|---|---|---|
| Caddy | portal box | one TLS/ingress point, four vhosts | stays with the API |
| portal-api (+portal-cli) | portal box | needs the Postgres socket | stays with the DB (or DB moves to a private-net Linode first) |
| Postgres 16 | portal box | socket-only = zero network surface | **first split candidate**: dedicated DB box on a private VLAN when load demands (then api.env's DATABASE_URL goes TCP + TLS) |
| portal-demo-stats | portal box | co-located is simplest; fed from S3 either way | **best split candidate**: parsing holds a whole .dem in RAM (~2 GB spikes); S3-fed, so it can run anywhere `demos.<domain>` can point |
| portal-scanner | portal box | loopback API access; tiny footprint | with the API, or with demo-stats if split |
| cs2-poller / cs2-enricher | portal box | loopback API; tiny | anywhere with HTTPS to the portal (env just needs a public PORTAL_API_URL + key) |
| monitoring stack | portal box | scrapes loopback /metrics | a second box once there is one (Prometheus can scrape over a private net or a tailnet) |
| backup timers | portal box | need the Postgres socket + /etc/portal | inseparable from the DB host |
| portal-server-agent + CS2/MatchZy | **game hosts** (never the portal box) | game servers are wherever the community runs them; integration is outbound-only by design | n/a — this is the point of the agent |
| SPA bundle | portal box (`/var/www/portal`, portal-web deb) | served by Caddy same-origin with the API → no CORS | a CDN later; the bundle is origin-agnostic (relative URLs) |

**The design rule behind the placement:** the portal box only ever
*accepts* connections on 22/80/443, and game hosts accept none from the
portal at all. Everything cross-host is either through Caddy's vhosts or
an outbound call to Steam/S3/GitHub.

## The demo pipeline (worked example)

The flow most new developers ask about first — how a match played on a
community server becomes stats on a profile page:

```mermaid
sequenceDiagram
    participant MZ as MatchZy (game host)
    participant CD as Caddy
    participant API as portal-api
    participant S3 as portal-demos bucket
    participant SC as portal-scanner
    participant DS as portal-demo-stats

    MZ->>CD: POST /v1/gameserver/demos (raw .dem, Bearer token)
    CD->>API: proxy (10-min timeout route)
    API->>S3: put object (DEMO_STORAGE=s3)
    SC->>S3: poll for new keys (every 5 min)
    SC->>API: batch-register discovered demos (cgp_ key)
    DS->>S3: pull .dem, parse (holds file in RAM)
    SC->>CD: GET stats via demos.<domain>
    CD->>DS: proxy → pre-aggregated JSON
    SC->>API: attach parsed stats to the match
    Note over API: results feed the match state machine,<br/>evidence validation, and profile stats
```

The same bucket also receives demos discovered by the Steam bots
(share-code route) — different producer, same consumer chain.

## Match automation (MatchZy integration)

```mermaid
sequenceDiagram
    participant P as Players (SPA)
    participant API as portal-api
    participant AG as portal-server-agent
    participant MZ as CS2 + MatchZy

    P->>API: complete map veto (WSS lobby)
    API->>API: reserve a registered server
    API-->>AG: match_setup command (over the agent's<br/>outbound mTLS WSS channel)
    AG->>MZ: RCON: matchzy_loadmatch_url "<config URL>"
    MZ->>API: GET match config (HTTPS, Bearer)
    MZ->>API: series_start webhook = load ack
    P->>MZ: connect ip:port (connect panel in SPA)
    MZ->>API: going_live / round_end / map_result / series_end webhooks
    API->>P: live scoreboard, then auto result submission
```

Full contract details (webhook quirks, config format, enrollment/mTLS
model): `matchzy-integration.md` §2 and §5.

## Build & deploy path

```mermaid
flowchart LR
    dev["Developer\ngit tag vX.Y.Z"] --> gha["GitHub Actions\ntest → build deb → smoke\ninstall on clean runner"]
    gha -- "only after smoke passes" --> rel["GitHub Release\n*.deb + SHA256SUMS"]
    ctl["Control machine\njust deploy-all\n(versions.yml pins)"] -- "gh release download\n+ sha256sum -c" --> rel
    ctl -- "ansible-playbook\n(apt install, env render,\nhealth gate)" --> box["Portal box"]
    ctl -.-> |"agents install manually\nfrom the release"| gh2["Game hosts"]
```

Five repos produce the artifacts: `cg` (portal-api + portal-scanner debs),
`cg-fe` (portal-web deb + this SPA), `csgo-demo-stats`
(portal-demo-stats), `cg-steam-bot` (portal-steam-bot: both bots),
`cg-server-agent` (portal-server-agent). Tags must equal the package
version — CI refuses otherwise. Rollback = deploy the previous tag
(`allow_downgrade`); the DB never rolls back (forward-only migrations +
pre-deploy snapshots).

## Port & identity registry (portal box)

| Port | Service | Bound to | Auth |
|---|---|---|---|
| 443/80 | Caddy | public | TLS; agents vhost additionally mTLS client certs |
| 22 | sshd | public | keys only; `ops` user |
| 3000 | portal-api | loopback | JWT (users), `cgp_` API keys (services), forwarded client-cert serial (agents) |
| 3100 | portal-demo-stats | loopback | fronted by demos.<domain> |
| 5432 | Postgres | **nothing** (socket only) | peer auth (`portal`, `postgres` unix users) |
| 9090/3001/3110 | Prometheus / Grafana / Loki | loopback | Grafana behind vhost or tailnet |
| 9100/9187 | node/postgres exporters | loopback | scrape-only |
| 9464–9468 | service /metrics (api, scanner, demo-stats, poller, enricher) | loopback | none (loopback) |
| 9469 | agent /metrics (game hosts, local diagnostics) | loopback there | never scraped by the portal |

Unix users on the box: `portal` (api, scanner, demo-stats, bots — shared),
`postgres` (DB + backup dumps), `caddy`, `ops` (operator SSH), plus
`portal-agent` on game hosts. Secrets live in `/etc/portal/*.env`
(root:portal 0640), rendered from the Ansible vault on every converge.
