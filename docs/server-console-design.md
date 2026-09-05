# CS2 Server Console — Design

Status: reviewed 2026-09-05 (fresh-context review; its findings are folded in
and marked **[R]**). Builds on `matchzy-integration.md` (the agent, the
control channel, the map catalogue) and changes all three halves:
`cg-server-agent`, `cg` (API) and `cg-fe` (web).

## 1. What this is for

Admins run the game servers from the portal today only indirectly: the match
flow loads a MatchZy config, the Game Servers page shows a status chip, a
gamestate word and a heartbeat age, and a raw passthrough endpoint exists with
no UI. When a server misbehaves — wrong map, a stuck warmup, a stranger on the
box, a practice night that needs `kick_when_no_match_loaded` off — the answer
is SSH and `rcon`, or nothing.

The console is a modal on the Game Servers page, one per server, that shows
what is on the box right now and lets an admin act on it:

1. **Change map**, from the game's map catalogue, with workshop maps and stock
   maps handled by the right console command, and a free-text fallback.
2. **Run a console command** as an escape hatch, with the output shown.
3. **See who is connected** (name, Steam ID, portal player if known, ping,
   time connected, bot or human) and kick.
4. **Curated actions** for the things admins actually do: pause, unpause,
   force start, end match, restart warmup, kick bots, broadcast a message,
   set the join password, start and stop practice mode, exec a config.

Permission: `admin.servers.manage`, as every other server endpoint. Every
command is audited with the acting admin.

Out of scope: restarting or stopping the CS2 process (the agent does not own
it; hosts start CS2 themselves), file or plugin management, acting on many
servers at once, and any player-facing surface.

## 2. Ground truth this builds on

Verified in the code and in `matchzy-integration.md` §2, §5 and §13.

**Control channel.** The agent keeps one outbound mTLS WebSocket to the portal
and answers command frames `{id, cmd, args}` with `{id, ok, output|error}`.
Commands today: `load_match`, `end_match`, `status` (which runs
`get5_status`; the CS2 `status` command has to go as `exec {command:
"status"}`, which is also what keeps 0.1.x agents usable), `load_backup`,
`roster_edit`, and `exec`, which sends the string in `args.command` to RCON
unchanged. The API side (`AgentConnectionManager`) fails fast with 409 when
no agent is connected and times a command out after 10 s (`COMMAND_TIMEOUT`).
**The agent is serial [R]:** `connect_and_serve` awaits each frame inside its
`select!`, so commands queue one behind another and the 30 s heartbeat tick
is starved while a command runs; `rcon::exec` allows 5 s per I/O step, so a
hung `status` can hold the agent for ~15 s while the API has already given
up at 10 s. Anything this design sends must be cheap and rare. Every 30 s the
agent sends a heartbeat carrying `agent_version`, `rcon_ok` and the raw
`get5_status` JSON, which the registry stores as `last_gamestate`,
`agent_version`, `last_heartbeat_at`; `rcon_ok: false` flips the server to
`Error`.

**Passthrough.** `POST /v1/admin/game-servers/{id}/command` already sends an
`Exec` frame, logs a tracing line (with the full command, so a raw
`sv_password x` lands in the log unmasked), and writes a `server_events` row
of type `admin_command` — but only when a live reservation exists, and even
then only once: `uq_server_events_dedupe` is `(reservation_id, event_type,
map_number, round_number)` with an `ON CONFLICT DO NOTHING` insert, so the
second command in a reservation is silently dropped **[R]**. No UI calls it.

**Allocation.** A server is allocatable on a fresh heartbeat with gamestate
`none` (`is_allocatable`), and a live reservation whose server reports `none`
is retried by the reservation pass (`EndMatch` then `LoadMatch`). The
structured way out of a live match is `cancel_assignment`: `EndMatch`,
release the reservation as `Cancelled`, broadcast. Bookings
(`POST /v1/admin/game-servers/{id}/bookings`) hold a server out of allocation
for a window **[R]**.

