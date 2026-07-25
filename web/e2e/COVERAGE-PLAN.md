# E2E Coverage & Product Findings — Tracker

**Rewritten clean 2026-07-24.** The original working document grew to ~1900 lines of
analyse→correct→settle sediment; this version keeps **final states only**. The full history —
every superseded analysis, correction, and fixed-finding write-up — is preserved verbatim in
`COVERAGE-PLAN.old.md` (and in git). Methodology lives in `api/docs/audit-protocol.md`; the
lineup design in `api/docs/lineup-design.md`.

**Why this exists, in one line:** a test that genuinely drives the UI forces the question
*"what should happen here?"* — and that question surfaced **133 product findings** from what
began as a test-quality audit. The findings are the deliverable; the tests are the instrument.

**Campaign outcome so far:** 244 test executions audited (2026-07-22 baseline: 161 genuine,
88 vacuous-guard sites) → vacuous anti-pattern **eradicated** (ratchet baseline `{}`,
112 → 0) → **133 findings · 101 fixed** → the status-drift defect class closed at the source
(P-31: 1 → 17 spec enums; drift is now a compile error) → the lineup system built and being
corrected (§6) → the inverse audit run (268 API operations vs. frontend consumers) → the
store-action reachability pass (P-68/P-70/P-71 — gaps the inverse audit structurally could
not see).

---

## 1. Ground rules (every test written or changed)

1. **Seed via API, act via UI, assert on UI + backend.** Fixtures build preconditions;
   the *action under test* goes through the real frontend.
2. **Every test must be able to fail.** No `isVisible().catch()` guards, no
   `expect(a || b)`, no tautologies — the ratchet (`npm run test:quality`) fails the first
   reintroduction. Exemption: `// coverage-plan-exempt: <reason>` on the line.
3. **Own your state.** Build fresh entities per test with the lifecycle fixtures; never
   depend on the shared seeded tournament's state.
4. **Assert the mutation twice** — a UI assertion *and* an API cross-check.
5. **The test name is a contract.** If it says "user disputes a result", a user disputes a
   result through the UI.
6. **Two-context flows for two-party actions.** The dev token is a **single shared
   identity** — a one-identity test makes proposer and opponent the same person and passes
   for the wrong reason. Reference: `veto-realtime.spec.ts:117-126`.
7. **Reference implementations:** `veto-flow`, `veto-realtime`, `tournament-seeding`,
   `tournament-lifecycle`, `uploads`, `evidence`.
8. **Finding product bugs is the point.** If a test cannot pass honestly because the app is
   wrong: do **not** weaken the assertion. Drop it, record the finding in §5 with root cause
   + `file:line`, and say so. A test that passes by accommodating a bug *certifies* it.
9. **Changing an assertion is legitimate only when** the specification changed, or the test
   was relying on a bug — never to make a failing test green about behaviour you still
   believe in. Say which in a comment, and keep a separate test pinning what you did *not*
   relax. (Examples: the P-36 approve idempotency change; the P-37 anonymous-call tests.)
10. **Prove every gate can fail before trusting it.** Feed it a known-bad input. A gate
    that cannot fail launders unverified work as verified (see the typecheck trap below).

## 2. Verification commands & repo traps

