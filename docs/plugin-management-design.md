# Game-Server Plugin Management — Design

Status: proposal. Written 2026-09-20, after the nine-day CS2 outage described
in §2. Companion to `matchzy-integration.md`, which this extends: that
document gave the portal a control channel to game hosts; this one gives it
authority over what is *installed* on them.

## 1. Goals

1. The portal knows, per game host, which versions of Metamod:Source,
   CounterStrikeSharp and MatchZy are installed, and whether they actually
   **loaded**.
2. The portal can tell an admin "this server needs an update" — and, more
   importantly, "this server must NOT take the newest Metamod".
3. An admin can apply an update from the Game Servers page with one click,
   see a plan before it runs, and have it roll back on its own if the stack
   fails to come up.
4. A compatibility failure discovered on one host protects every other host.

### 1.1 Non-goals

- Managing arbitrary third-party CounterStrikeSharp plugins. Scope is the
  three components the portal depends on for match play.
- Managing the CS2 dedicated server build itself. LinuxGSM already does that
  nightly; this design *reacts* to it (§7.3).
- Replacing `css-release-manager` wholesale. See §11.

## 2. The problem: compatibility, not freshness

Every plugin-stack failure in the September 2026 outage was a **compatibility**
failure. None was "a component was out of date" in isolation:

| Observed | Cause |
| --- | --- |
| `MMS: Fatal error: Detected engine 26 but could not load: undefined symbol: g_bUpdateStringTokenDatabase` | Metamod git1348 (Apr 2025) too old for the current CS2 engine |
| `Plugin uses old SourceHook Metamod build, probably 1.12.x or an early 2.0 version (17 < 18)` | Metamod git1469 too **new** for CounterStrikeSharp v1.0.374 |
| every `css_*` and `matchzy_*` command returning `Unknown command` | a CS2 update stripped the Metamod search path from `gameinfo.gi` |

The middle row is the one that matters for this design. The working set was
**Metamod git1411 + CSS v1.0.374 + MatchZy 0.8.15** — and git1411 is *not*
the newest Metamod. It is the newest Metamod that still exports SourceHook
ABI 17, which is what CSS v1.0.374 was built against. The ABI bumped to 18 at
git1459.

A per-component "is there a newer version?" updater does not merely fail to
help here — **it actively causes the outage**, by taking Metamod to git1469
and breaking a working CSS. The existing tool does exactly that, and its
`-C/--component` flag is ignored, so it can only ever move one component
anyway.

The design consequence: **resolve the whole component set together, and treat
"hold this component back" as a first-class outcome.**

## 3. Architecture overview

The agent reports and executes. The portal decides. The admin approves.

```
game host                          portal                         admin
---------                          ------                         -----
agent ──inventory (heartbeat)──▶   record installed versions
                                   + load health
                                        │
                                   resolve target set
                                   (capabilities + learned
                                    incompatibilities)
                                        │
                                   ◀──── "needs update" ──────▶  Game Servers
                                                                  page
                                                                     │
                                   ◀──────── apply plan ─────────────┘
                                        │
      ◀──update_plan (WSS)──────────────┘
      backup → stop → apply → start
      → verify → rollback on failure
        │
        └──result + new inventory──▶  record; on failure record the
                                      (component, version) pair as
                                      incompatible — fleet-wide
```

Rationale for putting the resolver in the portal rather than the agent:

- Compatibility data lives in one place and is edited once, not per host.
- The admin can see *why* a component is held back before approving.
- The portal knows things the agent cannot: whether a match is live on that
  server right now (§7.4).
- The agent stays a small, auditable executor. It already runs as an
  unprivileged user over mTLS; adding a dependency solver to it widens the
  blast radius for no benefit.

## 4. Inventory reporting

### 4.1 What the agent reports

Extend the existing heartbeat with a `plugin_inventory` block (or a separate
frame on the same WSS channel — the heartbeat is 30s and this changes rarely,
so a separate lower-frequency frame is preferable):

