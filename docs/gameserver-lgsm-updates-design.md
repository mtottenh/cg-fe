# Game-Server Updates via LinuxGSM — Design and Plan

Status: proposal, written 2026-11-21 from a read-only survey of
`game.cs210mans.uk`. Touches `cg-server-agent`, `cg` (API), `cg-fe` (web) and
`deploy/`. Relates to `plugin-management-design.md` (see §10) and
`server-console-design.md` (same control channel, same permission).

## 1. Goal

Any admin with `admin.servers.manage` can, from the Game Servers page:

1. **Check** whether LinuxGSM itself, the CS2 server build, or the plugin stack
   (Metamod, CounterStrikeSharp, MatchZy) has an update.
2. **Apply** any of those three updates, watch progress, and see the result.
3. Trust that a plugin update **cannot silently break demo upload**, and that a
   plugin stack that fails to load is rolled back.

Out of scope: choosing individual plugin versions (that is
`plugin-management-design.md`), fleet-wide updates, non-LinuxGSM hosts.

## 2. What is on the box today (verified 2026-11-21)

| Fact | Detail |
| --- | --- |
| LinuxGSM | v26.6.0, script `/home/cs2server/cs2server`, user `cs2server`, home is mode 0750 |
| LGSM mods | `metamodsource2`, `counterstrikesharp`, `matchzy` (`lgsm/mods/installed-mods.txt`) |
| Update commands | `update-lgsm`, `check-update`, `update`, `mods-update` — none of them prompt |
| Nightly cron (root) | `cs2-update-and-patch.sh`: `update` + gameinfo.gi repair + restart + verify. Does **not** update LGSM or mods |
| Monitor cron (root) | `cs2server monitor` every 5 min; restarts a crashed server |
| Agent | `portal-server-agent` 0.2.1 as `portal-agent`; unit has `NoNewPrivileges`, `ProtectHome`, `ProtectSystem=strict` |
| Demo-upload source | `/etc/portal/agent/matchzy_portal.cfg`, written once at enrollment, readable by `portal-agent`. The token is recoverable locally forever |
| MatchZy config | `cfg/MatchZy/config.cfg`, with the block between `// BEGIN/END ANSIBLE MANAGED — portal demo upload` appended at the end |

**Why the token disappears.** In LGSM's `mods_list.sh` MatchZy and
CounterStrikeSharp have the update policy `OVERWRITE` (Metamod keeps only
`metaplugins.ini`). `mods-update` extracts the release zip and runs
`cp -Rf` over `serverfiles/game/csgo`, so every file in the zip replaces the
live one: `cfg/MatchZy/config.cfg`, `live.cfg`, `warmup.cfg`, `knife.cfg`,
`prac.cfg`, `dryrun.cfg`, `sleep.cfg`, `live_wingman.cfg`. Files the zip does
not ship survive (`admins.json`, `database.json`, `whitelist.cfg`,
`live_override.cfg`). The `mods-update` run on 2026-11-20 23:30 did exactly
this and the block was pasted back by hand a minute later.

**Three more things that run showed.**

- It moved all three components to latest at once (Metamod git1491, CSS
  1.0.380, MatchZy 0.9.3) and they loaded. That is luck, not a guarantee: the
  September outage was this same "latest of everything" move.
- MatchZy 0.9.3 **renamed cvars** (`matchzy_max_tech_pauses_allowed` →
  `matchzy_max_tech_pauses`, `matchzy_tech_pause_duration` →
  `matchzy_tech_pause_time`, plus new ones). Restoring the old `config.cfg`
  wholesale after an update is therefore wrong; only a block-level re-assert
  is safe.
- LGSM v26.6 `mods-update` now checks the Metamod search path in
  `gameinfo.gi` itself, but `update` (the game build) still strips it.

## 3. Design in one paragraph

A root-owned **update helper** on the game host is the only thing that touches
LinuxGSM. It exposes a closed set of operations, runs each as a transaction
(lock → snapshot → stop → update → reconcile config → start → verify → roll
back on failure) and writes its progress to a state file. The **agent** starts
the helper through systemd, relays progress over the existing mTLS channel and
reports update/config health in its heartbeat. The **API** owns jobs, safety
gates and audit. The **web** shows state, a confirmation plan and live
progress. The nightly cron calls the same helper, so there is one
implementation of "update CS2 safely".

## 4. Game host: the update helper

### 4.1 Privilege boundary

The agent cannot use `sudo` (its unit sets `NoNewPrivileges`) and cannot see
`/home` (`ProtectHome`). Keep both. Instead:

- `/usr/local/sbin/portal-gs-update` — root-owned script, shipped in the agent
  deb.
- `portal-gs-update@.service` — a oneshot template unit; the instance name is
  the operation. `ExecStart=/usr/local/sbin/portal-gs-update %i`.
- A polkit rule allowing user `portal-agent` to `start` units matching
  `portal-gs-update@(check|lgsm|game|mods|all|repair-config).service` and
  nothing else.
- The agent runs `systemctl start --no-block portal-gs-update@mods.service`
  over D-Bus (AF_UNIX is already allowed in its unit).

Nothing from the portal ever reaches a shell: the only input is one word from
a fixed list, and the job id travels in the state file the helper creates.
The job runs outside the agent's process, so it survives an agent restart, a
WebSocket drop and an agent deb upgrade.

Rejected: a sudoers rule (needs `NoNewPrivileges` off), adding `portal-agent`
to the `cs2server` group (broad standing write access to the game tree), a
setuid helper.

### 4.2 Configuration

`/etc/portal/gs-update.conf`, rendered by Ansible from the inventory variables
that already exist (`gameserver_lgsm_script`, `gameserver_lgsm_user`,
`gameserver_gameinfo_path`, `gameserver_lgsm_console_log`,
`gameserver_matchzy_config_path`). No LGSM path is hard-coded in the agent.

### 4.3 Operations

| Operation | What it does | Restarts CS2 |
| --- | --- | --- |
| `check` | Reads installed and latest versions (§4.4). Writes nothing to the game tree | no |
| `lgsm` | `cs2server update-lgsm`, then re-reads the version | no |
| `game` | `cs2server update` (or `force-update`), gameinfo.gi repair, restart if anything changed, verify | only if changed |
| `mods` | The transaction in §4.5 | yes |
| `all` | `lgsm`, then `game`, then `mods`, one restart at the end | yes |
| `repair-config` | §5.1 only: re-assert the managed block, reload MatchZy config | no |

All operations take one `flock` on `/run/portal-gs-update/lock`. The nightly
cron becomes `portal-gs-update game`, and `cs2-update-and-patch.sh` is
retired; its gameinfo.gi patch (CRLF-aware, sanity-gated) moves into the
helper unchanged.

### 4.4 Check: installed vs latest

| Component | Installed | Latest |
| --- | --- | --- |
| LinuxGSM | `version=` in the LGSM script | latest release tag of `GameServerManagers/LinuxGSM` |
| CS2 | `buildid` in `steamapps/appmanifest_730.acf` | `cs2server check-update` (remote build) |
| Metamod | archive name recorded at install, cross-checked with the console version line | `mmsdrop/2.0/mmsource-latest-linux` (the URL LGSM uses) |
| CounterStrikeSharp | recorded release, cross-checked with the `CounterStrikeSharp API <n>` console line | GitHub latest release |
| MatchZy | recorded release, cross-checked with `[MatchZy x.y.z LOADED]` | GitHub latest release |

"Recorded at install" means the helper writes
`/var/lib/portal-gs-update/installed.json` after every successful `mods` run.
Until the first run, versions come from the console log and Metamod shows as
unknown. The check also reports **load health** (the three console lines
above, or `MMS: Fatal error`) and **demo-upload wiring** (§5.1).

### 4.5 The `mods` transaction

```
1. lock
2. snapshot: tar addons/ and cfg/MatchZy/ to /var/lib/portal-gs-update/snapshots/<job>.tar.zst
   (keep the last 3; ~175 MB each today, 35 GB free)
3. cs2server stop            (also stops the monitor cron from restarting it mid-update)
4. cs2server mods-update
5. reconcile config          (§5)
6. assert the Metamod search path in gameinfo.gi
7. cs2server start
8. verify, up to 90 s:  no "MMS: Fatal error", "CounterStrikeSharp.API Loaded
   Successfully", "[MatchZy x.y.z LOADED]", and demo-upload wiring intact
9. on any failure in 4-8: restore the snapshot, start, verify again,
   report rolled_back with the failing console line
10. record installed.json, write the result
```

Verification is behavioural (did the stack load), never "the files landed".
A rolled-back job leaves the server on the previous working set.

### 4.6 State and logs

The helper writes `/run/portal-gs-update/state.json` (mode 0644) atomically at
each phase: `job_id`, `operation`, `phase`, `status`, `started_at`,
before/after versions, the config report (§5.2) and a bounded log tail. Full
output goes to the journal under `portal-gs-update`. Any line containing
`matchzy_demo_upload_header_value` or `rcon_password` is redacted before it
is written anywhere.

## 5. The MatchZy config problem