**Maps.** The catalogue lives in `games.available_maps` as `MapInfo {id,
display_name, engine_name?, external_id?, external_url?, game_modes}`, served
by `GET /v1/games/{game_id}/maps`. `external_id` present means a workshop
map. The match-config builder already encodes the loading rule: emit the
workshop id when present, else `engine_name`, else `id`
(`matchzy_map_tokens`).

**What MatchZy and CS2 give us.** `get5_status` has gamestate, match id, map
number, round number and per-team scores, but no map name, and
`connected_clients` is always −1. `host_workshop_map <id>` downloads on demand
and changes level; it returns immediately while the download runs.
`changelevel <name>` silently does nothing for a map the server lacks.
`css_endmatch`, `css_start`, `css_pause`, `css_unpause` are RCON-able.
Managed servers run with `matchzy_kick_when_no_match_loaded true`, which
means nobody can stay connected between matches unless it is turned off —
that is what a practice night needs.

**Portal-owned cvars.** `is_portal_owned_cvar` in the CS2 plugin already
names the surface a tournament override must not touch: `sv_password`,
`rcon_password`, `tv_password`, `matchzy_remote_*`,
`matchzy_demo_upload_*`.

## 3. The modal

Opened from a labelled **Console** action on each row of Admin → Game
Servers (the row actions get the same treatment as the league tables:
Console · Edit · Enroll · Bookings · ⋮ Revoke / Delete). Also linkable from
the match page's server panel for admins, later.

```
┌ Console — eu-west-1 · de_mirage ───────────────────────────── ✕ ┐
│ ● In match  agent 0.2.0 · heartbeat 4 s ago · rcon ok   [Refresh] │
│ Autumn Cup · Signal Loss 1 – 0 Packet Storm · map 2 · round 7    │
├───────┬─────┬─────────┬─────────┐                                 │
│ Now   │ Map │ Players │ Console │                                 │
├───────┴─────┴─────────┴─────────┴────────────────────────────────┤
│ Now:   [Pause] [Unpause] [Force start] [End match…]               │
│        [Restart warmup] [Kick bots] [Broadcast…] [Password…]       │
│        Practice mode  ○ off  — turns off roster kicking, loads cfg │
│ Map:   Current: de_mirage   Catalogue ▾ [Ancient · Anubis · …    ] │
│        Other: [workshop link, id or map name      ] [Change map]   │
│        A match is loaded — changing map ends it. Download can take │
│        minutes for a workshop map; the header updates when it lands│
│ Players: name · portal player · Steam ID · ping · loss · connected │
│        BOT rows greyed; [Kick…] per human                          │
│ Console: [> mp_warmuptime 60                   ] [Send]            │
│        output pane (monospace, newest at bottom, last 50 results)  │
│        refused commands explained inline                           │
└───────────────────────────────────────────────────────────────────┘
```

Behaviour that matters:

- The header and the tab contents come from one **snapshot** call, fed by
  the last heartbeat. The modal refreshes it every 30 s (the heartbeat
  cadence) while open and stops when the tab is hidden; it goes **live**
  (one `exec status` frame) only on the Refresh button and right after an
  action, because the agent is serial and a chatty poll would queue behind
  every real command **[R]**.
- **Change map** is confirm-gated whenever the gamestate is not `none` **or a
  reservation exists** (`warmup` means a match is loaded) **[R]**, and the
  confirmation says the match will be cancelled. After sending, the Map tab
  shows "changing…"; a level change makes RCON unreachable for a few seconds,
  so an `rcon_ok: false` heartbeat within 60 s of a map command reads as
  "changing…", not "RCON down" **[R]**. Success is the snapshot's map equal
  to the target's engine name, comparing the last path segment because
  `status` may print a path for workshop maps; the tab warns after 20 s of no
  change on a stock map ("the server did not change map — is it installed?")
  and after 3 min on a workshop map.
- **Players** rows join the Steam ID to the portal's players table, so a
  known player shows their portal name and a link; strangers show only the
  Steam ID. Kick asks for a reason and confirms.