```json
{
  "cs2_build_id": "25218825",
  "gameinfo_patched": true,
  "components": [
    {"name": "metamod",  "version": "2.0.0-git1411", "loaded": true},
    {"name": "cssharp",  "version": "1.0.374",       "loaded": true},
    {"name": "matchzy",  "version": "0.8.15",        "loaded": true}
  ]
}
```

### 4.2 Detection sources

Version detection must not be guessed from directory contents. Authoritative
sources, in order of preference:

| Component | Source |
| --- | --- |
| CS2 build | `steamapps/appmanifest_730.acf` buildid, or LinuxGSM's recorded build |
| Metamod | `addons/metamod/metaplugins.ini` / the `.so` version string; the mmsource tarball name is recorded at install time and is the most reliable |
| CounterStrikeSharp | `addons/counterstrikesharp/api/CounterStrikeSharp.API.dll` assembly version; the release tag recorded at install time preferred |
| MatchZy | recorded release tag; cross-checked against the `[MatchZy x.y.z LOADED]` console line |

Record the installed version **at install time** as the primary source of
truth, and treat on-disk inspection as a reconciliation check. That catches
drift from manual installs (which is how this box ended up with a year-old
stack).

### 4.3 `loaded` is not optional

A correct-looking version set can still fail to load — that is precisely what
`17 < 18` is. The agent must report whether each component actually came up,
parsed from the console log after the most recent start:

- `MMS: Fatal error` → metamod `loaded: false`, carry the message
- `CounterStrikeSharp.API Loaded Successfully` → cssharp `loaded: true`
- `[MatchZy x.y.z LOADED]` → matchzy `loaded: true`
- `[META] Failed to load plugin ... counterstrikesharp: <reason>` → cssharp
  `loaded: false`, **carry the reason verbatim** — §5.3 mines it

This is also the missing monitoring signal: LinuxGSM's `monitor` cron stayed
green through the entire nine-day outage because the process was alive and
rejecting every player.

## 5. Compatibility model

### 5.1 Capabilities, not version pairs

The obvious model — a table of known-good (metamod, cssharp) version pairs —
rots immediately. Metamod ships builds most days; the matrix would need a new
row per build and would be wrong by default for anything not yet tested.

Model the actual constraint instead. Metamod builds *provide* a SourceHook
ABI; CounterStrikeSharp releases *require* one:

```
component_release
  id, component, version, released_at, artifact_url, ...

component_capability          -- what a release PROVIDES
  release_id, key, value      -- ('sourcehook_abi', '17')

component_requirement         -- what a release NEEDS
  release_id, key, op, value  -- ('sourcehook_abi', '=', '17')
                              -- ('cssharp_api',    '>=', '1.0.360')
```

Compatibility becomes a join, and a new Metamod build is automatically
classified the moment its ABI is known — no per-pair curation.

### 5.2 Seeding

Neither project publishes machine-readable ABI metadata, so seed data is
manual and sparse:

- Metamod ≤ git1411 → `sourcehook_abi = 17`
- Metamod ≥ git1459 → `sourcehook_abi = 18` (the mmsdrop listing shows the
  break as a 6.9M → 23M artifact size jump on 2026-09-08)
- CSS v1.0.374 → requires `sourcehook_abi = 17`

Unknown is a real state and must be represented: a release with no capability
recorded is **not** assumed compatible. It is offered only behind an explicit
"try anyway" admin action, which then feeds §5.3.

### 5.3 Learned incompatibility — the part that earns its keep

Because seed data will always be incomplete, the system must learn. The
failure is self-announcing: CounterStrikeSharp names both the ABI it has and
the one it needs, in a parseable line the agent already captures.

On a failed verification (§7.2), the portal records:

```
incompatibility
  component_a, version_a, component_b, version_b,
  evidence,            -- the verbatim console line
  observed_at, host_count
```

and — where the evidence yields it — back-fills the *capability* rather than
just the pair. `(17 < 18)` tells us the installed Metamod provides 18 and that
CSS release requires 17. One host discovers it; the whole fleet is protected,
and the inference generalises to every other release sharing that capability.

This is the difference between a version pinner and something worth building.

### 5.4 Escape hatches