### 5.1 The portal block is re-asserted from the enrollment snippet

After `mods-update` (and on `repair-config`), the helper rewrites the block
between the existing markers from `/etc/portal/agent/matchzy_portal.cfg`,
appending it if absent. It uses the **same markers as the Ansible
`blockinfile` task**, so a later converge is a no-op rather than a second
block. Because the block is at the end of the file, it overrides the empty
`matchzy_demo_upload_url ""` that the upstream default ships earlier in the
file. The token never leaves the host and is never sent to the portal.

Wiring is then **verified against the running server**, not the file: the
agent reads the `matchzy_demo_upload_url` and
`matchzy_demo_upload_header_key` cvars over local RCON and compares them with
the snippet, and checks the header value is non-empty. It reports
`demo_upload_wired: true|false` in every heartbeat.

This also catches the case this design cannot prevent: someone running
`./cs2server mods-update` over SSH. Within 30 s the portal shows the server
as "demo upload not wired" with a **Repair** button (`repair-config`).
Auto-repair without a click is a policy switch (§11, question 2).

### 5.2 Operator customisations are reported, then moved out of harm's way

Anything else an operator changed in the overwritten files is still lost by
`mods-update`. Two steps:

- **Now (report):** before the update the helper records every cvar in
  `config.cfg` and a hash of each `cfg/MatchZy/*.cfg`. After it, the job
  result lists cvars whose value changed, cvars that no longer exist, and
  files that differed from the new upstream copy. The admin sees
  "`matchzy_kick_when_no_match_loaded` reverted from `false` to `true`"
  instead of finding out during a practice night. The pre-update files stay
  in the snapshot.
- **Next (own the overrides):** the portal stores per-server MatchZy
  overrides (cvar → value) and the helper writes them into the same managed
  block. The upstream file is then never hand-edited, renamed cvars show up
  as "override no longer exists" in the report, and updates stop conflicting
  by construction. `live_override.cfg` is MatchZy's own mechanism for live
  settings and already survives updates.

## 6. Agent (0.3.0)

- **Capability:** the heartbeat gains `capabilities: ["lgsm_update"]` (present
  only when the helper and config exist) so the portal hides the feature for
  older agents and non-LGSM hosts.
- **Heartbeat additions:** `demo_upload_wired`, and `update_job` (id, phase,
  status) while one runs. The last `check` result is sent once when it
  changes, not every 30 s.
- **Commands:** `update_check`, `update_start {operation, job_id}`,
  `update_status`. `update_start` starts the unit and acks immediately; it
  refuses if a job is already running.
- **Progress:** a background task watches the state file and pushes
  `{type: "update_progress", job_id, phase, status, log_tail}` frames, then a
  final `update_result`. The command loop is serial today (a long command
  starves the heartbeat), so the job must never run inside it.
- **Reconnect:** on connect the agent sends the current state file, so a job
  that finished while the channel was down is still recorded.

## 7. API

- **Migration `0100_game_server_updates.sql`:**
  - `game_server_update_jobs`: id, server_id, operation, status
    (`queued|running|succeeded|failed|rolled_back|lost`), requested_by,
    forced, created/started/finished timestamps, phase, before/after versions
    (jsonb), config_report (jsonb), bounded log, error. Partial unique index:
    one non-terminal job per server.
  - `game_servers`: `update_state jsonb` (last check), `update_checked_at`,
    `demo_upload_wired boolean`.
- **Endpoints** (all `admin.servers.manage`, all in OpenAPI):

  ```
  GET  /v1/admin/game-servers/{id}/updates            state, last check, recent jobs
  POST /v1/admin/game-servers/{id}/updates/check      ask the agent to re-check
  POST /v1/admin/game-servers/{id}/updates            {operation, force} -> job
  GET  /v1/admin/game-servers/{id}/updates/{job_id}   progress and result
  POST /v1/admin/game-servers/{id}/updates/repair-config
  ```