- **Console** keeps a session history (up arrow), shows both the command and
  its output, and explains refusals ("`rcon_password` is portal-owned").
- Every destructive action (end match, kick, change map mid-match, set
  password) goes through the existing confirm dialog convention.
- With the agent offline the modal still opens: it shows the last heartbeat
  and disables every action with "agent offline since …".

## 4. Agent: `portal-server-agent` 0.2.0

Two changes, both backward compatible with a 0.1.x portal.

**Richer heartbeat.** Alongside `get5_status`, run `status` and forward its
raw output, bounded to 8 KiB, as `status_output`. One extra RCON round-trip
per 30 s. The agent does not parse it: the format belongs to CS2, and keeping
the knowledge in one testable place (the API's CS2 plugin) means a format
change is one fix, not a fleet upgrade.

```json
{"type":"heartbeat","agent_version":"0.2.0","rcon_ok":true,
 "get5_status":{...},"status_output":"hostname: ...\nmap : de_mirage\n..."}
```

**Refusals for `exec`.** One command per frame: a raw command containing
`;` or any control character (including `\r`, which `console_quote` misses
today **[R]**) is refused outright, and curated multi-step actions are sent
as separate frames, so the check sees single commands. The frame is refused
when its first token is one of: `rcon_password`, `sv_rcon_*`,
`sv_password`, `tv_password`, `matchzy_remote_*`, `matchzy_demo_upload_*`,
`matchzy_loadmatch_url`, `matchzy_loadmatch`, `matchzy_loadbackup_url`,
`alias` (it would let a later command invoke a denied one under a new name),
`exec` (reads any cfg on the box; the curated `exec_cfg` is the way),
`host_writeconfig`, `logaddress_*`, `sv_downloadurl`, `quit`, `exit`,
`_restart`, `killserver`, `crash` **[R]** (the CS2-specific entries to be
verified against a dedicated server's console). The result is `{ok:false,
error:"refused: rcon_password is portal-owned"}`. The API applies the same
list first (§5); the agent's copy is defence in depth, so a portal bug cannot
rotate the RCON password, repoint the webhooks, or drop the box out from
under a match.

Metrics: `agent_rcon_commands_total{command}` keeps labelling `exec` as
`exec`, never the command text.

## 5. API: `cg` 0.7.0

### 5.1 Parsing `status` — `portal-plugins::games::cs2::console`

```rust
pub struct ServerStatus {
    pub hostname: Option<String>,
    pub map: Option<String>,            // engine name, e.g. "de_mirage"
    pub humans: Option<u32>, pub bots: Option<u32>, pub max_players: Option<u32>,
    pub players: Vec<ConnectedPlayer>,
}
pub struct ConnectedPlayer {
    pub userid: u32, pub name: String,
    pub steam_id64: Option<String>,     // resolved from STEAM_x:y:z or [U:1:n]
    pub bot: bool, pub connected_secs: Option<u32>,
    pub ping: Option<u32>, pub loss: Option<u32>, pub state: Option<String>,
}
pub fn parse_status(output: &str) -> ServerStatus
```

Lenient by construction: header lines are matched by prefix (`map :`,
`players :`, `hostname:`), player lines by a `#`-prefixed row containing a
Steam ID or `BOT`; anything unrecognised is ignored, and the raw text is kept
on the snapshot so the UI can show it when parsing yields nothing. Unit tests
run against captured CS2 `status` dumps (one from a real server is a
prerequisite for implementation — see §10).

### 5.2 Heartbeat enrichment

`portal-domain` depends only on `portal-core`, so the parser cannot live
under `record_heartbeat` **[R]**. The API's `handle_agent_message`, which
already extracts the gamestate from the heartbeat, parses `status_output`
and extends `HeartbeatUpdate` / `RecordHeartbeat` with `last_map`,
`last_player_count`, and the **raw** `status_output` (≤ 8 KiB, player IP
addresses redacted) plus `last_status_at` — migration
`0097_game_server_console.sql`, four nullable columns. Storing the raw text
is what lets the offline modal show the last known players, and what makes
"a format change is one fix" true for rows already stored. `GameServerResponse`
gains `last_map`, `last_player_count`, `last_status_at`; "this agent sends
status" is derived from `last_status_at` being set, not from a version
number **[R]**.

### 5.3 Endpoints (all `admin.servers.manage`)

`GET /v1/admin/game-servers/{id}/console` — a snapshot from the stored
heartbeat: gamestate, `get5_status`, the parsed `status_output`, the live
reservation if any. `?live=true` sends one `exec status` frame first and
parses its output (10 s timeout; on timeout the stored data is returned with
`live: false`). `get5_status` is never fetched live — the heartbeat has it
and the agent is serial **[R]**. Shape:

```json
{"agent": {"connected": true, "version": "0.2.0", "heartbeat_at": "…", "rcon_ok": true},
 "gamestate": "live", "get5_status": {…},
 "status": {"map": "de_mirage", "humans": 10, "bots": 0, "max_players": 12,
            "players": [{"userid": 3, "name": "…", "steam_id64": "7656…", "bot": false,
                         "ping": 31, "loss": 0, "connected_secs": 412,
                         "player": {"id": "…", "display_name": "…"}}]},
 "reservation": {"match_id": "…", "tournament_slug": "…", "kind": "match"} ,
 "raw_status": "…"}
```

The `player` sub-object comes from joining `steam_id64` to
`players.steam_id_64` (bigint), the canonical column **[R]**; `status` rows
are parsed without the `adr` field, so no IP address reaches the response
or the store **[R]**.

`POST /v1/admin/game-servers/{id}/console/map` with
`{"map_id": "<catalogue id>"}` or `{"custom": "<name | workshop id | workshop URL>"}`
and optional `"force": true`. Resolution, reusing the config builder's rule:
catalogue entry with `external_id` → `host_workshop_map <id>`; else
`changelevel <engine_name ?? id>`. `custom` parses a workshop URL or a bare
numeric id to `host_workshop_map`, anything else to `changelevel` after the
same charset check the builder applies to map tokens. Refused with 409 when
the server has a reservation in `pending | configuring | ready | live` and
`force` is not set. With `force`, the handler goes through
`cancel_assignment` first — `EndMatch`, reservation released as `Cancelled`
with the admin named as the reason, participants notified — and only then
changes level; a bare `changelevel` under a live reservation would leave the
reservation live, the next heartbeat would mark the server available and
the reservation pass would load the match straight back on top **[R]**. A
map change also places a short **hold** (a 5-minute booking, 10 for a
workshop map) so the allocator does not hand the server out mid-download
**[R]**. The response carries `{"command": "…", "output": "…", "target":
{"engine_name": "…"}, "cancelled_reservation": …}`.

`POST /v1/admin/game-servers/{id}/console/action` with
`{"action": "pause" | "unpause" | "force_start" | "end_match" |
"restart_warmup" | "kick_bots" | "broadcast" | "set_password" |
"kick_player" | "practice_start" | "practice_stop" | "exec_cfg", "args": {…}}`.
The mapping lives in one table in the handler, each console line is its
own agent frame, arguments are quoted by an API-side `console_quote` (placed
beside `matchzy_map_tokens`, rejecting `"`, `;` and every control character)
**[R]**, and `end_match`, `set_password` and `kick_player` are refused
without `"confirm": true`. `end_match` with a live reservation runs
`cancel_assignment` rather than a bare `css_endmatch`, for the same reason as
the forced map change **[R]**. `practice_start` creates a hard-hold booking
for a window the admin picks (default two hours) and `practice_stop` deletes
it, so the allocator cannot load a match on top of a practice night and kick
everyone through roster lockdown **[R]**:

| action | console |
|---|---|
| pause / unpause | `css_forcepause` / `css_forceunpause` — the admin path; `css_pause` is the player path with per-team limits (verify both accept a console caller in 0.8.15) |
| force_start | `css_start` |
| end_match | `cancel_assignment` when a reservation exists, else `css_endmatch` |
| restart_warmup | `css_restart` with a match loaded (verify), else `mp_warmup_start` then `mp_restartgame 1` as two frames |
| kick_bots | `bot_kick` |
| broadcast `{message}` | `say "<message>"` |
| set_password `{password}` | `sv_password "<password>"` (audited as `sv_password ****`) |
| kick_player `{userid, reason}` | `kickid <userid> "<reason>"` (verify whether `kickid` takes a `[U:1:n]` id, which would avoid the userid race) |
| practice_start `{until}` | booking hold, then `matchzy_kick_when_no_match_loaded false`, then `css_prac` if 0.8.15 exposes it, else `exec MatchZy/prac.cfg` (verify) |
| practice_stop | `css_exitprac` if it exists, else `exec MatchZy/warmup.cfg` (a bare cvar flip would leave `sv_cheats 1` on an available server) (verify); then `matchzy_kick_when_no_match_loaded true` and delete the hold |
| exec_cfg `{name}` | `exec <name>` (name from an allow-list of cfgs shipped with the deb) |

MatchZy's own `css_map` already maps a numeric argument to
`host_workshop_map`; if it is console-callable it is the simpler map change
and the resolution table above only picks the argument (verify) **[R]**.

`POST /v1/admin/game-servers/{id}/command` — the existing raw passthrough,
kept, with three changes: the deny-list from §4 is applied first (400 with
the reason), `;` and control characters are refused (one command per
request), and the audit moves to the table in §5.4. The tracing line stops
logging the command text for denied verbs.

### 5.4 Audit

`server_events` is MatchZy's ingest queue, with `processed` flags and a
dedupe index that would swallow every admin command after the first in a
reservation **[R]**. Admin actions get their own table in migration 0097:

```sql
CREATE TABLE admin_server_commands (
  id UUID PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES game_servers(id),
  reservation_id UUID NULL REFERENCES server_reservations(id),
  admin_user_id UUID NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,          -- raw | map_change | action:<name>
  command TEXT NOT NULL,       -- what was sent, secrets masked
  output TEXT NULL,            -- ≤ 4 KiB, control characters stripped
  ok BOOLEAN NOT NULL,
  force BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON admin_server_commands (server_id, created_at DESC);
```

Every console endpoint writes one row; `set_password` stores `sv_password
****`. Live outputs are bounded at 64 KiB at the API before anything else
looks at them (an RCON reply can be 1 MiB) and stripped of control
characters except newline and tab **[R]**. The tracing line stays, without
the command text for masked verbs. The Console tab's history for a server
is read from this table (`GET …/console/history?limit=50`), so it survives a
reload and shows the other admin's commands too.

### 5.5 Player identity

Snapshot players are joined to `players.steam_id_64` in one query
(`WHERE steam_id_64 = ANY($1::bigint[])`), returning `{id, display_name}`
where matched. `players.steam_id` (the textual Steam2/3 id) is not the
canonical column **[R]**.

## 6. Web: `cg-fe` 0.5.0

- `src/components/admin/ServerConsoleModal.vue`: the modal above, tabs by
  `v-tabs`, `data-testid` on every action. Confirmations through
  `useConfirmDialog`. Polling by `setInterval` + `visibilitychange`, the
  pattern `useMatchDetail` uses.
- `src/stores/serverConsole.ts`: `fetchSnapshot(serverId, live)`,
  `fetchHistory(serverId)`, `changeMap(serverId, target, force)`,
  `runAction(serverId, action, args)`, `runCommand(serverId, command)`, one
  `createActionState()` each; the Console tab's log is the audit history
  plus this session's results.
- `AdminGameServersPage.vue`: labelled row actions; new Map and Players
  columns from `last_map` / `last_player_count`; "Console" opens the modal.
- Map picker: `v-autocomplete` over `gamesStore.fetchMaps(server.game_id)`
  grouped Stock / Workshop, each item showing display name plus engine name
  or workshop id; a second field for the free-text target.
- Regenerated `api/types.ts`; pagination guard is unaffected (no lists).

## 7. Security

- Same permission as the rest of the server surface; the modal is admin-only
  in the router and every endpoint checks `admin.servers.manage`.
- The raw hatch stays deny-listed rather than allow-listed **[R]**: an
  allow-listed "raw" command is just the action table under another name,
  and the hatch exists for the case nobody anticipated. mTLS and
  `admin.servers.manage` bound who can reach it; the deny-list's job is
  narrower than "make raw safe" — it protects the portal's control plane
  (RCON password, webhook and demo URLs, process lifetime) and keeps
  `sv_password` out of logs. Raw commands are ≤ 512 chars, one command per
  request, no `;`, no control characters, checked at the API and again at
  the agent.
- Outputs are stripped of control characters before storage and display;
  nothing the console returns contains a password (`status` does not print
  `rcon_password`; `sv_password` set via the action is masked in the audit).
- Confirm-gated disruptive actions; `force` and `confirm` are recorded.
- No new inbound path to a game host: everything still rides the agent's
  outbound socket.

## 8. Failure modes

| Situation | What happens |
|---|---|
| Agent offline | Snapshot from the last heartbeat, actions disabled, 409 on any command |
| RCON down (`rcon_ok: false`) | Header says so; commands return the agent's error |
| Server hangs on `status` | 10 s timeout → snapshot falls back to stored data with `live: false`; the agent may stay busy ~15 s, so the next command waits |
| Map change in flight | One heartbeat lands `rcon_ok: false` → status `Error` for 30 s; the modal shows "changing…" inside a 60 s window; the hold keeps the allocator off |
| Practice night | Hard-hold booking until the chosen time; allocator skips the server; `practice_stop` or the booking's end restores `matchzy_kick_when_no_match_loaded` |
| Stock map not installed | `changelevel` no-ops; Map tab notices no change after 20 s |
| Workshop download slow | Map tab shows "downloading" up to 3 min, then a warning; the server changes level on its own when done |
| Old agent (0.1.x) | No `status_output`: table shows "—" for map and players; modal still works live (the API runs `status` itself); `agent_capabilities` explains the gap |
| Two admins at once | Commands interleave; each is audited; the UI refreshes on every result |

## 9. Rollout

1. **API 0.7.0**: parser, migration 0097, endpoints, the audit table,
   and integration tests. There is **no fake-agent harness today** — the
   existing tests only assert 401/409 **[R]**; a scripted `FakeAgent` helper
   (the WS client in `tests/integration/common/ws.rs` plus dev-mode
   `X-Dev-Server-Id` auth under `PORTAL_AGENT_INSECURE`) is a prerequisite,
   and the tests it enables: deny-list refusal at both ends; an audit row on
   an idle server and two rows inside one reservation; 409 without `force`;
   `force` running `cancel_assignment`; a heartbeat with `status_output`
   populating the row; parser fixtures from a real dump. Backward compatible
   with 0.1.x agents.
2. **Agent 0.2.0**: heartbeat `status_output`, exec refusals. Hosts upgrade
   when convenient; nothing breaks either way.
3. **Web 0.5.0**: the modal and the table columns. Pins API 0.7.0.

## 10. Open questions and things to verify before implementing

Prerequisites, in order, before code is written:

1. **A real CS2 `status` dump** with humans and bots connected, from a
   managed host. The parser and its fixtures are built from it; until then a
   wrong guess only degrades the Players tab. CS2 prints `[U:1:n]` ids.
2. **A MatchZy 0.8.15 command check** on that host: `css_forcepause` /
   `css_forceunpause`, `css_restart`, `css_prac` / `css_exitprac`, `css_map`,
   and whether each accepts a console (null-player) caller. The action table
   is copied into the handler only after this.
3. **`kickid` by `[U:1:n]`** — if it works, kick by Steam ID and drop the
   userid race.
4. **`host_workshop_map` on a cached map** — whether re-selecting an already
   downloaded workshop map re-downloads or loads from cache (affects the
   3-minute expectation).
5. **The `FakeAgent` test helper** (§9).