| Purpose | Command |
|---|---|
| Web typecheck | **`npm run typecheck`** — NEVER `npx vue-tsc --noEmit -p tsconfig.json` (solution-style `"files": []`; checks **zero files, always exits 0**; it masked a real error for a whole phase). Since P-81 it runs two passes: `tsconfig.app.json` (src) **and** `tsconfig.e2e.json` (`e2e/**` + `playwright.config.ts`). Iterate with `npm run typecheck:app` / `typecheck:e2e`. No standalone `tsc` workaround needed any more |
| Test-quality ratchet | `node e2e/scripts/check-test-quality.mjs` — baseline is `{}` (zero); may only stay zero |
| Store-action reachability | `for f in src/stores/*.ts src/stores/tournament/*.ts; do for a in $(grep -oE "^  async function [a-zA-Z0-9_]+" "$f" \| awk '{print $3}'); do [ "$(grep -rl "\b$a\b" src/components src/pages src/composables src/layouts 2>/dev/null \| wc -l)" -eq 0 ] && echo "$(basename $f): $a"; done; done` — every hit is a built-but-unwired feature or a dead action. Found P-68/P-70/P-71; **re-run after any store refactor** |
| E2E (single) | `npx playwright test e2e/<spec>` against the dev stack. 5173 is contended — pass `E2E_WEB_PORT=51xx PLAYWRIGHT_BASE_URL=http://localhost:51xx` |
| E2E (**parallel agents**) | `./scripts/e2e-ephemeral.sh -i <N> [playwright args]` — one throwaway stack per agent. **Every agent gets its own `-i`**; the script namespaces the pg container/port, api port, web port, api log, seeded-state file and playwright report/results by instance, and refuses to start on a port or container clash. `-i` must come first; everything after it goes to playwright. Shared regardless: the `api/` checkout + cargo target (builds serialise on cargo's lock), so **don't edit `api/` while parallel runs are in flight** |
| API integration tests | `cargo test -p portal-api --features test-utils` — plain `cargo test` runs **zero** integration tests. The MinIO `scanner_e2e` pair flakes under concurrency; confirm sequentially |
| API lint/format | `cargo fmt --all --check` · `cargo clippy --workspace --all-targets --features portal-api/test-utils -- -D warnings` |
| Types regen | `cargo run -q -p portal-api --bin openapi-dump > /tmp/spec.json && npx openapi-typescript /tmp/spec.json -o src/api/types.ts` — regen **immediately** after DTO changes; "regenerate later" defers a latent breakage (P-52) |
| Live API | `:3000` runs a **prebuilt binary** — rebuild `portal-app` + restart before e2e against Rust changes |

**Traps that have each burned someone once:**
- **Multi-agent git:** path-limited commits only — `git commit -m "..." -- <path>`. Plain
  `git add` + `commit` commits the **whole index** and sweeps other agents' staged files;
  `git add -u/-A` is banned outright. Check `git status` for other agents' in-flight edits
  before committing a shared file.
- **`migrations/0030_create_tournaments.sql:77` is STALE** (still permits `check_in`/`seeding`);
  the live tournament-status constraint is `0053`. Never edit an applied migration — sqlx
  checksums them.
- **`tournamentStatusMap` vs `tournamentPublicStatusMap` divergence is deliberate** (admin
  voice vs public voice — "Live Now"). Collapsing them regressed a test once already; pattern
  is public-map-first with admin fallback.
- **Playwright text matching is substring + case-insensitive** — `getByText(/Edit Team
  Settings/i)` also matched *"Only the team owner can edit team settings"*; `hasText:
  'ready'` matches "Ready". Assert exact human labels.
- **`waitForLoadState('networkidle')` does not wait for a request you just triggered** — it
  resolves after 500ms of quiet, so an already-idle page satisfies it *immediately*, before the
  click's request is even dispatched. Assertions then read pre-mutation state. It passes
  locally (server wins the race) and fails under load (server loses) — a CI-only flake whose
  obvious diagnosis is wrong. Await the mutation: `page.waitForResponse(...)` on the endpoint.
- **UUID v7 prefixes are timestamps** — two ids created seconds apart share their first 8
  chars; locate rows by full id (`data-testid`), never by prefix.
- **`useUnsavedChanges` uses `window.confirm`** — Playwright auto-dismisses dialogs, so a
  test navigating away from a dirty form silently fails to navigate. Never leave a form dirty.
- **`registerPendingPlayers` yields pending rows only on an `approval`-type tournament** —
  since P-2, `open` auto-approves. `CreateTournamentOptions.registrationType` exists for this.
- **`createLeague` fixture hardcodes `access_type: 'open'`** — invite-only/application
  leagues need a spec-local builder (precedent in `league-join.spec.ts`).
- **`getByRole('button', { name })` is substring-matched too** — `{ name: 'Link demo' }` also
  matches `aria-label="Unlink demo"`, so an "it's gone now" assertion silently found the
  *unlink* button and passed. `exact: true` is **mandatory** on aria-labelled icon buttons —
  the exact inverse of the v-text-field rule below, where `exact` is unusable.
- **`getByLabel()` on a `clearable` v-text-field resolves TWO elements** — the input plus the
  clear icon (`aria-label="Clear <label>"`) — a strict-mode violation. Use
  `getByRole('textbox', { name })`, non-exact.
- **Vuetify `v-text-field` doubles its accessible name** (floating label + the input's own
  aria-label), so the name is `"<label> <label>"` and
  `getByRole('textbox', { name: 'Game Auth Code', exact: true })` matches **nothing**.
  `exact: true` is unusable on Vuetify text fields — scope by container and match a substring.
- **Parallel lanes share one scratchpad directory** — two lanes both writing `run1.log`
  truncated each other mid-write, and one spent a cycle debugging the *other's* failures as
  its own. `-i` namespaces ports and state files but NOT scratchpad paths: name yours
  `run-<lane>-<n>.log`, or write under a per-lane subdirectory.
- **Games are GLOBAL config and there is no create-game endpoint** — a spec that mutates one
  races every other spec that reads the games list. `playwright.config.ts` sets
  `fullyParallel: true`, so it races *itself* too: Lane 5's first run failed 2/4 when one
  test's restore hook clobbered another's in-flight rename. Use file-scope
  `test.describe.configure({ mode: 'serial' })` (precedent: `team-roster.spec.ts:33`), mutate
  `aoe4` and never `cs2`, restore in a hook, and make renames **suffix-appends** so other
  specs' substring matches still hold. A residual ~1s cross-file window remains while a game
  is disabled (it leaves `list_active`, which `admin-management.spec.ts:509` reads) — it
  cannot be designed away without a create endpoint; CI's `workers: 1` removes it.
- Statuses are compile-checked unions since P-31 — if a status literal doesn't typecheck,
  **the literal is wrong**, not the type. True in `src/` **and, since P-86, in `e2e/`**:
  import the union from `e2e/fixtures/api-status.ts` (type-only re-exports of the generated
  client) rather than declaring a status as `string`. Two statuses stay `string` because the
  backend never declared their enums — **award status** and **veto-session status** (P-31
  remnant, §4-G).

## 3. Current state

- **Suite: FULL e2e run GREEN — 316 passed / 0 failed** (2026-07-25, `e2e-ephemeral.sh -i 5`,
  47 specs). Verified by spot-check: regressing `matchStatusMap.ready` to the raw enum turned
  it **red**, restoring turned it green. Ratchet `{}` · web typecheck clean (both passes) · api suite green (last full sequential run:
  681 passed / 0 failed / 1 ignored — the ignored test needs the demo service on `:3100`;
  count grows as agents add tests).
- **Both in-flight agent streams LANDED 2026-07-24** (agents were stopped; work verified and
  committed by the orchestrator): lineup attribution correction + P-26 (`29be78e`), league
  batch API (`dc5136c`) + web half, P-59 gate (`930f8c9`, red-proven). Combined gate at
  landing: **686 passed / 0 failed**, fmt/clippy clean, ratchet `{}`, 6/6 on the touched specs.

### Fix wave B — IN FLIGHT (2026-07-25). Do not pick these up.

**`openapi.rs` is assigned to Lane H alone.** That file is the reason wave B is
split the way it is: several remaining findings need a NEW endpoint, and every
one of those would edit `openapi.rs` and `routes/*.rs`. Two agents doing that in
one shared checkout lose each other's work. So wave B is deliberately the lanes
that change EXISTING behaviour, plus Lane H which owns the registration file;
everything needing a new endpoint (the demo pipeline, admin score correction,
cascading DQ, the pagination lookup, roster lock) is held for wave C.

| Lane | Findings | Owns |
|---|---|---|
| F | P-113 · P-116 | `api league_team` adapter/service · `web TeamDetailPage.vue` |
| H | P-112 · P-65 · P-69 · P-67 | `api openapi.rs` · DTO response types · `src/utils/statusMaps.ts` · `src/api/types.ts` |
| J | P-55 · P-3 · P-41 · P-6 | `api result_review` adapter · `AdminResultReviewsPage.vue` · the two create-team forms |
| L | P-114 · P-115 | `api dto/responses/league.rs` · `LeagueMembersModal.vue` |

### Fix wave A — COMPLETE (2026-07-25). All four lanes merged.

Four lanes chosen for **zero file overlap**, because every agent shares one
checkout — `api/` is not isolated by `git worktree` (separate repos), so two
lanes editing `openapi.rs` or `routes/*.rs` would silently lose each other's
work. The API-heavy clusters (C6 builds, roster lock, the pagination
ceiling) are deliberately held for wave B for that reason, not because they
matter less.

| Lane | Findings | Owns (only these files) |
|---|---|---|
| A | P-98 · P-99 · P-82 | `StagesTab.vue` · `utils/matchStatus.ts` · `MatchOverviewTab.vue` · `MatchesTab.vue` |
| B | P-88 · P-90 · P-92 | `AdminGamesPage.vue` · `GameEditModal.vue` · `GameConfigDialog.vue` · `stores/games.ts` · `api dto/responses/game.rs` |
| D | P-62 · P-63 · P-71 | `TeamDetailPage.vue` · `MyLeagueTeamsPage.vue` · `stores/leagueTeams.ts` |
| E | P-95 · P-96 · P-97 | `InviteUserModal.vue` · `LeagueMembersModal.vue` · `LeagueSearchAutocomplete.vue` · `LeagueCreateModal.vue` · `LeaguesPage.vue` · `LeagueDetailPage.vue` · `stores/leagues.ts` |

**Nobody edits `e2e/scripts/check-status-maps.mjs`.** Lanes D and E will both fix
entries in its BASELINE; concurrent edits would clobber. Report which entries you
fixed and the orchestrator updates it centrally — same rule as the register.

### Parallel F wave 3 — COMPLETE (2026-07-24). Both lanes landed. **§4-F is done.**

| Lane | Instance | Owns (only these files) | §4-F rows claimed |
|---|---|---|---|
| ~~9~~ | ~~`-i 1`~~ | **LANDED** `c98f2bc` — 3 tests, two network probes | yielded **P-104..P-106** |
| ~~10~~ | ~~`-i 2`~~ | **LANDED** `89cc64b` — 4 tests, probe-proved | yielded **P-108..P-111** |

`MapPoolPicker` mounts twice: `GameConfigDialog.vue:138` (game pool — **dead, P-87**) and
`TournamentForm.vue:321` (tournament pool — live). Lane 9 drives the tournament one; the game
one is already registered as a finding and must not be tested into a pass.

**Outcome: every §4-F row is now ticked or carries a P-number.** Across three waves, 9 agent
lanes produced **38 findings (P-74..P-111)** — more than a third of the campaign's total, from
surfaces that had all shipped, been reviewed, and been inverse-audited. The single most common
shape, by a wide margin: a control that renders, reports success, and does nothing.

### Parallel F wave 2 — COMPLETE (2026-07-24). All four lanes landed.

**15 findings (P-87..P-101) from 4 agents.** Wave 2 was killed mid-flight and relaunched; every
lane inherited uncommitted, never-executed partial work and **most of it failed on first run**
(Lane 7: 3 of 4; Lane 8: 3 of 5; Lane 6: both new tests). Lesson for any future handover:
unrun test code is a draft, not progress — the relaunch brief must say so explicitly, and did.

| Lane | Instance | Owns (only these files) | §4-F rows claimed |
|---|---|---|---|
| ~~5~~ | ~~`-i 1`~~ | **LANDED** `e50ec9c` — 4 tests green, red-proven | yielded **P-87..P-92** |
| ~~6~~ | ~~`-i 2`~~ | **LANDED** `5bad7ef` — 21/21 green (17 pre-existing), red-proven | yielded **P-98..P-101** |
| ~~7~~ | ~~`-i 3`~~ | **LANDED** `331887e` — 8 tests green, red-proven | yielded **P-93** |
| ~~8~~ | ~~`-i 4`~~ | **LANDED** `b181e85` — 5 tests green, two probes | yielded **P-94..P-97** |

Same standing rules as wave 1 (below). P-81 and P-86 both landed first, so wave 2 writes
specs that are actually typechecked and whose status literals are compile-locked.

### Parallel F wave 1 — COMPLETE (2026-07-24). All three lanes landed.

Three agents, three surfaces, one afternoon → **12 findings (P-74..P-85)** and **19 tests**
(5 new + 5 added to dispute-resolution + 6 new + 3 pre-existing kept green). Every lane
red-proved a test, none touched another's files, none touched `api/`, all committed
path-limited. The harness held: no port, container, seeded-state or report collision.

**Wave 2 is not yet claimed** — the remaining §4-F rows (game config, awards edit/void,
stages/clear-seeding, modal saves, the player surfaces) are open. Re-use this table format
to claim them, and **fix P-81 first**: until `e2e/` is typechecked, every new lane is writing
specs that compile-check nothing.

| Lane | Instance | Owns (only these files) | §4-F rows claimed |
|---|---|---|---|
| ~~1~~ | ~~`-i 1`~~ | **LANDED** `a60af09` — 6 tests green, red-proven, ratchet `{}` | yielded **P-82..P-85** |
| ~~2~~ | ~~`-i 2`~~ | **LANDED** `5955f9d` — 3→8 tests green, red-proven, ratchet `{}` | yielded **P-77..P-81** |
| ~~4~~ | ~~`-i 3`~~ | **LANDED** `dc36288` — 5 tests green, red-proven, ratchet `{}` | yielded **P-74/75/76** |

Standing rules for this wave, and for any lane added to it:
- **One `-i` per agent, never shared.** A wrong `-i` destroys another lane's database
  mid-run; the runner's preflight catches a *clash*, not a *collision of intent*.
- **`api/` is off-limits while lanes are live** — it is the one resource `-i` does not
  isolate, and every instance builds and runs whatever Rust source is on disk.
- **Findings go in the agent's report, not into §5.** Three agents appending to the register
  concurrently is how entries get lost; the orchestrator merges them centrally.
- Path-limited commits only, per the multi-agent git trap below.

## 4. Triage — the open register as an ordered work queue

**Rewritten 2026-07-25.** The old A-G roadmap predated waves 2-3, which added 30 findings and
left the lettering unable to order them. §5 no longer cross-references letters; it references
**tiers**. The coverage wave (old F) is **complete** — see §3.

Ordering principle: **impact × cheapness**, with one exception — security goes first regardless
of cost. A "one-line fix" tier exists because eight of these findings are genuinely a line or
two each and together retire most of the dead-control class.

| Tier | Theme | Findings | Why here |
|---|---|---|---|
| **T0** | **Security** | ~~P-108~~ · ~~P-60~~ — **tier complete** | Unauthenticated writes and un-revoked sessions. Cost is irrelevant |
| **T1** | **Silent data corruption** | ~~P-93~~ · ~~P-77~~ · ~~P-78~~ · ~~P-83~~ — **tier complete** | Each writes or preserves *wrong data* while reporting success. Worst possible failure mode: no one finds out |
| **T2** | **One-line dead-control fixes** | all eight fixed — **tier complete** | Highest value/effort ratio in the register. Each is a control that renders and does nothing; each fix is a line or two |
| **T3** | **a11y sweep** (one batch) | ~~P-89~~ · ~~P-100~~ · ~~P-106~~ · ~~P-85~~ — **tier complete**, ratcheted | P-89 is a **P-45 recurrence**, so this must be a repo-wide sweep, not another point fix |
| **T4** | **Raw-enum sweep** (one batch) | ~~P-76~~ · ~~P-91~~ · ~~P-79~~ · P-96 → now ratcheted; see C1 | P-10/P-44 family, now on its fifth recurrence. Batch it and add a guard, or it returns |
| **T5** | **Dead code & build hygiene** | P-69 · P-67 · P-65 · P-90 | Deletions and registrations. Cheap, and shrinks the surface the other tiers have to reason about |
| **T6** | **Missing controls** (product build) | P-74 · P-88 · P-109 · P-110 · P-111 · P-70 · P-71 · P-62 · P-63 · P-64 · P-72 · P-75 · P-92 · P-95 · P-68 · P-73 · P-61 · P-66 | Endpoint live, control absent or non-functional. Real build work; sequence by user pain |
| **T7** | **Roster-lock rework** (together) | P-14 · P-15 · P-16 · P-18 | Design §9 sequences these as one unit, after the lineup proved out. Do not pick off individually |
| **T8** | **Decide, then act** | P-3 · P-6 · P-41 · P-53/P-56 · P-55 · P-80 · P-97 | Each needs a product decision or a confirm-or-kill before it is actionable |

### Fix wave D — IN FLIGHT (2026-07-25). Do not pick these up.

| Lane | Findings | Owns | openapi.rs |
|---|---|---|---|
| Q | P-73 · P-64 · P-68 | admin demo/pipeline surfaces · `stores/demos.ts` · api demo+internal handlers | **yes, exclusively** |
| R | P-70 · P-123 | `AdminPermissionsPage.vue` · `stores/rbac.ts` · `AdminBansPage.vue` · `BanDetailModal.vue` | no |
| S | P-14 · P-15 · P-16 · P-18 | api `league_team` season/team services + adapters | no |

Verified before launching, so the split holds: P-64's `process-unlinked` route and
P-70's `/users/{id}/roles` endpoints **already exist** (UI-only work), and P-14's
`roster_lock_status` is already on the request DTO with a working
`update_roster_lock` service method — so it is wiring, not a new endpoint. Only
P-73's operator read surfaces need registration, which is why Lane Q holds
`openapi.rs`.

### 4b. Deployment gate — what blocks launch (owner-set, 2026-07-25)

Not all open findings block deploy. These do. Everything else is polish, ops
convenience, or debt that a ratchet already holds.

**Owner correction (2026-07-25): the demo pipeline is INTEGRAL to this product and
must be fully functioning and covered end-to-end.** My first triage classed the
demo *ops* surfaces as ship-without on the reasoning that they are operable via
DB and logs at launch volume. That was wrong about the product: demos are the
evidence backbone for disputes and anti-cheat, and an evidence system that an
operator cannot see, correct, or validate is not a working evidence system.
All seven demo findings are blockers, and each needs an e2e test that drives it
through the UI — not an API-level check.

**BLOCKERS — core action cannot be completed or corrected**
| # | Why it blocks |
|---|---|
| P-127 | ✅ `fixed` — result submission left a stale page; the panel was `v-else-if`'d off by the very store write preceding its own emit, so `emit('submitted')` landed in a torn-down tree. Same defect as P-6, on the most-used flow in the product |
| P-53 / P-56 | ✅ `1a6743b`+`7d02c59` — past registration #100 a player could not submit a result at all. A targeted participants lookup replaces the paging scan, which is DELETED rather than widened, and the e2e asserts the page issues no `/registrations` request at all so it cannot be reintroduced. **But see P-167**: the same scan defect survives on TournamentDetailPage at the default `per_page: 20`, a worse ceiling on a different surface |
| P-72 | ✅ `1a6743b`+`7d02c59` — a wrong result that auto-confirmed with no dispute was permanently uncorrectable. The score write and its audit row share one transaction, and all three score-write paths are now literally one statement. **P-169 (`7a19c34`) closed the follow-on**: revert now resolves the downstream slot structurally rather than by the winner's identity, which a correction rewrites |
| P-14 · P-15 · P-16 · P-18 | ✅ `297a19e` — roster lock was unreachable, so all enforcement was dead. **But see P-148: the stated rationale was wrong.** Teams cannot swap players mid-playoffs today because `allows_roster_changes()` is `Draft \| Registration` only — i.e. season *status* forbids it, and the lock is inert once a season is active. The lock is still required (it governs draft/registration, and P-15 showed substitutes could be seated on a hard-locked roster), but whether it should govern the competitive phase is an unresolved product ruling, not a landed guarantee |
| P-70 | ✅ `f29a1e7` — admin/organizer could only be granted by SQL. **Was only half-closed**: granting worked, but `SYSTEM_ADMIN_ROLES` named a role no migration seeds, so the grantee was still bounced off every admin route (P-152, `e92aead`). Both halves now land |
| P-123 | ✅ `be66b56`+`fa394b0` — ban-lift confirmed against a truncated UUID; v7 prefixes are timestamps, so two bans minutes apart were indistinguishable. `BanResponse` now carries username/display_name and the confirm dialog names the person |

**BLOCKERS — the demo/evidence pipeline (owner: integral, must be e2e-covered)**
| # | Why it blocks |
|---|---|
| P-109 | A linked demo is invisible on every evidence surface — an admin resolving a dispute cannot see the evidence attached to it |
| P-110 | The browse catalog offers demos the link endpoint will refuse (resolves by file name against the stats service while holding the id) |
| P-111 | Nothing ever validates a demo against a result; the "Validated" chip is dead template. The backend validator, plugin, and DB columns all exist unconnected |
| P-75 | A demo stamped onto the wrong league/tournament cannot be corrected — the P-42 repair path — and the card shows raw UUIDs |
| P-73 | ✅ `0dd69e1`+`4ead184` — no operator visibility into tracking health, the discovered-match queue, or enrichment failures. Silent ingestion stoppage was undetectable |
| P-64 | ✅ `0dd69e1`+`4ead184` — the auto-link backfill had no control |
| P-68 | ✅ `0dd69e1`+`4ead184`+`2751a44` — a bad scraped Premier rating could not be corrected, and it drives seeding and league entry gates. The endpoint existed but **403'd for everyone including super_admin** (P-139) |
| P-138 | ✅ `b6ccf8b`+`806048e` — a FAILED validation still stamped the green "Validated" chip. P-111 had already fixed this exact bug on the demo-*link* repo; the evidence row was missed, so after a validation the two rows actively DISAGREED — link said "contradicts", evidence said "corroborates". Three states are now distinguishable |
| P-136 | ✅ `b6ccf8b`+`806048e` — admins could not access ANY evidence file from admin match detail; `MatchEvidenceTab` omitted `:match-id`, which gates the whole Actions column. `matchId` is now REQUIRED on `EvidenceDisplay`, so the mechanism is closed and not just this instance |
| P-135 | ✅ `b6ccf8b`+`806048e` — unlinking silently no-op'd after a reload and reported success. `evidence_id` now comes from the server and the local list is pruned only after a DELETE that returned |
| P-137 | ✅ `b6ccf8b` — `Cs2DemoClient::default()` pointed at a real external host. **Two more instances of the same default were found** (portal-scanner, portal-cli); misconfiguration now refuses by name. See P-160: the docker-compose default survives |

**Strongly recommended, cheap:** P-61 (DQ strands matches mid-bracket) · P-126
(disbanded teams renameable) · P-124 (six sites showing a generic error instead
of the real one) · **verify P-58** (implemented at `stats_updater.rs:178`, never
verified — verify, do not rebuild).

**Ship without:** P-66 · P-80 · P-120 · P-121 · P-122 · P-125 · P-128 · P-129 ·
P-65 · P-67 · P-69 · P-112 (debt; its ratchet stops it worsening).

### 4a. Root-cause clusters — what to fix ONCE instead of 51 times

**Added 2026-07-25 after re-reading the whole register.** The tiers above order by *urgency*;
this orders by *leverage*. Several findings are not independent bugs — they are one defect
observed at several sites, and fixing them one at a time both costs more and leaves the
mechanism intact to produce the next one. P-89 (a P-45 recurrence) and the raw-enum leak (now
on its fifth appearance) are the proof that incremental fixing has already failed here.

**C1 · Frontend re-declares backend enums, and nothing checks them. ✅ DONE `b992f2a`** —
closed P-79/P-91/P-76, found 5 unfiled drifts (one a live leak) and 11 raw renders against the
3 registered, and left P-112 as the blocker on the remaining 10 maps.
> Findings: **P-79 · P-82 · P-91 · P-99**, plus the render half of **P-76 · P-96**.
>
> `StatusMap` is `Record<string, {...}>` (`utils/statusMaps.ts:1`) — **completely unkeyed**, so
> all 21 maps accept any key and omit any value silently. That is exactly how P-79 shipped
> (`disputePriorityMap` defines `critical`; the backend enum is `urgent`) and P-91
> (`AdminGamesPage` renders the raw value). The same shape recurs as hardcoded literal arrays:
> `StagesTab.vue:44` offers `groups_and_playoffs`, which the backend never accepted, and omits
> `group_stage`, which it does (P-99); `utils/matchStatus.ts` maps `completed → awaiting_result`,
> a transition the backend forbids (P-82).
>
> **The generated unions already exist** — P-31 produced 20 of them, and P-86 already proved the
> pattern by keying the *e2e fixtures* to them. This is the same fix applied to `src/`: type each
> map as `Record<TournamentStatus, …>` etc., derive option lists from the unions, and drift
> becomes a compile error instead of a user-visible enum leak.
>
> **A survey while confirming this found sites the register did not know about** —
> `DemoBrowser.vue:175` (`{{ demo.category }}`), `TournamentInvitationsModal.vue:140`,
> `AdminPermissionsPage.vue:86` and `:91` all render raw values, and
> `GameConfigDialog.vue:59` / `StagesTab.vue:51` hardcode further lists. Fixing the four
> registered findings individually would have left those four in place. **That is the argument
> for the sweep in one sentence.**

**C2 · Accessible names are unchecked, and one is actively dangerous. ✅ DONE `b137146`.**
> Findings: **P-89 · P-100 · P-106 · P-85**.
>
> P-89 is P-45 returning in a different table — `aria-label` rotated one position off `title` and
> `@click`, so the control announced as "Enable game" disables it. P-45 was point-fixed
> (`fbe1500`) and the class was never swept, which is why it came back. P-100 is app-wide
> (`v-select` exposes no accessible name at all) and P-106 is a custom control built from
> unlabelled divs.
>
> The sweep is an audit of every interactive element plus **a guard asserting `aria-label`
> agrees with the visible label and the handler**. Without the guard this returns a third time.

**C3 · One mechanical defect at six call sites. ✅ DONE `024513b`.**
> Finding: **P-87**. `game_repo.update` is keyed by slug; six handlers hand it a UUID. Six
> one-line fixes (`resolve_game_slug` first, as `update_game` already does), one test each.
> Unblocks **P-92** (rank tiers / team size are additionally blocked by it).

**C4 · "Collected, validated, discarded." ✅ DONE** (P-94 `c49380d`, P-84 `1d5c9e5`)
> Findings: **P-94 · P-84** (and P-104's second half). A field the UI collects that never reaches
> storage. *Not* one fix — P-94 drops in the web store, P-84 in the Rust handler — but one
> **audit**: for every request DTO field, is it consumed by the service? Worth a guard later;
> the two known cases are cheap now.

**C5 · "Reports success, does nothing." ✅ DONE** (P-74, P-104, P-105)
> Findings: **P-74 · P-105** (+ P-104). Different mechanisms — a handler that calls no API, a
> `.catch(() => {})` on a mutation — but one detectable shape: a success snackbar not guarded by
> a confirmed write. A lint for `.catch(() => {})` on store mutations catches the P-105 form.

**C6 · Endpoint live, control absent.** ← *the parallelisable bulk*
> Findings: **P-61 · P-62 · P-63 · P-64 · P-68 · P-70 · P-71 · P-72 · P-73 · P-75 · P-92 · P-95**.
> Twelve independent UI builds sharing only a diagnosis (the store-action reachability gap).
> No common fix — but no shared files either, so this is where agent parallelism pays.

**C7 · One coherent domain: the demo/evidence pipeline.**
> Findings: **P-64 · P-68 · P-73 · P-74 · P-75 · P-109 · P-110 · P-111**. These interact —
> P-73's pipeline page is where P-64's backfill button and P-68's rating override belong, and
> P-109/P-110/P-111 are the same evidence path. **One agent should own the whole domain**, or
> three agents will build three half-pages.

**C8 · Sequenced as a unit (do not split).** **P-14 · P-15 · P-16 · P-18** — design §9 welds
the roster-lock work together; P-15 exists *because* it was picked at piecemeal.

**C9 · Cheap and independent.** **P-65 · P-67 · P-69 · P-85 · P-90** — registrations, deletions,
a DTO field. Parallel-safe, small.

**C10 · Needs a product decision first.** **P-3 · P-6 · P-41 · P-55 · P-80 · P-97** — not
actionable until someone rules. P-6 is confirm-or-kill.

**C11 · One ceiling, one fix.** **P-53 → P-56** — `PaginationParams` caps at 100; the real fix
is the targeted lookup endpoint, which closes both.

**Recommended order:** C3 (mechanical, unblocks C6) → **C1** (largest leverage; closes 4, hardens
2, prevents the 5th recurrence) → C2 (safety + prevents a third recurrence) → C5/C4 → C7 as one
agent → C6 fanned out → C9 → C8 → C11 → C10 last.

**Standing rules while working the queue**
- Fix in the register's order within a tier; tiers themselves are strictly ordered.
- **Every fix gets a red-proven test** (ground rule 10) — for a security gate, prove the 403.
- After any batch, re-run the **full** suite; per-spec green is not green (P-107).
- `api/` and `web/` are separate repos: commit path-limited, in each.

**Deferred, unchanged:** lineup product completion (evidence ladder, §0c waivers) — see §6.
It is decided scope, not a finding, and is not in this queue.

## 5. Findings register — SINGLE SOURCE OF TRUTH

Every product bug/gap found by this work gets a P-number **here**. The table is
authoritative; the summary is derived from it, never hand-edited. Fixed findings keep only
their row (full write-ups: `COVERAGE-PLAN.old.md` + the commit named in the row). Open
findings have detail entries below the table.

**Status (derived): 202 found · 162 fixed · 40 open** (P-53 mitigated).

Open: P-61, P-66, P-80, P-120, P-128, P-129, P-142, P-143, P-144, P-149, P-150, P-154, P-155, P-156, P-157, P-158, P-159, P-160, P-161, P-173, P-175, P-176, P-177, P-178, P-180, P-181, P-182, P-183, P-186, P-187, P-188, P-189, P-190, P-191, P-193, P-194, P-195, P-198, P-199, P-200.

**P-74..P-85 came from the first F wave** — **12 findings from 3 agents in one afternoon**,
on three admin surfaces that had all shipped, been reviewed, and been inverse-audited without
anyone clicking their buttons. The pattern in the yield is the point:

- **Four controls that lie to the operator** — P-74 (retry calls no API), P-82 (revert
  transition always 400s), P-83 (revert progression is a no-op on elimination), P-84 (notes
  discarded). Each renders, each reports success or offers an action, none does the work.
  A reader of the frontend sees a button; only a *driver* of it sees nothing happen.
- **Two silent bracket-corruption bugs** — P-77, P-78, both in the dispute path, i.e. the
  mechanism the product uses to *fix* wrong results. Neither is visible from the frontend at
  all, which is exactly why the 268-operation inverse audit could not have found them.
- **One gate that covers nothing** — P-81, the same class as the §2 typecheck trap.

Read together: the failure mode this codebase actually has is **built-and-not-wired**, and
the only instrument that detects it is driving the UI. Finish §4-F.

| # | Finding | Severity | State |
|---|---|---|---|
| P-1 | `MapResultsSummary` never renders (+admin results tab) | data hidden | **fixed** |
| P-2 | Open registration never auto-approves | blocks flow | **fixed** `a3c1876` |
| P-3 | `checkInRequired` alone can't open check-in | minor | **fixed** `d7d3483` |
| P-4 | Tournament **header** shows raw status | user-facing | **fixed** |
| P-5 | Display name: signup allows dupes, save rejects | user trap | **fixed** `a3c1876` |
| P-6 | Result history stale after dispute | suspected | **fixed** `ae5b50a` |
| P-7 | Veto side-select unreachable in UI | feature dead | **fixed** |
| P-8 | Can propose a past time, then hard-fails | dead end | **fixed** `4b7edb4` |
| P-9 | Proposer cannot withdraw own proposal | API gap | **fixed** `a3c1876`+`4b7edb4` |
| P-10 | Admin registrations table prints raw enum | user-facing | **fixed** `f2694b0` |
| P-11 | Roster lock never enforced in admin UI | enforcement | **fixed** `ce732a0` |
| P-12 | No captain entry point to invite modal | blocks flow | **fixed** `ce732a0` |
| P-13 | `TeamEditPage` blank form to non-owners | confusing | **fixed** `ce732a0` |
| P-14 | **Roster lock cannot be set via API at all** | feature dead | **fixed** `297a19e` |
| P-15 | Invitation path bypasses the lock check — wider than filed: join-requests applied *neither* predicate | inconsistent | **fixed** `297a19e` |
| P-16 | Role changes not lock-checked | enforcement | **fixed** `297a19e` |
| P-17 | Edit modal offers a lock value the API 400s | user-facing | **fixed** `7b4aa8d` |
| P-18 | No admin/emergency override of the lock | design gap | **fixed** `297a19e` |
| P-19 | **"Upcoming" tournaments tab always empty** | user-facing | **fixed** `c4bca02` |
| P-20 | Home page hides `pick_ban`/`ready`/`awaiting_result` matches | user-facing | **fixed** `c727267` |
| P-21 | Tournament **list** cards print raw enum | user-facing | **fixed** `c4bca02` |
| P-22 | Season roster-lock column always "Open" | enforcement | **fixed** `7b4aa8d` |
| P-23 | Roster-mismatch review built but unreachable | integrity | **fixed** `e166079` |
| P-24 | **Check-in/forfeit/reg-check-in had no authz** | **security** | **fixed** `98c8f48` |
| P-25 | **Ringer stats count / benched credited** | integrity | **fixed** `b388a77`; model corrected, see §6 |
| P-26 | "Sub can't face own team" never enforced | integrity | **fixed** `29be78e` (review-raiser) |
| P-27 | `invite_only` tournaments accept anyone | trust | **fixed** `c3e0949` |
| P-28 | `/tournaments` search/filters only see first 20 rows | user-facing | **fixed** `9f87495` |
| P-29 | **`GET /users/me/matches` 500s for everyone** | **backend** | **fixed** `8ce0f0a` |
| P-30 | Season edit Save disabled when max_teams is null | user-facing | **fixed** `9816346` |
| P-31 | **API declares ~no enums — root of the status-drift class** | **architectural** | **fixed** — class closed; 25/41 fields, 17 enums |
| P-32 | `AdHoc` serialises as `ad_hoc` vs `adhoc` everywhere else | wire format | **fixed** `62f6726` |
| P-33 | Roster unreachable unless live season in 3 newest | user-facing | **fixed** `19241cf` |
| P-34 | `LeagueSeasonParticipantStatus` serialises PascalCase | wire format | **fixed** `71830df` |
| P-35 | **Result-review Decision Form never renders** | **feature dead** | **fixed** `5b39d88` |
| P-36 | Approve returned 400 for already-approved registrations | blocker | **fixed** `e5773f7` |
| P-37 | **League members endpoint unauthenticated, leaked emails** | **security/PII** | **fixed** `a0e1b98` |
| P-38 | League invitation never says which league | user-facing | **fixed** `dc5136c`+web |
| P-39 | Admin cannot see answered league invitations | admin gap | **fixed** `dc5136c` |
| P-40 | Decline confirmation guards the wrong action | minor | **fixed** (web) |
| P-41 | Two create-team forms disagree on validation | inconsistent | **fixed** `4fc037f` |
| P-42 | **Auto-linked demos raised false reviews, stalled brackets** | **pipeline** | **fixed** `f6778e7` |
| P-43 | Review queue showed only the oldest 20, forever | user-facing | **fixed** `9f87495` |
| P-44 | `resultReviewStatusMap` 3/5 wrong, leaked raw enum | user-facing | **fixed** `070d104` |
| P-45 | Role-row aria-labels rotated; "Manage" wired to Delete | **a11y/safety** | **fixed** `fbe1500` |
| P-46 | invite-only refusal: 403 tournaments vs 400 leagues | inconsistent | **fixed** `dc5136c` (403) |
| P-47 | No frontend invite-only awareness / organiser invite UI | feature unusable | **fixed** `616a2d6` |
| P-48 | User cannot see their own pending league application | user-facing | **fixed** `c7d395e` |
| P-49 | Captain cannot approve a join request from team page | blocks flow | **fixed** `c7d395e` |
| P-50 | **Result auto-confirmed with opponent never notified** | **integrity/trust** | **fixed** `2f94b47` |
| P-51 | Invitee cannot read own invite state (gate was soft) | design gap | **fixed** `c7d395e` |
| P-52 | Duplicate `operationId` broke the generated client | build | **fixed** `098832a`; guarded `c5ea9e5` |
| P-53 | **Player past registration #20 cannot submit a result** | **blocks core flow** | **fixed** `1a6743b+7d02c59` |
| P-54 | League members truncates at 20; client cannot paginate | user-facing | **fixed** `dc5136c`+`71bdd90` (web half was missing) |
| P-55 | Review queue FIFO — newest escalation on the last page | admin friction | **fixed** `4559a36`+`37c24cb` |
| P-56 | >100-participant tournaments still can't submit (P-53 ceiling) | blocks core flow | **fixed** `1a6743b+7d02c59` |
| P-57 | 15-min auto-confirm window too short for humans | trust | **fixed** `5590726` (24h) |
| P-58 | **Team matches credit participation to nobody.** Verified: the demo half worked; a team playing WITHOUT a parsed demo still credited nobody, since a team registration's `player_id` is `None`. Now takes the most authoritative lineup source present | integrity | **fixed** `3013f58+cb05c99` |
| P-59 | **`schedule_match` direct-set: no authz → manufactured forfeits** | **security** | **fixed** `930f8c9` (red-proven) |
| P-60 | Logout never revokes the session server-side | security gap | **fixed** `409969b` |
| P-61 | UI disqualify doesn't cascade; strands matches | admin gap | open |
| P-62 | Transfer team ownership has no UI | product gap | **fixed** `28afc7a` |
| P-63 | Disband team has no UI | product gap | **fixed** `28afc7a` |
| P-64 | Demo auto-link backfill unreachable from UI | admin gap | **fixed** `0dd69e1+4ead184` |
| P-65 | `/users/me/action-items` missing from OpenAPI doc | build (P-52 family) | **fixed** `ea55c83` |
| P-66 | Match audit trail + stored suggestions invisible | minor | open |
| P-67 | Dead-surface cleanup batch | hygiene | **fixed** `c985d26` |
| P-68 | Scraped Premier rating has no correction path | data integrity | **fixed** `0dd69e1+4ead184+2751a44` |
| P-69 | Platform Elo engine is dead code (never called) | **scope decided** | **fixed** `82e8b14` |
| P-70 | **Platform role assignment has no UI** | admin gap | **fixed** `f29a1e7+dfe80ee` (+`e92aead`, see P-152) |
| P-71 | Returning team can't enter the next season | blocks flow | **fixed** `28afc7a` |
| P-72 | No admin score correction outside a dispute | admin gap | **fixed** `1a6743b+7d02c59` |
| P-73 | Ingestion pipeline invisible to admins | ops blind spot | **fixed** `0dd69e1+4ead184` |
| P-74 | **"Retry Processing" calls no API — reports success anyway** | **trust** | **fixed** `c49380d+1d5c9e5` |
| P-75 | Demo league/tournament association uncorrectable; shows raw UUIDs | admin gap | **fixed** `61d3e65`+`b9ccdaf` |
| P-76 | Categorize snackbar prints the raw enum | minor | **fixed** `b992f2a` |
| P-77 | **Uphold on a claim-path dispute completes the match with NO result** | **integrity** | **fixed** `2b8e428` |
| P-78 | **Rematch / double-DQ leave the old winner + score on the match** | **integrity** | **fixed** `2b8e428` |
| P-79 | Dispute priority: UI has `critical`, backend has `urgent` | user-facing | **fixed** `b992f2a` |
| P-80 | "Assign to Me" records no assignee — no column exists | design gap | open |
| P-81 | **`e2e/` is in no tsconfig — specs are never typechecked** | **gate gap** | **fixed** `e06ff8f` |
| P-108 | **`link-discovered`/`link-demo` have NO participant authz** | **security** | **fixed** `ef4b947` |
| P-109 | Linked demo evidence is invisible on every evidence surface | **feature dead** | **fixed** `61d3e65`+`b9ccdaf` |
| P-110 | Browse-catalog "Link demo" offers demos it will refuse to link | feature dead | **fixed** `61d3e65`+`b9ccdaf` |
| P-111 | Nothing ever validates a demo against a result; "Validated" is dead template | integrity | **fixed** `61d3e65`+`b9ccdaf` |
| P-102 | **`lineup.spec.ts` read an env var nothing sets — wrote to the DEV database** | **test integrity** | **fixed** `172b46f` |
| P-103 | P-57 landed without updating the test that depended on the old window | test rot | **fixed** `172b46f` |
| P-104 | Edit modal's empty-pool gate is decorative; the pool edit is discarded | **feature dead** | **fixed** `c49380d` |
| P-105 | A failed map-pool reset is swallowed and reported as success | trust | **fixed** `c49380d` |
| P-106 | `MapPoolPicker` cards are unlabelled clickable divs | a11y | **fixed** `b137146` |
| P-107 | **The full suite is red as a whole though every spec is green alone** | **suite integrity** | **fixed** `cb4c4db` |
| P-94 | `InviteUserModal` message collected, validated, then discarded | user-facing | **fixed** `c49380d` |
| P-95 | **Invite-only league is un-invitable — needs a UUID no surface shows** | feature unusable | **fixed** `4dd4f60` |
| P-96 | League invitations/applications tables print the raw enum | user-facing | **fixed** `4dd4f60` |
| P-97 | Every league silently gets an unconfigured "Season 1" | product question | **fixed** `4dd4f60` |
| P-98 | Stage "Format (optional)" is mandatory — blank is a 400 | user trap | **fixed** `4166015` |
| P-99 | **`groups_and_playoffs` is a dead option; valid `group_stage` missing** | feature dead | **fixed** `4166015` |
| P-100 | Vuetify `v-select` exposes no accessible name, app-wide | **a11y** | **fixed** `b137146` |
| P-101 | Seeding fixture typed `seed` non-optional, blessing a false compare | test-infra | **fixed** `c3d0122` |
| P-127 | **The result-panel event system is dead by construction, not just for dispute** | **feature dead** | **fixed** `5d040f1` |
| P-128 | Team colour fields have no client validation against a backend bound | user trap | open |
| P-129 | Review queue still has no server-side sort control (P-55 follow-up) | admin friction | open |
| P-130 | Fixtures picked a game positionally; a sort_order test reordered them | test-infra | **fixed** `3a0df22` |
| P-131 | `dispute.reason` rendered raw on two admin surfaces — both treated a declared enum as the free-text field beside it | user-facing | **fixed** `86701cc` |
| P-132 | Eight `.role` raw renders across six files — six took the LABEL off the wire while colouring the chip from the map, so they looked deliberate | user-facing | **fixed** `86701cc` |
| P-133 | `MyLeagueTeamsPage` feeds `membership_type` through `teamRoleMap` — disjoint enums, so EVERY lookup missed and the fallback fired for every league card ever drawn. Hidden because `formatRole` capitalises without consulting a map | user-facing | **fixed** `86701cc` |
| P-134 | A match completed in-page never fetches its result review — `pollMatch` never fetched it at all | user-facing | **fixed** `86701cc` |
| P-135 | `unlinkDemoEvidence` silently no-ops after a reload — no DELETE sent | **trust** | **fixed** `b6ccf8b+806048e` |
| P-136 | `MatchEvidenceTab` never passes `match-id`, so evidence actions never render | feature dead | **fixed** `b6ccf8b+806048e` (prop made required) |
| P-137 | `Cs2DemoClient::default()` points at a real external host — **2 more instances found** (portal-scanner, portal-cli) | **config safety** | **fixed** `b6ccf8b` |
| P-138 | **A FAILED validation still stamped the green chip** — `mark_validated` hardcoded `validated = true`, so link and evidence rows actively disagreed | **integrity** | **fixed** `b6ccf8b+806048e` |
| P-123 | **Ban-lift confirm dialog identifies the user by a truncated UUID** | **safety** | **fixed** `be66b56+fa394b0` |
| P-124 | P-116 recurs in 6 more sites reading a whole-store error alias | user-facing | **fixed** `c99ae81` |
| P-125 | `TeamDetailPage` renders roster/invitation roles raw — actually THREE sites (roster, invitation, join-request) | user-facing | **fixed** `86701cc` |
| P-126 | A disbanded team can still be renamed — no terminal check on update | integrity | **fixed** `f3c6550` |
| P-118 | **Evidence upload URL hard-coded to the dev stack** | **cross-env** | **fixed** `a9e2988` |
| P-119 | Stale specs asserted raw enums the status-map sweeps humanised | test rot | **fixed** `3bcfd12` |
| P-120 | Rank tiers can never be cleared once set | product gap | open |
| P-121 | `per_page` on `GET /v1/games` is decorative — no limit/offset applied | correctness | **fixed** `339fc13` |
| P-122 | `gamesStore.error` is app-wide; one page's failure alerts another | user-facing | **fixed** `98c5b72` |
| P-117 | Stage formats rendered and offered raw; ratchet regex missed `.format` | user-facing | **fixed** `af05f75` |
| P-113 | **Ownership transfer leaves the RBAC role behind — new owner 403s, old owner retains power** | **authorization** | **fixed** `754ec46` |
| P-114 | Invitations table has no Message column, so P-94's message is invisible | user-facing | **fixed** `eda3bc2` |
| P-115 | Invitations/applications identify people by a truncated UUID | user-facing | **fixed** `eda3bc2+e820ebe` |
| P-116 | `TeamDetailPage` handlers read the wrong action state, so errors are generic | user-facing | **fixed** `fdc4721` |
| P-112 | **API stringifies enums it already declares — 10 maps unlockable** | **architectural** | **fixed** `c7f9ae1` |
| P-93 | **Date overrides saved one day early in every positive UTC offset** | **data corruption** | **fixed** `2b4d4ee` |
| P-87 | **Every game-config WRITE 404s — handler passes UUID to a slug-keyed update** | **feature dead** | **fixed** `024513b` |
| P-88 | A disabled game vanishes from admin and can never be re-enabled | **traps admin** | **fixed** `f9d2fe1` |
| P-89 | `AdminGamesPage` aria-labels rotated by one — **P-45 recurrence** | **a11y/safety** | **fixed** `b137146` |
| P-90 | `GameEditModal` Sort Order shows a fake 0 and can never be set to 0 | user-facing | **fixed** `f9d2fe1` |
| P-91 | Disable writes `maintenance`; status chip prints the raw enum | user-facing | **fixed** `b992f2a` |
| P-92 | Rank tiers + team size are read-only with no editing surface anywhere | product gap | **fixed** `f9d2fe1` |
| P-86 | e2e fixtures type statuses as bare `string` — P-31 stops at the test boundary | gate gap | **fixed** `ccd4850` |
| P-82 | **"Revert to Awaiting Result" always 400s — dead control ×2** | feature dead | **fixed** `4166015` |
| P-83 | **Revert Progression is a no-op on elimination, claims success** | **integrity** | **fixed** `8e56adf` |
| P-84 | Admin scheduling notes discarded; no status-log row | audit gap | **fixed** `1d5c9e5` |
| P-85 | `MatchesTab` rows have no `data-testid` | test-facing | **fixed** `b137146` |
| P-139 | **`admin.system.manage` was in the registry but in NO migration — `submit_player_rating` 403'd for every caller, super_admin included, for the endpoint's whole life** | **authorization** | **fixed** `0080` |
| P-140 | Nothing asserted a declared permission is seeded and granted, so P-139 was invisible | gate gap | **fixed** `2751a44` |
| P-141 | `admin.audit.view` declared, seeded nowhere, gated on by nothing, guards a subsystem that does not exist | dead code | **fixed** `2751a44` |
| P-142 | **`PermissionChecker` short-circuits for the dev user in `test-utils` builds, so no integration test calling as `dev-token` ever consults the permissions table** | **gate gap** | open |
| P-143 | Enrichment-failure rendering is API-covered but not UI-covered — the e2e stack mints no `X-API-Key`, so no test can drive a failure into the page | coverage gap | open |
| P-144 | Demo-catalog counts are global, not game-scoped — a CS2 admin sees totals inflated by every other game | correctness | open |
| P-145 | **Every `entity_changes` insert failed — `ip_address` bound as text into an INET column. The audit trail was CLI-read-only and had never been written to** | **audit dead** | **fixed** `297a19e` |
| P-146 | `seed reset` ran `UPDATE entity_changes SET changed_by = NULL` against a `NOT NULL` column — impossible by construction, harmless only while nothing wrote to the table | latent | **fixed** `261e302` |
| P-147 | `create_team` / `register_for_season` seated a captain WITHOUT the roster-lock enforcement point — same shape as P-15. Decided: founding is governed by REGISTRATION, not the lock (a second veto would let two mechanisms disagree), and the exemption is now a named `RosterChange::Founding` arm inside `refusal_reason` rather than an omission at two call sites | enforcement | **fixed** `0d2981b` |
| P-148 | **The roster lock was inert once a season went active — season STATUS was the gate, so the lock only ever spoke when it did not need to.** Owner ruled the lock should be the control and optional (casual league). `SeasonStatus::allows_roster_changes()` deleted; non-terminal phases defer entirely to `roster_lock_status`, terminal seasons refuse regardless. **Granularity is per-SEASON; per-tournament would be new work** | **blocker rationale wrong** | **fixed** `0d2981b+085e7c5` |
| P-201 | **An operator could not TIGHTEN the lock on a season that had started** — `ensure_lock_change_allowed` gated setting the lock on the same `draft|registration` predicate, i.e. it refused at exactly the moment a league decides rosters are final | product gap | **fixed** `0d2981b` |
| P-202 | **`create_join_request` was the only roster path still frozen by phase** — it opened with `is_registration_open()`, so a player could be *invited* onto a mid-season open roster but not *ask* to join it. P-15's shape via a different predicate | enforcement | **fixed** `0d2981b` |
| P-149 | Override audit rows are written but have no HTTP read surface — only `portal-cli` can read them | ops gap | open |
| P-150 | `entity_changes.changed_by` is `NOT NULL REFERENCES players(id) ON DELETE SET NULL` — a self-contradictory pair | schema | open |
| P-151 | **Permission strings used as bare literals (10 sites) are absent from the registry, so the P-140 guard cannot see them** | **gate gap** | **fixed** `61fa1f1` |
| P-152 | **The admin route guard named `'admin'`, a role NO migration seeds — a granted `platform_admin` was bounced off every admin route. Silently halved P-70** | **blocker half-open** | **fixed** `e92aead` |
| P-153 | **`revoke_role_from_user` has no priority ceiling (its `assign` counterpart does) — a platform_admin can strip a super_admin's role. The UI hides the buttons; that is cosmetic** | **authorization** | **fixed** `df76b70` |
| P-154 | After selecting from any `SearchAutocomplete`, the next click anywhere is swallowed — measured app-wide, pre-existing | user-facing | open |
| P-155 | `BanCreateModal` posts a *player* id as `user_id`; works only via the deliberate 1:1 `make_shared_account_ids` invariant, whose own doc reserves the right to migrate away | latent | open |
| P-156 | The admin games handler hardcodes an in-memory catalog slice; past 100 games it needs a real `LIMIT/OFFSET` query (the store now warns rather than truncating silently) | scale | open |
| P-157 | **Deleting evidence unlinks the demo best-effort (`let _ = ...`) and still returns 204** — P-135's mechanism one layer down: a failure leaves a link pointing at deleted evidence while the caller is told it worked | **trust** | open |
| P-158 | The identical "Unlink" gesture means different things on the participant panel and the admin tab — the admin path removes only the link, leaving the `match_evidence` row listed | correctness | open |
| P-159 | `linkDiscoveredDemo` recovers the new link by matching `game_number`, so on bo3+ it can map the evidence id onto the WRONG link | correctness | open |
| P-160 | `docker-compose.yml:76` defaults `CS2_DEMO_SERVICE_URL` to the live third-party host — P-137's mechanism surviving in deployment config | **config safety** | open |
| P-161 | `POST /evidence/validate-demo` and `GET /evidence/demo-stats/{name}` are dead API surface — the store actions exist, no component calls them, so P-137 has no UI to drive | feature dead | open |
| P-162 | `derive_result_outcome` was dead code — **no longer dead**: P-165's tie fix routed `dispute.rs:517` and `result.rs:453` through it, which is what stopped a tie fabricating a winner. Verified clean | debt | **fixed** `1a6743b` |
| P-163 | **`league.create` was declared but never seeded — a second P-139. The first handler to gate on it would 403 everyone including super_admin** | **authorization** | **fixed** `0081` |
| P-164 | **The P-140 guard covered `admin::ALL` only — 1 of 5 registries — so an unseeded `tournament.results.manage` would have slipped through it too** | **gate gap** | **fixed** `1a6743b` |
| P-165 | **`resolve/adjusted` silently fabricated a winner on a TIE and wrote it into the bracket** (`p1 > p2 ? p1 : p2` awards equal scores to participant 2) | **integrity** | **fixed** `1a6743b` |
| P-166 | `LineupDeclarePanel` carried the identical 100-row ceiling — past row 100 no lineup could be declared at all | blocks core flow | **fixed** `7d02c59` |
| P-167 | **`TournamentDetailPage` scanned registrations at the DEFAULT `per_page: 20`, so past row 20 everyone was told they were not registered.** Replaced by `/registrations/me` + `/registrations/counts`; the scan is deleted, not widened | **blocks core flow** | **fixed** `8a7ae7e+df69c36` |
| P-168 | **Only the person who clicked register could submit or confirm for a TEAM.** Wider than filed: evidence and scheduling carried hand-copies of the same rule and refused the same people. One rule now — `speaks_for_registration` | **blocks core flow** | **fixed** `8a7ae7e+df69c36` |
| P-169 | **Revert searched for the participant the match advanced BY IDENTITY, and a P-72 correction rewrites exactly that column — so after a winner-flipping correction it found nobody, returned 200, and left the OLD winner in the next round.** The literal no-op was already fixed (P-83 `8e56adf`); this was the same defect one layer in, which P-72 made reachable | **integrity** | **fixed** `7a19c34+b5144a8` |
| P-180 | **`MatchCompletionSaga::compensate()` marks compensation COMPLETE having undone nothing** — logs "requires manual compensation review", fetches the progression logs, comments "actual deletion would depend on business requirements", then completes. A failed saga leaves the winner advanced. On the AUTOMATIC path, not an admin tool | **integrity** | open |
| P-181 | `seed_by_season_rank` silently falls back to rating seeding with an `info!` log — an operator who picks season-rank seeding gets rating seeding and is never told | user-facing | open |
| P-182 | `get_team_name_for_registration` returns the literal `"Current Team"` for every registration, so veto-timeout broadcasts name a team that does not exist | user-facing | open |
| P-183 | Default `validate_evidence` returns `is_valid: true` for any game with no implementation (mitigated: `confidence: 0.0` + a warning string) | integrity | open |
| P-184 | **Reapply's mirror image: the winner attribution write lived inside the RR/Swiss standings branch, so on elimination brackets reapply moved the bracket to the new winner while `winner_registration_id` still named the old one** — the match disagreeing with the pairing it produced | integrity | **fixed** `7a19c34` |
| P-185 | **An organiser could not approve pending registration #21 at all** — neither participant table had a server pager | **blocks core flow** | **fixed** `8a7ae7e+df69c36` |
| P-186 | **Swiss next-round pairing builds its registration map from a 1000-row page and `filter_map`s standings through it — a participant past row 1000 is silently DROPPED FROM THE PAIRING.** Data loss, not display | **integrity** | open |
| P-187 | `seed_by_*` seeds only the first 1000 registrations | integrity | open |
| P-188 | `process_no_shows` iterates only the first 1000 approved rows; anyone past that is never marked no-show | integrity | open |
| P-189 | Result-override audit read hard-coded to `100, 0` with no pagination surface | admin gap | open |
| P-190 | **`HomePage` upcoming-matches scans `per_page: 100` per tournament AND matches only `player_id`, so a team-only participant never sees ANY upcoming match** | user-facing | open |
| P-191 | Eight more page/component/composable pagination scans (`TeamDetailPage` 20, `LeagueSearchAutocomplete` 200→clamped to 100, `useLeagueDetail`/`LeagueDetailPage` 20 with counts from `.length`, `HomePage:487`, `LeagueMembersModal`, `leagues.ts:295`, `TournamentInvitationsModal`) | user-facing | open |
| P-192 | **The pagination guard globbed `src/stores/**` only, so every page/component/composable instance was INVISIBLE to it** — green throughout while 13 scans sat outside its field of view. Scope is now asserted, so narrowing it fails loudly instead of shrinking coverage behind a passing tick | **gate gap** | **fixed** `d88a783` |
| P-193 | Check-in disagrees exactly as P-168 did: `useMatchDetail:92` shows the panel to any roster member, the backend accepts only captain/owner/delegate/staff → silent 403. Needs a product ruling | user-facing | open |
| P-194 | **`v_player_league_teams` has no `left_at IS NULL` filter while `is_member` does, so `GET /v1/players/me/league-teams` returns teams the player has LEFT** — feeds `myTeams`, `hasEligibleTeams` and the team picker | correctness | open |
| P-195 | Capacity count excludes `'withdrawn','rejected'`; `'rejected'` is not in the status enum (dead literal), and `disqualified` rows still occupy a slot | correctness | open |
| P-196 | `progression.rs:122 fills_from` was dead code warning on every build — **no longer dead**: P-169's structural revert (`7a19c34`) is precisely what needed it (`:1076`). Verified: `cargo check -p portal-domain` emits no warning | debt | **fixed** `7a19c34` |
| P-197 | **`team-management.spec.ts:1208` was RED, not merely obsolete** — its refusal regex stopped matching any backend string when `297a19e` unified the enforcement point. The message changed and the e2e was missed | test rot | **fixed** `085e7c5` |
| P-198 | `update_season` writes the generic field update and THEN calls `update_roster_lock` — two non-transactional writes, so a DB error between them half-applies the PATCH | integrity | open |
| P-199 | **`update_status` enforces a transition chain (Draft→Registration→Active→…) but `update_season` writes `status` as a plain field with NO validation, so `PATCH {status}` bypasses the chain entirely** — two mechanisms disagreeing about the same rule | enforcement | open |
| P-200 | `LeagueTeamSeasonResponse` carries no `roster_lock_status`, so `TeamDetailPage` makes a second round-trip to learn its own roster's lock (field on an already-registered DTO; no `openapi.rs` change needed) | user-facing | open |
| P-170 | After an override the claimed (wrong) score showed beside the corrected one with nothing saying which governs. **Owner ruling: show the corrected score.** Claim row kept (it is evidence); the UI now marks it superseded | user-facing | **fixed** `97f4ae7+64f83a4` |
| P-171 | `MatchResultsTab` printed `submitted_by_user_id` as a raw UUID while `submitted_by_display_name` sat unused on the same DTO — P-95/P-115/P-123 class | user-facing | **fixed** `97f4ae7` |
| P-172 | Evidence/demo chips read `id.slice(0, 8)`; v7 prefixes are timestamps, so files attached seconds apart rendered as identical chips | user-facing | **fixed** `97f4ae7` |
| P-173 | `tournament_matches.participant1_score` is `NOT NULL DEFAULT 0`, so "no result yet" is indistinguishable from "0-0" at the column level — `winner_registration_id` is the only honest has-result signal, and `?? '-'` fallbacks on those fields are dead code | latent | open |
| P-174 | **A player who leaves or is removed keeps a My Teams card whose chip printed the literal `left`/`removed`** — `teamStatusMap` was fed a THIRD enum nobody had keyed it against, and the P-112 sweep had deleted those values as belonging to neither | **live leak** | **fixed** `86701cc` |
| P-175 | `EvidenceDisplay:165` renders `evidence_type` raw; the property is outside the ratchet's list so the guard cannot see it. `evidence_type` is `string` on the wire — P-112 class | user-facing | open |
| P-176 | `AdminPipelinePage:376` renders `h.source` raw; `player_rating_history.source` is `VARCHAR(64)` with no CHECK, so genuinely unconstrained | debt | open |
| P-177 | **`LeagueMembersModal` disables actions on `membership_type === 'owner'`, but `LeagueMembershipType` is admin/moderator/member — `'owner'` is unreachable, so those guards NEVER fire** | enforcement | open |
| P-178 | `leagueStatusMap` is duplicated inline in three components instead of living in `statusMaps.ts`, so the ratchet cannot count it and it can drift three ways | debt | open |
| P-179 | **A regression INTRODUCED by P-167 hours earlier**: the new server-sourced counts were never invalidated, so the badge was right on load and stale from the first approval onwards. The old page-derived count updated for free because it read the array the mutations write to | user-facing | **fixed** `4f8eb58` |

**Inverse audit (2026-07-24):** all 268 spec operations joined against actual `web/src/`
consumers — **249 consumed · 19 not** (9 product gaps → P-59..P-64/P-66 · 2 service
endpoints · 8 superseded/dead → P-67). Generated client verified key-by-key against the
spec (not stale).

**Second pass — store-action reachability (2026-07-24):** the inverse audit joined *spec
operations* to consumers, so it could not see an endpoint that a **store action calls but no
component ever invokes** — the store counts as a consumer. Re-run at the store-action level
(every `async function` in `src/stores/**` grepped against `components|pages|composables|
layouts`), 26 actions have **zero** UI consumers → P-68, P-70, P-71. Most of the remainder are
benign (`recordCoinFlip`/`startVetoSession` — the backend drives veto over WS;
`fetchLeagueBySlug`, `fetchSeason` — superseded getters); those fold into P-67. **Repeat this
scan after any store refactor** — a dead action is exactly the shape of a feature that was
built and never wired.

### Open findings — detail

**P-3 — `checkInRequired` alone can't open check-in.** `is_check_in_open()` also needs a
check-in window; `CreateTournamentOptions` exposes no `checkInStart/End`. Minor/test-facing.
Also: `fixtures/checkin.fixture.ts` `advanceMatchToCheckingIn` swallows HTTP 400 (fail loudly
instead); `match-workflow-extra.fixture.ts` retains dead helpers.

**P-6 — SUSPECTED: result history doesn't refresh in-page after a dispute.** Backend flips
the claim; the timeline stayed "Awaiting Confirmation" ≥10s. `useMatchDetail.ts:222-228`
swallows refetch errors (`.catch(() => null)`). Confirm on a fresh run, then fix the refresh
and un-swallow — or kill the finding.

**P-14 — the roster lock cannot be set through the API.** The DTO accepts+validates
`roster_lock_status` (`dto/requests/league_team.rs:189-217`) but `update_season` never
forwards it, the repo command has no field, and the working `update_roster_lock`
(`services/league_team/season.rs:193-218`) has **no HTTP route**. All lock enforcement is
therefore unreachable. → T7.

**P-15 — substitute invitations bypass the roster lock.** The sharp form: **two paths
disagree** — `add_member_authorized` checks both lock predicates; `create_invitation`/
`accept_invitation` check only `role.is_primary()` and seat the member directly on the repo.
Fix = one enforcement point. → Roadmap C (structurally affected by the lineup redesign).

**P-16 — role changes not lock-checked.** `promote_to_captain`/`demote_from_captain`
(`team.rs:526-600`) ignore the season lock; the UI is stricter than the backend. Align. → T7.

**P-18 — no admin/emergency override of the roster lock.** The lock check is unconditional;
`roster_locked_by` exists as an audit column but no admin operation uses it. → T7. (The
match-level cousin — per-match rule waivers — is decided in lineup-design §0c, Roadmap B.)

**P-26 — "sub can't face own team" never enforced.** Stated in a migration comment only;
now expressible via the demo-derived lineup. **Being wired by the in-flight agent** as a
review-raiser (never a stat-strip).

**P-38/P-39/P-40/P-46/P-54 — league-invitations batch, agent in flight.** No league name on
the invitation card (`InvitationsPage.vue:43`, DTO lacks it) · answered invitations invisible
to admins (`handlers/leagues.rs:613` pending-only) · league decline lacks the confirm dialog
teams have · invite-only refusal 403-vs-400 inconsistency (aligning on 403; e2e 400
assertions updated as a documented spec change) · members pagination undeclared in the utoipa
block so generated types say `query: never`.

**P-41 — two create-team forms disagree on validation.** Admin modal `minLength(2)/max(100)`
vs public page `minLength(3)/max(50)` for the same endpoint. Reconcile against the backend.

**P-53 → P-56 — result submission blind past the registration page.**
`useMatchDetail.ts:298` resolves `userRegistrationId` by scanning the registrations list;
mitigated at `per_page: 100`, but `PaginationParams` caps at 100, so >100-participant
tournaments still break. Proper fix: a targeted lookup resolving **both** participants by id
(also feeds `opponentPlayerId`). Needs `openapi.rs`. → Roadmap A.

**P-55 — review queue FIFO.** `created_at ASC` (`portal-db/src/adapters/result_review.rs:193`),
bare `total`, no sort control — newest escalation is on the last page. → T8.

**P-58 — team matches credit participation to nobody.** `StatsUpdaterAdapter:171-207`
credits only individual registrations. Lineup-based team crediting landed (`3013f58`);
verify it survives the §6 attribution correction, then tick. → T4.

**P-59 — `schedule_match` direct-set had no authorization.** Any logged-in user could
direct-set any match's `scheduled_at` — which drives check-in windows and no-show forfeits,
so forfeits could be manufactured. Participants are unaffected by gating (they use the
negotiation flow; admins have their own consumed `/v1/admin/.../schedule`). Gate is in the
working tree; commit + red-proven test in Roadmap A; deletion (redundant surface) in P-67.

**P-60 — logout never revoked server-side. FIXED `409969b`.** Both endpoints existed —
`POST /v1/auth/logout` and `/logout-all`, the latter built for compromise response — with
nothing in the app calling either, so the refresh token stayed valid for its full lifetime
after the user pressed "Log out".

Three decisions worth keeping: `logout()` clears **locally first**, then revokes, and swallows
transport failures — the endpoint authenticates the refresh token in its body rather than a
bearer token, so clearing first costs nothing, and the reverse order would leave a user staring
at a logged-in UI while a request times out. `logoutAll()` does the **opposite** (request, then
clear, via `try/finally`) because it *does* need the bearer token. And the global 401 handler
in `main.ts` is rewired to a new `clearSession()`, not `logout()` — the server has already
rejected that token, so a revoke would be pointless *and* would 401 in turn, re-entering the
handler that called it.

"Log out of all devices" added to `ProfilePage`. Red-proved: removing the revoke fails "sends
the revoke" with 0 calls while the other three tests stay green, because they pin local
clearing — the suite distinguishes the fix from its surroundings rather than going uniformly
red. → **T0, done.**

**P-61 — UI disqualify doesn't cascade.** `admin_disqualify` (`handlers/forfeit.rs:200`)
forfeits remaining matches; the UI calls the status-flip variant
(`stores/tournament/_registrations.ts:131`), stranding matches mid-tournament. → T6.

**P-62 — transfer team ownership has no UI.** Endpoint works (e2e-proven,
`team-roster.spec.ts:188`); no control exists. → T6.

**P-63 — disband team has no UI.** `DELETE /v1/league-teams/{id}` gated
`team.settings.manage`; teams are un-removable from the product. → T6.

**P-64 — demo auto-link backfill unreachable.** `POST /v1/admin/demos/process-unlinked`
(`handlers/demos.rs:653`); admin page has the toggle but no run-backfill button. → T6.

**P-65 — `/users/me/action-items` unregistered in `openapi.rs`.** Route live
(`routes/users.rs:16`), handler annotated (`handlers/users.rs:140-151`), never added to
`paths(...)`/`components(schemas)`. The `as never` at `captainActions.ts:56` masks it; the
casts at `lineups.ts:68-96` are stale (those endpoints ARE registered). → T8.

**P-66 — invisible read surfaces.** Match status/history endpoints (transition log with
actor/when) unused by the static timeline; stored scheduling suggestions
(`handlers/availability.rs:490`) lost on reload. → T6.

**P-67 — dead-surface cleanup.** 501 `matches/{id}/progression` stub · `DELETE .../registrations/{rid}`
(non-forfeiting duplicate of the consumed POST withdraw) · orphaned `GET /v1/admin/demos/pending` ·
redundant single-getters (`players/me/games`, `players/{id}/games/{game_id}`,
`evidence/{evidence_id}` GET, `league-team-seasons/{id}` GET) · `schedule_match` post-P-59 ·
dead `fixtures/match.fixture.ts` helpers hitting removed paths · the benign zero-consumer
store actions from the second-pass scan (`awards.fetchLeaderboard` — superseded by
`fetchPlayerStatsLeaderboard`; `veto.createVetoSession/startVetoSession/recordCoinFlip/
fetchDelegates/createDelegate/revokeDelegate`; `leagues.fetchLeagueBySlug/fetchMyApplications`;
`leagueSeasons.fetchSeason`; `players.fetchPlayerTeams`; `auth.fetchMyRoles`;
`demos.associate/submitStats/markFailed`; `evidence.fetchDemoStats/validateEvidence/
validateDemo`; `_registrations.fetchCheckInStatus`). → T5.

**P-68 — a wrong scraped Premier rating cannot be corrected.** Ratings reach
`player_game_profiles` from exactly two places: the enricher's demo-derived path
(`handlers/internal.rs:482 process_demo_ratings`, the normal case) and the admin
`submit_player_rating` (`handlers/player_game_profiles.rs:264`, `SYSTEM_MANAGE`-gated, live at
`routes/players.rs:38`). The second has **no UI consumer** — the web app only ever reads
`rating-history` (`composables/usePlayerStats.ts:56`). Rating drives seeding (`SeedingTab`) and
league entry gates (`useLeagueEligibility`, `min_rating_per_player`), so a bad extraction
silently misseeds brackets and can lock a player out of a league with no operator remedy.
Fix = an admin rating-override control (player detail → set rating + source + reason), which
also gives P-73 its manual fallback. Note the handler writes `deviation=0, volatility=0.0`
(see P-69). → T6.

**P-69 — the platform Elo engine is dead code. DECIDED: out of scope.**
`calculate_rating_change` (`portal-plugins/src/games/cs2/mod.rs:591`, trait at
`traits.rs:212`) is called from **nowhere in production** — the only call sites are the trait's
own test (`:1573`) and the pass-through at `:1253`. `Glicko2Rating`
(`portal-core/src/types/rating.rs`) is likewise unreferenced by any live path, and the one
writer that does exist passes `deviation=0, volatility=0.0`, so the Glicko-2 columns on
`player_game_profiles` (`0007:13-17`) hold defaults forever.
**Product decision (2026-07-24, owner):** ratings are *mirrored from Valve Premier* via the
scraping pipeline — that is the model, and a platform-computed Elo adds nothing on top of it.
A platform Elo would only ever be for **league-private or team rankings**, which is not a
committed feature. So this is not a defect to fix; it is a dead surface that currently
**implies a live platform rating system that does not run**, which is how it misled this
audit. Action: delete the trait method + `Glicko2Rating`, or keep them behind a comment naming
them an explicit, unwired extension point for future league/team Elo. Do not leave them
ambiguous. → T5.

**P-70 — no UI grants a platform role.** `rbac.ts` exposes `getUserRoles:128`,
`assignRoleToUser:138`, `revokeRoleFromUser:160` — all three have **zero** consumers.
`AdminPermissionsPage` has only Roles and Permissions tabs (`:17-26`); it can author a role
and attach permissions to it, but never attach a role to a *person*. `AdminPlayersPage`'s role
chips are **team** roles (`teamRoleMap`, `:399`), not platform ones. Net effect: admins,
organizers and moderators can only be minted by seed or by hand in SQL — the RBAC system is
authorable but not assignable. Fix = a Users tab (or a Roles section on the player detail
modal) over the three existing actions; endpoints are live at `routes/admin.rs:28-36`. → T6.
`admin-surfaces.spec.ts:130` covers role→permission and must be extended to user→role.

**P-71 — a returning team cannot enter the next season.**
`leagueTeams.registerTeamForSeason:135` (`POST /v1/league-seasons/{id}/teams/register`) has no
component consumer; the only reachable path is `createTeam`-into-a-season. Since a
`LeagueTeamSeason` is per-season by design, an existing team is stranded when the season rolls
over — the captain's only route is to create a brand-new team, orphaning roster history,
trophies and match history. Fix = a "Register for <season>" action on `TeamDetailPage` /
`MyLeagueTeamsPage`, gated on league membership. → T6. (`leagueTeams.addMember` is also
consumer-less, but that one is structurally entangled with P-15 — resolve it there, not here.)

**P-72 — a confirmed-but-wrong score has no admin remedy.**
`MatchResultsTab.vue` is 119 lines with **zero handlers** — purely presentational — and there
is no admin result route (`routes/admin.rs` has result-*reviews* only). The sole score-writing
admin path is `POST /v1/admin/disputes/{id}/resolve/adjusted`, which requires a dispute to
exist. So the failure case is: both parties confirm a wrong score (or it auto-confirms after
the P-57 24h window), nobody disputes, and the bracket progresses on bad data that no operator
can correct. Note this compounds P-61 — progression has already run by then, and
`revert`/`reapply` (which *do* exist, `MatchAdminActionsTab:318-362`) move the bracket but
cannot change the score they replay. Fix = either an admin score-override writing through the
same path as `resolve/adjusted` + an audit row, or an admin-raised dispute. → T6.

**P-86 — P-31's status unions stop at the test boundary.** Found by red-proving the P-81 fix
with a *second* probe, and it falsified the assumption behind the first. Probe: pass
`'totally_not_a_real_status'` to `waitForTournamentStatus`. With the typechecker now on over
`e2e/`, it still **compiles clean** — because the fixture declares `expected: string`
(`fixtures/tournament-lifecycle.fixture.ts:209-213`), not the union. The generated unions do
exist (`types.ts:12815 TournamentStatus`, `:12664 TournamentMatchStatus`, `:9609
DisputeStatus`) but **1 of 41 e2e files imports the generated types at all**
(`team-roster.spec.ts`). So P-31's "a bad status literal is a compile error" guarantee holds
for `src/` and stops dead at the fixtures — the §2 trap note ("if a status literal doesn't
typecheck, the literal is wrong") is currently false for tests, which is worse than not having
the rule, because people trust it.

**FIXED.** `e2e/fixtures/api-status.ts` type-only re-exports the 20 generated status unions;
**12 fixtures, 25 sites** retyped from `string` to the right union (match → `TournamentMatchStatus`,
claim → `ClaimStatus`, proposal → `ProposalStatus`, dispute → `DisputeStatus`, registration →
`TournamentRegistrationStatus`, and so on). Type-only, so it erases before Playwright's runtime
resolution — confirmed by running 15 tests across the three most-edited fixtures (green).

Red-proved both directions: `'totally_not_a_real_status'` → `TS2345` naming the 8 legal
tournament statuses, `'not_a_match_status'` → `TS2345` naming the 11 legal match statuses, and
a **control** literal (`'in_progress'`) still compiles — a gate that rejects everything is as
useless as one that rejects nothing.

**It surfaced zero existing bad literals.** Worth stating plainly rather than dressing up: the
value here is forward protection, not a backlog. And note what it does *not* cover —
`match-workflow.spec.ts:253`'s `hasText: 'ready'` is a Playwright **locator string**, not a
typed parameter, so no amount of typing catches it. That remains a §4-F item; the guess
recorded when P-86 was filed was wrong.

Two statuses stay `string`, deliberately: **award** and **veto-session**. Neither enum is
declared in the spec, so there is no union to point at — both are annotated in place and
belong to the §4-G P-31 remnant batch.

**Lesson recorded for ground rule 10:** the probe that matters is the one aimed at the
*claim*, not the mechanism. Probe A ("does the gate run?") passed and would have been enough
to call P-81 done; Probe B ("does the gate deliver what I said it would?") is what found P-86.

**P-108 — attaching demo evidence to any match needs only a login. SECURITY.**
`link_discovered_evidence` (`handlers/evidence.rs:594-600`) takes `auth: AuthenticatedUser` and
performs **no participant or admin check**; the same absence in `link_demo` (`:1175-1180`).
Its sibling on the same surface, `validate_demo`, calls
`require_match_participant_or_admin` at `:1019` — so the gate exists, is used two hundred lines
away, and was simply not applied here. On the face of it any logged-in user can attach demo
evidence to any match in the system, including matches they have nothing to do with. Evidence
feeds result review and dispute resolution, so this is an integrity surface, not a cosmetic
one. Exactly the P-24 and P-59 shape — a write endpoint that everything around it gates.
**Triage before further coverage work.** Found by Lane 10 while reading for a test, not by a
test; flagged out-of-lane rather than acted on. → **A, security.**

**P-109 — a linked demo is invisible on every evidence surface in the product.**
`EvidenceService::link_discovered` stamps the row `EvidenceSource::PluginDiscovery`
(`portal-domain/src/services/tournament/evidence.rs:711`) **even though a human clicked "Link
demo"**, and `list_evidence` drops `PluginDiscovery` rows unless `include_discovered=true`
(`handlers/evidence.rs:325-329`), which defaults to `false`. No frontend caller ever passes it:
`stores/evidence.ts:193-201 fetchEvidence` sends no query and is the only reader
(`AdminMatchDetailModal.vue:111` → `MatchEvidenceTab`, and `useMatchDetail.ts:343`). So linking
a demo writes an evidence record the admin Evidence tab can never display. It cost Lane 10 a
cycle — its cross-check returned `[]` against a link that had demonstrably succeeded. The spec
now cross-checks with `include_discovered=true` and deliberately asserts nothing about the
default listing, so it does not certify the gap. Fix = stamp a human link as a human source, or
pass the flag. → T6.

**P-110 — the browse catalog offers demos it will refuse to link.** `link_demo`
(`handlers/evidence.rs:1189-1193`) resolves the demo by **file name against the external CS2
demo-stats service** (`portal-plugins/src/games/cs2/demo_client.rs:144-171`) and 404s when it
is absent — despite the request carrying `demo_id`, which the handler then uses anyway at
`:1213-1231` to create the link. The list the button acts on comes from the **catalog**
(`GET /v1/demos`), a different source of truth, so any catalogued demo whose `.stats.json` is
missing is offered and then rejected. No stats service runs on `:3100` in the e2e stack, so the
button 404s there unconditionally — which is why `linkManualDemo` could not be driven and no
test was written. → T6.

**P-111 — nothing in the product ever validates a demo against a result.**
`DemoBrowser.vue:250-261` renders a "Validated" chip from `item.link.validated`, but the demo
link's `mark_validated` (trait `portal-domain/src/repositories/demo.rs:162`, impl
`portal-db/src/adapters/demo.rs:710-727`) has **no caller anywhere in the workspace** — the only
production `mark_validated` call is the *evidence* repo's, from `validate_against_result`
(`services/tournament/evidence.rs:755`). `demo_match_links.validated` is `false` forever, so the
chip is dead template. Compounding it, the three store actions that would drive validation —
`evidence.validateDemo` (`stores/evidence.ts:252`), `validateEvidence` (`:239`) and
`fetchDemoStats` (`:203`) — have **zero** UI consumers (re-confirmed by the reachability scan).
So the backend validator, the plugin, the DB columns and the chip all exist, and no path
connects them. This closes §4-F's "demo validation" row as a finding rather than a test. → T6.

**P-102 — `lineup.spec.ts` read an env var nothing sets, and wrote to the dev database. FIXED.**
`lineup.spec.ts:10` read `process.env.E2E_API_URL`. **Nothing sets that variable** — not
`scripts/e2e-ephemeral.sh` (which exports `VITE_API_URL` at `:74`), not `playwright.config.ts`,
not CI; the other **52** e2e files all read `VITE_API_URL`. The consequence was not a missing
base URL but a *wrong* one: the spec fell back to `http://localhost:3000`, the long-lived **dev
API and dev database**, while its tokens were minted against the ephemeral stack. So its
API-side writes landed in the developer's real database and then failed `401 Invalid token` on
a foreign JWT secret.

It survived because it *passes* against the dev stack — the pre-ephemeral workflow — and only
the full-suite run under the ephemeral runner exposed it. Two lessons: an isolated green run
proves less than it looks, and a test that silently writes to the wrong database is worse than
a failing one. Fixed to `VITE_API_URL`; both lineup tests now pass on an ephemeral instance.

**P-103 — P-57's fix landed without updating the test that depended on the old window. FIXED.**
`captain-actions.spec.ts:251` asserted the `bg-error` critical badge and a `Nm left` countdown,
with a comment naming its own premise: `auto_confirm_at` is 15 minutes out, inside the store's
one-hour threshold. **P-57 deliberately raised that window to 24 hours** (`result.rs:136`,
`5590726`) and the test was not updated, so it has been failing ever since — undetected,
because nothing ran the whole suite.

Fixed under ground rule 9 (the *specification* changed): the e2e now asserts the real
post-P-57 rendering — `bg-warning` and `/^\d+h left$/`. But that leaves the `<1h` critical
branch unreachable from e2e, since no action item the suite can create has a sub-hour deadline.
Rule 9 also requires pinning what was *not* relaxed, so the threshold is now covered by
`src/stores/__tests__/captainActions.test.ts` (5 tests, new). That file asserts **both sides**
of the boundary — 59 min critical, 24 h not — so neither an always-true nor an always-false
threshold can pass it; it is self-proving without a destructive edit.

**P-104 — the edit modal's empty-pool gate is decorative, and the pool edit is discarded.**
`TournamentCreateModal.vue:38` disables Save on `!formRef?.mapPoolValid`;
`TournamentEditModal.vue:39` disables on `!formValid || !hasChanges` **only** — `mapPoolValid`
is exposed by `TournamentForm.vue:585-586` and never consulted. So clearing every map in Edit
Tournament shows the chip "Custom (0 maps)" and the warning "Select at least one map…", and
Save stays **enabled** and reports "Tournament updated successfully". Then
`TournamentEditModal.vue:105-110` takes **neither** branch — `mapPoolIsCustom` is true so the
DELETE is skipped, `selectedMapIds.length > 0` is false so the PUT is skipped — and the edit
evaporates. Lane 9 verified live: pool after "saving" empty = the original 7 maps. Two defects
in one control: a gate that doesn't gate (P-84/P-94 family) and a save that silently does
nothing. No test written — asserting "save is blocked" is red today, asserting "save succeeds
and nothing changes" certifies the bug. Fix = add `|| !formRef?.mapPoolValid`, matching create.
→ T6.

**P-105 — a failed map-pool reset is indistinguishable from success.**
`TournamentEditModal.vue:107`: `deleteTournamentMapPool(...).catch(() => {})`. The DELETE 404s
whenever no override row exists, and *any* failure is swallowed while the modal still emits
`saved` and the page shows the success snackbar. Lane 9's DELETE probe (fulfilled 204 with the
database untouched) is exactly what a real failure looks like from the UI. P-74/P-83 family.
→ T6.

**P-106 — `MapPoolPicker` cards are unlabelled clickable divs.** `MapPoolPicker.vue:34-55`
renders each map as a `v-card` with `@click` and no `role`, no `aria-pressed`, no accessible
name; selection is conveyed only by colour, opacity and a glyph swap, and there is no
`data-testid`, so the spec must locate by CSS class plus exact inner text. Joins the
P-85/P-89/P-100 a11y sweep. → T3.

**P-107 — the suite is red as a whole while every spec is green alone.** First full-suite run
of the campaign (2026-07-24, ephemeral instance 5): **302 passed, 4 failed, 3 did not run**.
Two of the four (`captain-actions:251`, `lineup:78`) were genuine and are now fixed as P-103
and P-102. The other two — `team-roster.spec.ts:49` (a promote that reports role `player`
instead of `captain`) and `tournament-admin.spec.ts:664` (the "View Public" button not
rendering) — **pass when the four are run together in isolation** and fail only in the full
run, i.e. cross-spec interference under `fullyParallel: true`.

This is a suite-integrity defect, not a product one, and it matters more than its severity
suggests: **the campaign has been validating specs one at a time and calling that green.** CI
runs `workers: 1`, which masks it. Candidate causes, in order: shared-identity state (the dev
token is one identity — ground rule 6), the global game config Lane 5 documented, and
action-item/roster state leaking between specs that share a seeded user. **FIXED — the suite is green: 316 passed / 0 failed** (2026-07-25, ephemeral instance 5).

Neither remaining failure was cross-spec interference after all; that first diagnosis was
wrong. `tournament-admin:664` cleared once P-102/P-103 landed. `team-roster:49` was a **latent
race in the test**: it clicked Promote and then `waitForLoadState('networkidle')`, which
resolves after 500ms of quiet — and if the request has not been *dispatched* yet, the
already-idle page satisfies it **immediately**. The API cross-check then read the roster before
the promote landed and saw `player`. It passed in isolation because the server won the race and
failed under full-suite load because it lost.

That is the dangerous shape: it would have passed locally forever and failed only in CI, and
the obvious reading ("flaky — add a retry") would have been exactly wrong. Fixed by waiting on
the mutation itself (`waitForResponse` on the promote POST, asserting 200), so the test is bound
to the event it cares about rather than to a proxy for it. The menu locator was also scoped to
the promotee's row — `.first()` on `.mdi-dots-vertical` was correct for a two-person roster but
positional, which is what the UUID-prefix trap warns against.

**Standing rule kept:** "the suite passes" may only be claimed from a full run.
`waitForLoadState('networkidle')` after an action that triggers a request is now a §2 trap.

**P-94 — the invitation message is collected, validated, then thrown away.**
`InviteUserModal.vue:33-42` renders "Message (Optional)" with `rules.maxLength(500)`, then calls
`sendInvitation(props.leagueId, form.value.user_id)` — and `stores/leagues.ts:238-245` sends
`body: { user_id: userId }` only. The backend *does* accept it
(`handlers/leagues.rs:597` forwards `req.message`), and `LeagueMembersModal.vue:204-209` renders
a Message column that can therefore never be populated for an invite. Identical shape to P-84.
Lane 8 fills the field to drive the modal and asserts nothing about it in either direction —
asserting either way would certify the defect. → T6.

**P-95 — an invite-only league cannot be invited to by a human.** `InviteUserModal` demands a
raw UUID typed by hand (`rules.uuid`, hint "Enter the UUID of the user to invite",
`InviteUserModal.vue:23-27`), while the sibling `BanCreateModal` on the same admin surface uses
`UserSearchAutocomplete`. **Nowhere in the product displays a user's UUID**: the members table
shows username/email but not the id, and the invitations/applications tables truncate to 8
chars (`LeagueMembersModal.vue:147`, `:201`). The endpoint is live and correct; the control is
unusable. So P-47 ("no frontend invite-only awareness", fixed `616a2d6`) is only half-closed —
the organiser can now see invite-only leagues but still cannot invite to one. Lane 8's test
passes only because it seeds the account over the API and knows the id. Fix = swap in
`UserSearchAutocomplete`. → T6.

**P-96 — league invitations/applications tables print the wire enum.**
`LeagueMembersModal.vue:150-154` and `:211-215` render `{{ item.status }}` raw, while the same
modal maps roles through `formatRole`. P-10/P-44/P-76/P-91 family — this class keeps
reappearing in newly-built tables, which argues for a lint rule rather than another one-off
fix. Lane 8 asserts the row's Cancel action instead of the chip. → T4.

**P-97 — every league silently gets a "Season 1" nobody configured.**
`trg_leagues_create_default_season` (`migrations/0028_fix_league_season_trigger.sql:49-53`,
`AFTER INSERT ON leagues`) creates a season in status **`registration`** with team sizes copied
from league defaults. Nothing in `LeagueCreateModal` mentions it, so an admin who creates a
league immediately has an **open-registration** season they never set up and may not know
exists. Recorded as a product question rather than a defect — it may well be intended
onboarding — but it should be either surfaced in the create flow or dropped. It cost Lane 8 a
run (its precondition asserted zero seasons) and is now pinned by the test rather than assumed
away. → T8.

**P-98 — the stage dialog's "Format (optional)" is mandatory.** `StagesTab.vue:45` labels the
select *"Format (optional)"* and `handleCreateStage` sends `format: newStage.format ?? ''`
(`:109`); the backend's `format` is a required string parsed into `StageFormat`
(`dto/requests/tournament.rs:525-528`), and `""` does not parse. Verified live against the
ephemeral API: `{"format":""}` → **400 "Invalid stage format"**. An organiser who believes the
field's own label gets a hard failure. Fix = drop "(optional)" and mark it required, or default
it. → T4.

**P-99 — `groups_and_playoffs` is a dead option, and the one valid value is missing.**
`StagesTab.vue:44` offers `single_elimination | double_elimination | round_robin | swiss |
groups_and_playoffs`, but `StageFormat::from_str` accepts
`single_elimination | double_elimination | round_robin | swiss | **group_stage**`
(`portal-core/src/types/tournament.rs:669-678`). Verified live: `groups_and_playoffs` → **400**,
control `swiss` → **201**. So the picker offers a value that always fails *and* omits the only
one that would work. Same class as P-82. → T6.

**P-100 — Vuetify `v-select` exposes no accessible name, app-wide.** The aria snapshot shows
the label as a plain node and the combobox unnamed, so `getByLabel(...)` cannot reach any
select in the application; the sibling `v-text-field` *does* get one (and doubles it — see the
§2 trap). Every lane that has touched a select hit this and worked around it positionally
(`admin-match-overrides.spec.ts:93-98`, `admin-management.spec.ts:225`, and Lane 6 again). It
is logged as a test-authoring trap in §2, but the underlying fact is an **a11y defect**: a
screen-reader user cannot tell what any select in the app is for. Belongs with the P-89
aria-label sweep. → T6.

**P-101 — the seeding fixture blessed a comparison that cannot be true. FIXED.**
`TournamentRegistrationResponse.seed` is `skip_serializing_if = "Option::is_none"`
(`dto/responses/tournament.rs:393`), so a **cleared** seed returns as an *absent key*, not
`null`. The generated client says `seed?: number | null` and is correct;
`fixtures/tournament-seeding.fixture.ts` declared `seed: number | null` **non-optional**, which
type-blessed `r.seed === null` — false for `undefined`. A wrong fixture type is worse than no
type: it makes the compiler vouch for a broken assertion, which is the P-81/P-86 lesson
appearing a third time in a different guise. Both interfaces are now optional with the
serialisation documented in place. Lane 6 also added the positive control its predecessor
lacked (`seedsBefore = [1,2,3,4]`), without which the post-clear assertion would have passed
even if `seed` were never serialised at all.

**P-113 — transferring team ownership leaves the RBAC role behind.** Found by Lane D while
building P-62's control, and it makes that control half-dead after the first use.
`create_team_with_season_and_captain` grants a **team-scoped `team_captain` RBAC role** to the
creator (`portal-db/.../league_team/team.rs:439-465`), but `transfer_ownership` (`:290-314`)
updates `league_teams.owner_player_id` and **nothing else** — verified: the UPDATE touches one
column and never goes near `user_roles`.

Since `disband_team`, `register_team_for_season` and `update_team` all gate on
`require_team_settings_manage`, after a transfer the **new owner gets 403 on all three** while
the **old owner can still disband a team they no longer own**. It also inverts the frontend:
`TeamEditPage` gates its form on `owner_player_id`, so the new owner sees a form whose save
403s. Related: `promote_to_captain` never grants the role either, so the roster "captain" and
the RBAC `team_captain` have fully diverged. Fix = move the scoped grant with the ownership,
in the same transaction. → **T0-class: authorization.**

**P-114 — the invitation message is stored and never shown.** P-94 made the message reach the
API; `invitationHeaders` (`LeagueMembersModal.vue:357-363`) has **no Message column** — only
`applicationHeaders` does. **This corrects P-94's own note in this register**, which claimed the
modal "renders a Message column that could therefore never be populated for an invitation": the
column does not exist for invitations at all, so the data now written is invisible. → T6.

**P-115 — invitations and applications identify people by a truncated UUID.**
`LeagueMembersModal.vue:147`/`:200` render `item.user_id.substring(0, 8)`. P-95 fixed the
*input* side (search by name), but the resulting row still cannot be read by a human — and per
the §2 trap, UUID v7 prefixes are timestamps, so two invitations created seconds apart are
genuinely indistinguishable. Needs `username`/`display_name` on `LeagueInvitationResponse`. → T6.

**P-116 — `TeamDetailPage` handlers report the wrong error.** `handlePromoteToCaptain`,
`handleCancelInvitation`, `handleAcceptRequest`, `handleDeclineRequest` and `handleApplyToTeam`
all read `teamsStore.error`, a computed alias over `fetchMyTeamsState` — so the real reason
(e.g. "member is already a captain") never reaches the user and they always get the generic
fallback. Lane D's new handlers use their own action state; the pre-existing ones were left
alone to keep that diff scoped. → E.

**P-112 — the API stringifies enums it has already declared, so the frontend cannot lock them.**
`DisputeResponse.priority` is `String` (`dto/responses/dispute.rs:53`, via `d.priority.to_string()`)
and `GameResponse.status` / `GameSummaryResponse.status` likewise — while
`DisputePriority` (`entities/dispute.rs:209`) already derives `Serialize` **and**
`utoipa::ToSchema`. The enum exists, is spec-ready, and the DTO throws it away.

Consequence: no union reaches `types.ts`, so those status maps cannot be keyed and are the
only ones that can still drift — which is exactly where P-79 and P-91 happened. **Ten of
twenty-four maps remain unlockable for this reason**, capped by the new ratchet.

This is the P-31 remnant, restated precisely: not "enums lacking `Serialize`" but *DTO fields
typed `String` in front of enums that are otherwise ready*. Fix = type the DTO field, register
the enum in `openapi.rs` `components(schemas)`, regenerate, then key the map — after which
that map can never drift again. Cheap per field; the ratchet's `MAX_UNLOCKED` is the meter.
→ **T4/C1 follow-on.**

**P-93 — a date override is saved one day early for every player east of Greenwich.**
`AvailabilityOverridesManager.vue:334-335` does
`new Date(form.override_date).toISOString().split('T')[0]`. `v-date-picker` emits a
**local-midnight** `Date`, so `toISOString()` re-reads that instant in UTC and rolls the
calendar day *back* for any positive offset. Reproduced on this runner (Europe/London, BST =
UTC+1): picking **Sat 15 Aug 2026** posts `override_date: 2026-08-14` and the list then renders
"Fri, Aug 14, 2026". A player marking themselves unavailable for a match day is silently
recorded as unavailable the day before — and available on the day they blocked out.

Lane 7 wrote the create test, watched it fail on the picked-day assertion, and **dropped it
rather than pin the runner to `TZ=UTC`** — which would have gone green forever while every
European player's overrides landed on the wrong day. That is ground rule 8 applied to a test
*environment* rather than an assertion, and it is the sharpest example the campaign has
produced: the tempting fix was one env var. The dropped test and its repro are preserved
verbatim in the spec header, ready to restore with the fix.

The same `toISOString()` pattern drives three more places, so expect the same skew in the
min-date guard and the past/future split: `AvailabilityOverridesManager.vue:255-258`, `:290`,
and `stores/availability.ts:65`. **FIXED.** A shared `toLocalDateString` helper (`utils/formatters.ts`, sibling to the existing
`formatDateTimeForInput`) now formats calendar dates from local parts, applied at all four
sites. Lane 7's dropped create-test is **restored** — that was the point of preserving it.

Red-proved twice over, and the second proof is the instructive one:
- Unit (`utils/__tests__/localDate.test.ts`): under `TZ=Europe/London` the old implementation
  fails 3 of 5 with `'2026-08-14'` vs `'2026-08-15'`; under `TZ=UTC` it fails only the
  explicitly-TZ-pinned case. **CI runs UTC**, so a test that did not pin `TZ` would have gone
  green against the bug on the machine that matters. That is why each case names its timezone
  and why a negative offset is included — the naive implementation is accidentally correct west
  of Greenwich, so only a two-sided test tells the fix from the bug.
- E2E: with the old line restored, picking `2026-08-03` stores `2026-08-02`.

The e2e locator is worth copying: it addresses the picker cell by `data-v-date`, the local ISO
date Vuetify stamps on each cell — so the locator *states the invariant*: click the cell
labelled X, and X must reach the server.

**P-87 — every game-config write 404s: a UUID handed to a slug-keyed update.**
`GameRepository::update` is declared `update(&self, slug: &str, ...)` and documented "Update a
game by slug" (`portal-db/src/repositories/game.rs:106`), erroring
`RepositoryError::not_found` at `:151-153` when nothing matches. Six handlers read the game via
`find_by_id_or_slug` (which accepts either) and then write with `game_repo.update(&game_id, …)`
where `game_id` is the **UUID**: `handlers/games.rs:508` (set_map_pool), `:778` (add_map),
`:851` (update_map), `:902` (remove_map), `:989` (set_rank_tiers), `:1055` (update_team_size).
Since `0024_restructure_games_uuid.sql` made `games.id` a UUID and added `slug`,
`GameSummaryResponse.id` is the UUID — which is exactly what `GameConfigDialog.vue:323,330,359,375`
→ `stores/games.ts:106-167` send. Verified live: the identical body is **200** on
`/v1/games/aoe4/maps/catalog` and **404 "Game not found: db15451c-…"** on
`/v1/games/{uuid}/maps/catalog`. So **Add Map, Edit Map, Delete Map and Save Pool are dead
controls** that pop the failure snackbar every time. `update_game`/`enable`/`disable` are
unaffected — they call `resolve_game_slug` first (`:339,551,609`), which is also the one-line
fix for the other six. Blocked the entire map-catalog-CRUD half of Lane 5's assignment: any
test would have had to assert the failure, i.e. certify the bug. → **T1**.

**P-88 — a disabled game cannot be re-enabled.** `AdminGamesPage` lists from `GET /v1/games`,
which is `list_active()` (`portal-db/src/repositories/game.rs:71-79`), and the Enable button
exists **only inside a row**. Disable a game and it leaves the list on the next fetch, taking
its own Enable button with it — permanently, from the admin UI. Lane 5's test passes only
because `stores/games.ts:88` patches the row client-side, so the control survives until
someone presses Refresh. → T6.

**P-89 — `AdminGamesPage` action buttons: aria-labels rotated by one. This is P-45 recurring.**
`AdminGamesPage.vue:65,74,83,95` — cog/`title="Configure"` carries `aria-label="Edit game"`;
pencil/`title="Edit"` carries `aria-label="Disable game"`; **`title="Disable"` carries
`aria-label="Enable game"`**; and the enable button carries `aria-label="Configure game"`.
`aria-label` wins for the accessible name, so a screen-reader user who activates the control
announced as "Enable game" **disables the game**. P-45 was the identical rotation in the RBAC
role rows ("Manage" wired to Delete), fixed in `fbe1500` — that fix was local, and the defect
class was never swept. **Fixing this one should include a repo-wide audit of `aria-label` vs
`title`/`@click` on icon buttons**, or it will surface a third time. Lane 5's tests locate by
`title` deliberately, so they do not certify it. → D, and add the sweep to G.

**P-90 — `GameEditModal` Sort Order is both fabricated and unsettable to 0.**
`GameEditModal.vue:148` always seeds the field to `0` because `GameSummaryResponse` carries no
`sort_order` — the real values (cs2=1, aoe4=2) are simply unknowable to the client, so the form
shows a number that is not the truth. `:183` then only sends the field when non-zero, so no
game's sort order can ever be *set* to 0. Fix needs the field in the DTO. → T4.

**P-91 — disable writes `maintenance`, and the chip prints the raw enum.**
`POST /disable` sets status **`maintenance`**, not `disabled` (`portal-db/src/repositories/game.rs:182`),
and `AdminGamesPage.vue:55` renders the status chip from the raw value instead of a label map,
unlike every other admin table (P-10/P-44 family). Related: `GameSummaryResponse.status` is a
bare `string` in the spec — no game-status enum is declared — so it is another **P-31 remnant**
for §4-G, alongside award and veto-session status. → T4.

**P-92 — rank tiers and team size cannot be edited anywhere.** `games.setRankTiers`
(`stores/games.ts:153`) and `games.updateTeamSize` (`:165`) have zero component consumers;
`GameConfigDialog.vue:162-184` is a read-only `v-list` and `:186-204` is a `readonly` field
captioned "Team size is managed via the game plugin configuration" — **there is no plugin-config
surface in the application**. So the caption points at a door that does not exist. Both are
additionally blocked by P-87 even if a control were added. Same shape as P-62/P-70/P-71. → T6.

**P-82 — "Revert to Awaiting Result" can only ever fail.** `matchStatus.ts:39` maps
`completed → 'awaiting_result'` with the label "Revert to Awaiting Result" (`:53`), under a
comment claiming it "Must follow backend allowed_transitions". It does not:
`TournamentMatchStatus::Completed.allowed_transitions()` is `vec![]`
(`portal-core/src/types/tournament.rs:472` — `Completed | Forfeit | Cancelled => vec![]`) and
`admin_transition` hard-rejects even with override
(`portal-domain/.../match_lifecycle.rs:367`). Observed: `400 — "Cannot transition match from
completed to awaiting_result (even with admin override)"`. The dead control renders in **two**
places — `MatchOverviewTab.vue:66-74` and the `MatchesTab.vue:61-80` row menu — so **every
completed match in the admin table offers an action that always errors**. P-35-shaped. Lane 1
wrote no test: an honest one asserts the button is absent, and that fails today. Fix = drop
`completed` from the map (and decide separately whether admins need a real un-complete path,
which is P-72's territory). → T6.

**P-83 — "Revert Progression" is a no-op on elimination brackets and says it worked.**
`revert_progression` (`portal-domain/.../progression.rs:846`) clears results and recomputes
standings for `RoundRobin | Swiss` only. For elimination it logs *"Would revert winner
progression - needs implementation"* (`:870-880`) and returns **200**. Verified on a 4-player
single-elim bracket: the final's `participant1_registration_id`/`participant1_name` were
byte-identical before and after, and the source match stayed `completed`. Both the confirm
dialog (`MatchAdminActionsTab.vue:363`) and the card blurb (`:169-172`) promise that
"downstream pairings created from it are rolled back" — so an admin gets a success snackbar
for work that did not happen, on the single most destructive-sounding control in the tab.
Lane 1's revert test therefore runs on round robin rather than being weakened to assert a
bare 200. **Latent second bug:** `reapply` calls `revert` first (`progression.rs:906`), so it
only appears to work because `advance_winner` overwrites the same slot — a reapply whose new
winner routes to a *different* target slot would leave the stale entry behind. → **T1**.

**P-84 — the admin's reason for overriding a schedule is written nowhere.**
`MatchAdminActionsTab.vue:23-27` collects "Notes (optional)", the store forwards it
(`_matches.ts:132`), and `AdminScheduleRequest` accepts it
(`dto/requests/tournament.rs:906`) — but `admin_schedule_match` never passes it on
(`handlers/tournaments/scheduling.rs:425` calls `admin_schedule(match_id, req.scheduled_at,
auth.user_id)`) and `SchedulingService::admin_schedule` has no notes parameter
(`services/tournament/scheduling.rs:381`). Untestable by construction — nothing surfaces it.
**Compounding:** `admin_schedule` flips status via the repo (`scheduling.rs:419`), bypassing
`MatchLifecycleService::transition`, so an admin-forced schedule leaves **no
`match_status_log` row** either. Since scheduling drives check-in windows and no-show
forfeits (the P-59 attack surface), an admin override of it is precisely the event that
should be audited, and it is the one that is not. → T6.

**P-85 — `MatchesTab` rows carry no `data-testid`.** Rows are addressable only by participant
name, and one name is ambiguous once a winner is advanced into a later round, so Lane 1 had
to filter on both names. Minor and test-facing, but it makes the highest-bug-yield admin
surface the most awkward one to assert against. → T3.

**P-77 — upholding a claim-path dispute completes the match with no result.** Two defects
compound. (a) `raise_dispute` snapshots the **match row**, not the disputed claim —
`portal-domain/src/services/tournament/dispute.rs:128-130` takes
`original_*` from `match_.winner_registration_id` / `match_.participant{1,2}_score`. On the
claim path the match is not yet confirmed, so the "original" is 0-0/NULL. (b) `resolve_uphold`
(`same file:246-292`) only flips status to Completed via `resolve_with_status_change` — it
never confirms the claim it just upheld. Net result, reproduced by probe: upholding a disputed
**1-0** claim yields `{status: completed, winner: absent, p1: 0, p2: 0}` — a Completed bracket
match with **no winner**, which then feeds progression. The admin is also deciding on the wrong
data: `DisputeDetailModal.vue:53-56` renders "Original Score 0 - 0" for a 1-0 claim. Lane 2
therefore wrote uphold/adjust on a **confirmed-result** dispute (new fixture builder
`buildConfirmedResultDispute`) — the claim path cannot be asserted honestly. → **T1**.

**P-78 — rematch and double-DQ leave the previous result on the match.**
`resolve_with_status_change` (`portal-db/src/adapters/dispute.rs:483-546`) issues
`UPDATE tournament_matches SET status = $2` and nothing else — it never clears
`winner_registration_id`, `loser_registration_id`, `participant{1,2}_score` or `completed_at`.
Callers: `dispute.rs:379` (→ Ready, rematch) and `:510` (→ Cancelled, double-DQ). Probes:
rematch → `{status: ready, winner: 019f95ed…, p1: 1, completed_at: 2026-07-24T20:59:51Z}`;
double-DQ → `{status: cancelled, winner: 019f95ee…, p1: 1}`. So a match "ready to replay"
still records a winner and a completion time, and progression has **already advanced** that
winner. Lane 2's tests assert `winner == null` only on the never-confirmed path, with an
inline comment pointing here, so the suite does not certify the bug (ground rule 8). → **T1**.

**P-79 — dispute priority: the UI and the backend disagree on the top severity.**
`statusMaps.ts:133-138` defines `disputePriorityMap` with `critical`; the backend enum is
`low|normal|high|urgent` (`migrations/0039_disputes.sql:57-59`). `getStatusLabel`/
`getStatusColor` fall through to the raw key and grey, so an `urgent` dispute — auto-assigned
to every **cheating** report — renders as literal `urgent priority` in the lowest-weight
styling, while the filter at `AdminDisputesPage.vue:174-179` offers a "Critical" option that
can never match a row. P-10/P-44 family, and a **P-31 remnant**: priority is one of the
low-traffic `String` fields whose enum still lacks `Serialize`, so it was never compile-locked.
Fix belongs with the §4-G P-31 remnant batch. → T4.

**P-80 — "Assign to Me" assigns to nobody.** The `disputes` table has **no assignee column at
all** (`migrations/0039_disputes.sql:4-60`); `assign_for_review`
(`portal-domain/src/services/tournament/dispute.rs:196-240`) only sets `status = under_review`
and posts an internal system message. Two admins can both "take" the same dispute and neither
the queue nor the modal shows ownership — the button's label promises a guarantee the schema
cannot make. Lane 2's test asserts exactly what it does (status flip, button retires, system
message) rather than pretending assignment happened. Decide: add the column + show ownership,
or rename the control. → T6.

**P-81 — the e2e specs were never typechecked. FIXED.** `tsconfig.app.json` includes only
`src/**` and `tsconfig.node.json` only `vite.config.ts`, so **no tsconfig covered `e2e/`** —
the gate CI runs passed over 41 spec files and every fixture without reading them. Same class
as the §2 typecheck trap that already cost a phase: a green gate covering nothing. Both wave-1
lanes independently worked around it with standalone `tsc` runs.

Fix: `tsconfig.e2e.json` over `e2e/**` + `playwright.config.ts` (node/DOM libs, same strictness
as `src`), wired into `npm run typecheck` as a second pass, with `typecheck:app` /
`typecheck:e2e` split out for iteration. **The backlog was 2 errors, not the pile expected** —
a dead `_activateSeason` helper in `global-setup.ts` (deleted; git has it) and an unused
`leagueName` destructure in `invitations.spec.ts:232`. Red-proved per ground rule 10: a
deliberate `TS2322` in a file under `e2e/` fails the gate with exit 2, and `global-setup` was
smoke-run afterwards (seeding intact, 2/2 green) because deleting from the seed path is not a
free edit.

**The red-proof also produced P-86** — see below. Turning the compiler on was necessary but
**not sufficient** for the claim originally made here.

**P-74 — "Retry Processing" is a placebo that reports success.**
`AdminDemoDetailPage.vue:461-466` — `handleReprocess` calls **no API at all**. Its entire body
is a null check followed by `snackbar.success('Demo queued for reprocessing')`; the comment
admits it ("This would be handled server-side; for now just refresh") and it does not refresh
either. The operator is told a failed demo was requeued when nothing happened, which is worse
than a missing button: it converts a known-broken demo into one believed to be recovering.
Root cause is two unwired store actions — `demos.ts:252 submitStats`
(`POST /v1/admin/demos/{id}/stats`) and `demos.ts:265 markFailed` (`.../stats-failed`), both
with **zero** consumers. `submitStats` is almost certainly the call this button was meant to
make. Compounding it, the button is `v-if="currentDemo.status === 'failed'"`
(`:284`) and `failed` is only reachable via the internal/enricher path, so in a UI-only flow
it cannot even be made to appear — unreachable *and* inert. Net effect: a demo whose
enrichment failed can never be re-submitted from the portal, which is the manual fallback
P-73 would otherwise need. Fix = wire the button to `submitStats`, or delete it; do not leave
a control that lies. → D (with P-73/P-68 on the pipeline page).

**P-75 — a mis-associated demo cannot be corrected.** `demos.ts:185 associate`
(`POST /v1/admin/demos/{id}/associate`) has **zero** consumers; the Association card
(`AdminDemoDetailPage.vue:298-310`) is read-only. It also prints **raw UUIDs** —
`{{ currentDemo.league_id ?? 'None' }}` at `:303`, tournament at `:307` — so an admin cannot
even tell *which* league or tournament a demo was stamped onto without going to the database.
This is the repair path for the P-42 failure mode (auto-linked demos landing on the wrong
target): an admin can unlink the *match*, but the league/tournament association is
uncorrectable. Same shape as P-62/P-70/P-71 — endpoint live, control absent. Fix = make the
card editable over the existing action, and resolve the ids to names. → T6.

**P-76 — the categorize snackbar leaks the wire value.** `AdminDemoDetailPage.vue:435` —
`snackbar.success(\`Categorized as ${category}\`)` renders "Categorized as scrim" / "pug"
while the chip two lines away renders the `demoCategoryMap` label ("Scrim", "PUG"). P-10/P-44
family. Lane 4's test deliberately asserts the chip and **not** the snackbar, so the suite
does not certify the leak (ground rule 8). → T4.

**P-73 — the ingestion pipeline is invisible to operators.** Everything upstream of the demo
catalog runs through `routes/internal.rs` (`steam-tracking/active`, `.../poll-result`,
`discovered-matches` + `/pending` + `/claim` + `/enriched` + `/failed`, `demos/pending`,
`demos/{id}/stats-failed`) and **none of it has an admin read surface** — `AdminDemosPage`
starts at the catalogued demo. There is no view of tracking-token health, the discovered-match
queue depth, poll failures, or enrichment failures, so silent ingestion stoppage is
undetectable from the portal — and since ingestion is what supplies ratings, it fails
*quietly* into P-68. Fix = an admin "Pipeline" page over the existing internal reads (promote
them to admin-authed equivalents; do not expose `X-API-Key` routes to the browser). Pairs with
P-64 (the backfill button, same page). → T6.

## 6. Lineup system — status

Design: `api/docs/lineup-design.md` (§0–§0c authoritative; decision-complete). Model:
**demo is authoritative, declaration is provisional** — a captain declares once at check-in
(opponent-visible at lock); the per-map truth is derived from each map's demo; **attribution
follows registration** (a registered player in a demo is attributed, full stop; non-rostered
⇒ tagged substitute; no account ⇒ the ringer, raised via the review); majority/elo/own-team
rules are **review-raisers an admin can waive**, never stat-strippers.

**Built & verified:** schema (`0079`, + opt-in `league_seasons.lineup_required`) ·
provisional declaration write path (RBAC per the P-24 model, OpenAPI, wire-compat) ·
demo-derived materialization with sub auto-tagging · ringer detection raising the
two-captain review · team participation crediting (P-58) · store + `LineupPanel` +
check-in declaration picker · e2e: declare-through-UI + opponent-visibility-at-lock.

**Correction LANDED and verified (`29be78e`):** the gate is removed; a registered
non-declared sub keeps attribution (rewritten test asserts it, with the old assertion called
out as the bug); un-sideable players keep stats and raise a SIDE-UNASSIGNED review; P-26,
majority and elo are review-raisers. Roadmap-A verification item complete.

**Deferred with extension points:** evidence ladder + admin manual entry (Roadmap B — decided
scope) · §0c waivers (B) · retiring the `substitute` role / collapsing `RosterLockStatus`
(C) · mid-match `participation_status` writes.

## 7. Per-spec tracker

A = genuine · B = bypassed action · C = API-only asserts · D = vacuous (baseline 2026-07-22).

| Spec | tests | A | B | C | D | Fixed | Notes |
|---|---:|---:|---:|---:|---:|:--:|---|
| `veto-flow` / `veto-realtime` / `veto-realtime-full` | 7 | 7 | – | – | – | [x] | reference implementations |
| `veto-bo3.spec.ts` | – | – | 1 | – | – | [x] | rewritten; no API side-select |
| `tournament-seeding` / `tournament-lifecycle` | 7 | 7 | – | – | – | [x] | reference |
| `uploads.spec.ts` | 7 | 7 | – | – | – | [x] | incl. negative validation |
| `evidence` / `stats-leaderboard` | 4 | 4 | – | – | – | [x] | |
| `league-season.spec.ts` | 8 | 8 | – | – | – | [x] | season transitions API-only by design |
| `tournament-formats` / `team-tournament` | 5 | 5 | – | – | – | [x] | |
| `admin-demo-links` / `awards` / `steam-auth` | 10 | 7 | – | 3 | – | [x] | honest API-level tests |
| `dispute-resolution.spec.ts` (F Lane 2) | 8 | 8 | – | – | – | [x] | 3→8; red-proven; yielded P-77..P-81 |
| `auth.spec.ts` | 13 | 12 | – | – | 1 | [x] | |
| `match-checkin.spec.ts` | 3 | 2 | – | 1 | – | [x] | fallback removed |
| `team-roster.spec.ts` | 4 | 2 | 2 | – | – | [~] | transfer-ownership has NO UI (P-62) |
| `match-results.spec.ts` | 15 | 13 | 1 | – | 1 | [x] | |
| `player-profile.spec.ts` | 18+ | 15 | – | 2 | 1 | [x] | + restored Recent Matches tests |
| `match-workflow.spec.ts` | 18+ | 15 | – | – | 3 | [~] | negotiation+withdraw done; `:253` 'ready' remains (§4-F) |
| `admin-management.spec.ts` | 23+ | 18 | – | 2 | 3 | [x] | has real mutations |
| `tournament-admin.spec.ts` | 23 | 15 | – | – | 8 | [x] | 0 guards |
| `tournament-team.spec.ts` | 18 | 6 | – | 9 | 3 | [x] | 0 guards |
| `tournament-public.spec.ts` | 21+ | 8 | – | 4 | 9 | [x] | guards 25→0 |
| `team-management.spec.ts` | 34+ | 6 | 1 | 6 | 21 | [x] | rebuilt: 0 guards, 1290 lines |
| Newer: `invitations`, `league-join`, `team-join`, `captain-actions`, `admin-surfaces`, `admin-teams`, `admin-result-reviews`, `players-directory`, `match-status-timeline`, `match-result-notify`, `tournament-invite-only`, `lineup` | — | all A | | | | [x] | written under the ground rules |
| `admin-demo-detail.spec.ts` (F Lane 4) | 5 | 5 | – | – | – | [x] | red-proven; yielded P-74/75/76 |
| `admin-match-overrides.spec.ts` (F Lane 1) | 6 | 6 | – | – | – | [x] | red-proven; yielded P-82..P-85 |
| `admin-games-config.spec.ts` (F Lane 5) | 4 | 4 | – | – | – | [x] | serial-mode; red-proven; yielded P-87..P-92 |
| `player-steam-tracking` + `player-availability` (F Lane 7) | 8 | 8 | – | – | – | [x] | red-proved via a lying backend; yielded P-93 |
| `admin-modal-saves.spec.ts` (F Lane 8) | 5 | 5 | – | – | – | [x] | two probes; yielded P-94..P-97 |
| `tournament-admin` + `awards` (F Lane 6) | 21 | 21 | – | – | – | [x] | 17 pre-existing kept green; yielded P-98..P-101 |

## 8. Definition of done

- [x] Guardrails merged and enforcing in CI (ratchet, baseline `{}`)
- [x] Zero vacuous guards (112 → 0)
- [x] Every never-loaded route covered (`fbe1500`)
- [x] Class-B tests eliminated or honestly renamed (last one: veto-bo3, rewritten)
- [x] **Every mutating handler in `src/` exercised through the UI** (§4-F) — and every handler
      that cannot be, carrying a P-number that says why. **Met 2026-07-24** across 3 waves /
      9 lanes / 38 findings (P-74..P-111)
- [ ] Store-action reachability scan clean: no `async function` in `src/stores/**` without a
      UI consumer, except those explicitly retired in P-67. **Re-run 2026-07-24 after waves
      1-2: still 26, unchanged** — no new drift introduced, and every entry is accounted for
      by P-67/P-70/P-71/P-74/P-92
- [x] `match-workflow:253` name/assertion fixed (`c3d0122`) — the last misleading-name item
- [ ] Register drained to decided-wontfix or fixed (**50 open** after waves 1-2; the
      coverage wave is a finding *generator*, so this number rises before it falls)
- [x] **Full suite green in one run** (P-107) — 316/0 on 2026-07-25 (first attempt was 302/4/3)
- [x] Final spot-check: deliberately break a component and watch the suite go **red** —
      regressed `matchStatusMap.ready.label` to the raw enum `'ready'`; `match-workflow:242`
      failed (exit 1); restored; green (exit 0). Note the closed loop: **before the P-103-era
      `:253` fix this exact regression would have passed**, because case-insensitive matching
      could not tell `'Ready'` from `'ready'`.