- **Safety gates** on start: 409 if no agent or no `lgsm_update` capability;
  409 if a job is running; 409 if the server has a live or imminent
  reservation or humans connected (from the heartbeat's `status`), unless
  `force: true`, in which case the response to the plan names what will be
  interrupted. `lgsm` and `repair-config` skip the players gate (no restart).
- **While a job runs** the server is taken out of allocation (status
  `maintenance`) and returned when the job ends in any terminal state.
- **Lost jobs:** the lifecycle loop marks a job `lost` after 20 minutes with
  no progress frame, and releases the server.
- **Audit:** a `server_events` row for start and finish with the acting admin.

## 8. Web

An **Updates** tab in the server modal on `AdminGameServersPage`:

- Three rows — LinuxGSM, CS2 server, Plugins (Metamod / CSS / MatchZy listed
  beneath) — each showing installed → available, with a load-health chip per
  plugin and a "Demo upload wired" chip.
- **Check now**, **Update** per row, **Update all**.
- Confirmation dialog with the plan: what will change, whether CS2 restarts,
  who is connected, and any live match (with the force checkbox only then).
- Progress: phase stepper plus log tail, polling the job every 2 s.
- Result: versions before/after, the config report from §5.2, and "rolled
  back" shown as a first-class outcome with the console line that caused it.
- On the server list: a badge when an update is available and a warning chip
  when demo upload is not wired, with **Repair**.

## 9. Deploy

`roles/gameserver_agent` renders `gs-update.conf`, drops the legacy wrapper
and repoints the nightly cron at `portal-gs-update game`. The deb ships the
helper, the unit template and the polkit rule. The MatchZy `blockinfile` task
stays as the first-install path.

## 10. Relationship to `plugin-management-design.md`

That design has the portal resolve a compatible version set per host. This
one drives LinuxGSM, which only knows "latest of everything". They are
compatible: this delivers that document's Phase 1 (inventory and load health)
and the execution transaction of its Phase 3, with LGSM as the installer. Its
resolver can later replace step 4 of §4.5 without changing the protocol, API
or UI. Until then the protection against a bad combination is snapshot,
behavioural verify and automatic rollback.

## 11. Open questions

1. **Privilege mechanism:** systemd unit + polkit (proposed) or something
   simpler you already trust on this box?
2. **Auto-repair:** when the agent sees demo upload unwired, repair
   immediately, or show the warning and wait for a click? (Proposed: auto,
   since it restarts nothing and the alternative is silently lost demos.)
3. **Nightly cron:** keep it game-only (proposed), or also take LGSM and
   plugin updates unattended?
4. **Phase 4 overrides:** worth building, or is the §5.2 report enough?

## 12. Plan

Each phase is shippable alone and goes through the commit → adversarial
review → fix loop.

| # | Phase | Repo | Delivers |
| --- | --- | --- | --- |
| 1 | Helper + deploy | `cg-server-agent`, `deploy/` | `portal-gs-update` with all operations, unit, polkit rule, Ansible wiring, cron repointed. Tested in a container against a fake LGSM tree, including the clobber-and-reassert and rollback paths. Usable over SSH immediately |
| 2 | Agent 0.3.0 | `cg-server-agent` | capability, heartbeat fields, three commands, progress frames, reconnect replay |
| 3 | API | `cg` | migration, endpoints, gates, maintenance status, lost-job reaper, audit; integration tests with the fake agent |
| 4 | Web | `cg-fe` | Updates tab, list badges, Repair |
| 5 | Portal-managed MatchZy overrides | all three | §5.2 second step |

Phase 1 alone fixes the token problem for updates run through the helper.
Phases 1-2 together detect it however the update was run.

## 13. Implementation notes (2026-11-21)

Where the build differs from the proposal above. The agent repo's README
("Protocol", "Game-server updates") is the authoritative wire contract.

- **Helper path:** `/usr/sbin/portal-gs-update` (debs do not install to
  `/usr/local`). The unit runs it as `portal-gs-update --unit %i`.
- **Demo-upload wiring is a file-level check, not an RCON read (§5.1).**
  MatchZy's `matchzy_demo_upload_*` are write-only console commands, so they
  cannot be read back. A seventh operation, `verify-config`, compares the
  managed blocks in `config.cfg` with the enrollment snippet and writes
  `/run/portal-gs-update/config.json`; the agent runs it on connect and
  every five minutes and reports `demo_upload_wired` from it.
- **Auto-repair is on by default** (`AUTO_REPAIR` in `gs-update.conf`,
  `gameserver_lgsm_auto_repair` in the inventory), with backoff. The config
  re-read it triggers waits until no match is loaded.
- **Overrides block (§5.2 second step) is in the helper already:**
  `/etc/portal/agent/matchzy_overrides.cfg`, written by the agent from the
  `set_matchzy_overrides` command, becomes a second managed block.
- **Result delivery is at-least-once:** the agent re-sends the last job
  result on every connect until the portal sends `update_ack`.
- **Verified on `game.cs210mans.uk`:** polkit allows `portal-agent` to start
  only the helper's units; a full `mods` transaction ran in 44 s; the game
  server's tmux lands in the game user's logind session scope and survives
  the unit exiting; Ansible's `blockinfile` task is a no-op after the
  helper rewrites the block.