- **Manual pin**: hold a component at a version on a host or globally.
- **Denylist**: mark a release bad regardless of declared capabilities.
- Both are admin-visible and appear in the plan output as the reason for a
  hold, so a pin never looks like a bug.

## 6. Update planning

### 6.1 Resolve the set atomically

For each host, gather candidate releases per component (bounded window — the
newest N per component is ample), then choose the newest assignment that
satisfies every requirement, pin and denylist. The search space is three
components over a handful of candidates: brute force, no solver.

Never resolve or apply one component in isolation. That rule is the whole
lesson of §2.

### 6.2 The plan is the product

Surface the plan before applying, holds included and reasoned:

```
metamod   2.0.0-git1411  →  hold     CSS 1.0.374 requires SourceHook 17;
                                     git1469 provides 18
cssharp   1.0.337        →  1.0.374
matchzy   0.8.13         →  0.8.15
```

"Why is this not updating?" is the question an admin will actually have, and
answering it in the UI is what stops someone hand-installing the newest
Metamod and reproducing the outage.

Server status derives from the same resolution: `up_to_date`,
`update_available`, `held` (newer exists but is incompatible),
`unhealthy` (inventory reports `loaded: false`), `unknown`.

## 7. Execution

### 7.1 Privilege boundary — settle this first

The agent runs as `portal-agent`; the game tree is owned by `cs2server`
(`/home/cs2server/serverfiles/...`, mode 0750). The agent cannot write there
today, and this shapes everything downstream. Options:

1. **Root-owned helper script** invoked by the agent, following the pattern
   already established by `/usr/local/bin/cs2-update-and-patch.sh`. Narrow,
   auditable, no new daemon privileges. **Preferred.**
2. Add `portal-agent` to the `cs2server` group with group-write on the game
   dir. Simpler, broader standing privilege.
3. A setuid helper. Rejected — worst of both.

Option 1 also composes with the existing nightly wrapper, which already does
backup/patch/restart/verify as root.

### 7.2 Update as a transaction

```
1. refuse if a match is live on this server              (§7.4)
2. snapshot: tar addons/ + cfg/MatchZy/ to a backup dir
3. stop the server (LinuxGSM graceful quit)
4. apply every component in the plan
5. re-apply the gameinfo.gi Metamod search path          (§7.3)
6. start the server
7. verify from the console log                           (§4.3)
8. on any failure: restore the snapshot, restart, report
```

Verification is **behavioural, not file-level**. Checking that files landed on
disk is exactly the check that passed while the plugin stack was dead. The
gate is: Metamod has no fatal, CSS logged `Loaded Successfully`, MatchZy
logged `LOADED`. Anything else is a rollback.

Preserve on apply: `cfg/MatchZy/config.cfg` (Ansible writes the demo-upload
block there), `matchzy.db`, `addons/counterstrikesharp/configs/*.json`,
`addons/metamod/metaplugins.ini`. The release archives ship default copies of
several of these and will clobber them given the chance — overwrite binaries,
never overwrite existing config.

### 7.3 gameinfo.gi is part of every update

A CS2 update overwrites `csgo/gameinfo.gi` and strips the
`Game    csgo/addons/metamod` line, which kills the entire stack silently.
Any plugin update must re-assert it, because an update is exactly when the
file gets rewritten. The file is **CRLF**; a patch matching `csgo$` rather
than `csgo\r?$` silently does nothing.

The nightly wrapper already handles the LinuxGSM path; this is the same
operation invoked on a different trigger, and both should call one
implementation.

### 7.4 Match safety

The portal — and only the portal — knows whether a match is reserved or live
on a given server. Updates are refused while one is, queued behind it, or
forced with an explicit admin override that says what it will interrupt. This
is a concrete argument for the resolver living portal-side.

## 8. Data model sketch

```
component                 id, name, kind
component_release         id, component_id, version, released_at, artifact_url,
                          artifact_sha256, source
component_capability      release_id, key, value
component_requirement     release_id, key, op, value
incompatibility           component_a, version_a, component_b, version_b,
                          evidence, observed_at, host_count
server_component_state    server_id, component_id, version, loaded,
                          load_error, observed_at
server_component_pin      server_id, component_id, version, reason
update_job                id, server_id, plan (jsonb), status, started_at,
                          finished_at, log, rolled_back
```

`update_job` is a first-class row because updates take minutes and the UI has
to stream progress, and because a rolled-back attempt is exactly the evidence
§5.3 consumes.

## 9. Portal surface

```
GET  /v1/admin/gameservers/{id}/plugins          current state + resolved plan
POST /v1/admin/gameservers/{id}/plugins/refresh  force an inventory report
POST /v1/admin/gameservers/{id}/plugins/update   apply a plan → update_job
GET  /v1/admin/update-jobs/{id}                  progress / result
POST /v1/admin/component-releases/sync           pull new releases upstream
```

Agent-facing frames on the existing mTLS WSS channel: `plugin_inventory`
(agent → portal), `update_plan` (portal → agent), `update_result`
(agent → portal). Reuse `matchzy-integration.md` §5.2's framing and the
existing command/ack machinery rather than inventing a second protocol.

## 10. Frontend

A **Plugins** panel on the admin Game Servers page:

- per-component current version, available version, and load health
- a status chip driven by §6.2
- held components rendered with their reason inline, not hidden behind a
  tooltip
- an **Update** button opening the plan for confirmation, then streaming
  `update_job` progress
- per-host pin controls for the escape hatches in §5.4

## 11. What to take from `css-release-manager`

Harvest, do not adopt.

**Take**: `css-github` (GitHub release discovery), `css-metamod` (mmsdrop
scraping — there is no API, so this is genuinely useful), and the fetch +
archive-extraction half of `css-installer`.

**Drop**: `css-cli` and `css-storage`'s SQLite bookkeeping. Once the portal
owns state, two of that tool's three defects cease to exist by construction
rather than needing fixes:

- the `backups` table was never created by the production schema (only by test
  fixtures), so the entire backup feature raised `no such table: backups` —
  irrelevant once backups are filesystem snapshots recorded in the portal DB;
- `install_path` was read back out of its own database, and since that column
  holds the component's own directory while archives are rooted at
  `addons/<name>/`, every install nested one level deeper — 229 MB landed in
  `.../addons/counterstrikesharp/addons/counterstrikesharp/` while the tool
  reported success. With the install root coming from configuration there is
  no feedback loop to corrupt.

**Carry forward as a warning**: that tool's tests construct their own schema
instead of the production one, so they passed while production was broken —
in one case in a file named `schema_compliance_tests.rs`. Integration tests
here must exercise the real schema and assert **where files actually land**.

## 12. Risks and open questions

| Risk | Mitigation |
| --- | --- |
| Seed capability data is wrong | Unknown ≠ compatible (§5.2); verification + rollback contains the damage; §5.3 corrects it |
| A bad release breaks every host at once | Roll out per host, not fleet-wide; first failure denylists the release |
| Rollback itself fails | Snapshot is a plain tarball restorable by hand; the job records its path |
| Upstream changes artifact layout | Extraction asserts expected paths post-extract and fails the job rather than writing rubbish |
| MatchZy ↔ CSS API compatibility | Same capability mechanism (`cssharp_api`), but no seed data yet — start by recording observed-good sets |

Open:

1. Should a `held` server be allowed to auto-update the components that *are*
   free to move, or hold the whole set until the blocker clears? (Proposed:
   move what is safe, show the hold.)
2. Auto-apply on a schedule, or always admin-initiated? (Proposed:
   admin-initiated for now; revisit once §5.3 has real data behind it.)
3. Do we mirror artifacts into `portal-demos`' sibling bucket for
   reproducibility, or always fetch upstream at apply time?

## 13. Phasing

1. **Inventory only.** Agent reports versions + load health; portal displays
   it. No updates. Immediately closes the "silently broken for nine days"
   gap and is useful on its own.
2. **Release sync + resolution.** Pull upstream releases, seed capabilities,
   show status and plans. Still no writes to game hosts.
3. **Execution.** The helper script (§7.1), the transaction (§7.2), the
   update button.
4. **Learning.** Incompatibility capture from failed verifications (§5.3).

Phase 1 is worth shipping alone even if nothing after it is built.
