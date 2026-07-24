# E2E Coverage & Product Findings — Tracker

**Rewritten clean 2026-07-24.** The original working document grew to ~1900 lines of
analyse→correct→settle sediment; this version keeps **final states only**. The full history —
every superseded analysis, correction, and fixed-finding write-up — is preserved verbatim in
`COVERAGE-PLAN.old.md` (and in git). Methodology lives in `api/docs/audit-protocol.md`; the
lineup design in `api/docs/lineup-design.md`.

**Why this exists, in one line:** a test that genuinely drives the UI forces the question
*"what should happen here?"* — and that question surfaced **92 product findings** from what
began as a test-quality audit. The findings are the deliverable; the tests are the instrument.

**Campaign outcome so far:** 244 test executions audited (2026-07-22 baseline: 161 genuine,
88 vacuous-guard sites) → vacuous anti-pattern **eradicated** (ratchet baseline `{}`,
112 → 0) → **92 findings · 50 fixed** → the status-drift defect class closed at the source
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
- **UUID v7 prefixes are timestamps** — two ids created seconds apart share their first 8
  chars; locate rows by full id (`data-testid`), never by prefix.
- **`useUnsavedChanges` uses `window.confirm`** — Playwright auto-dismisses dialogs, so a
  test navigating away from a dirty form silently fails to navigate. Never leave a form dirty.
- **`registerPendingPlayers` yields pending rows only on an `approval`-type tournament** —
  since P-2, `open` auto-approves. `CreateTournamentOptions.registrationType` exists for this.
- **`createLeague` fixture hardcodes `access_type: 'open'`** — invite-only/application
  leagues need a spec-local builder (precedent in `league-join.spec.ts`).
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

- **Suite:** ratchet `{}` · web typecheck clean · api suite green (last full sequential run:
  681 passed / 0 failed / 1 ignored — the ignored test needs the demo service on `:3100`;
  count grows as agents add tests).
- **Both in-flight agent streams LANDED 2026-07-24** (agents were stopped; work verified and
  committed by the orchestrator): lineup attribution correction + P-26 (`29be78e`), league
  batch API (`dc5136c`) + web half, P-59 gate (`930f8c9`, red-proven). Combined gate at
  landing: **686 passed / 0 failed**, fmt/clippy clean, ratchet `{}`, 6/6 on the touched specs.

### Parallel F wave 2 — IN FLIGHT (2026-07-24). Do not pick these up.

| Lane | Instance | Owns (only these files) | §4-F rows claimed |
|---|---|---|---|
| ~~5~~ | ~~`-i 1`~~ | **LANDED** `e50ec9c` — 4 tests green, red-proven | yielded **P-87..P-92** |
| 6 | `-i 2` | `e2e/tournament-admin.spec.ts` · `e2e/awards.spec.ts` | `StagesTab.handleCreateStage` · `handleClearSeeding` · `AwardsTab.handleSaveEdit` + void |
| 7 | `-i 3` | `e2e/player-steam-tracking.spec.ts` (new) · `e2e/player-availability.spec.ts` (new) + `fixtures/player-surfaces.fixture.ts` | `SteamTrackingCard` · availability windows/overrides · `SocialLinksEditor` |
| 8 | `-i 4` | `e2e/admin-modal-saves.spec.ts` (new) + `fixtures/modal-saves.fixture.ts` | `LeagueCreateModal` · `LeagueEditModal` · `LeagueSeasonCreateModal` · `InviteUserModal` · `BanDetailModal` |

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

## 4. Roadmap — remaining work in order

> **Execution order (set 2026-07-24, owner): A → F → B → C → D → E → G.**
> The letters are **stable identifiers**, not a sequence — §5 cross-references them by letter,
> so they are never renumbered. Read this line for priority, not the alphabet.
>
> **Why F jumped the queue.** This campaign's whole thesis (see the header line) is that
> *driving a surface through the UI is what surfaces product bugs* — 86 findings came out of a
> test-quality audit. That thesis is now measured: P-68/P-70/P-71 sat undetected through a full 268-operation
> inverse audit precisely because nothing drove them through the UI, and P-35 (a dead decision
> form) had already proved the same point. Every unexercised handler in F is therefore an
> **unsampled bug site**, and building D's features first only adds more of them. So: exercise
> every handler through the UI first, harvest the findings that fall out, *then* build.
> Corollary for F: when a handler cannot be driven because the control does not exist, that is
> not a blocked test — **that is the finding**. Register it (that is exactly how P-62/P-70/P-71
> were born) and move on.

**A · The moment the lineup agent lands (contended-file queue):**
- [x] Verify the attribution correction end-to-end (a registered non-declared sub KEEPS
      stats + gets the sub tag; unregistered stays NULL and raises the review; the rewritten
      `test_attribution_gated_to_lineup` asserts the corrected model; P-26 wired).
- [x] Commit the **P-59 gate** + red-proven 403 test (`930f8c9`).
- [x] **Admin manual-scheduling e2e** — done by F Lane 1 (`a60af09`). The handler works; the
      *notes* field it collects is silently discarded and the override leaves no status-log
      row → **P-84**.
- [x] **P-81 — typecheck the e2e specs.** `tsconfig.e2e.json` wired into `npm run typecheck`;
      backlog was 2 errors, both cleared; red-proved (TS2322 → exit 2) and seed path smoke-run.
- [x] **P-86 — fixture status params retyped to the generated unions** (`fixtures/api-status.ts`,
      12 fixtures, 25 sites). Red-proved both ways. Surfaced **no** existing bad literals —
      the value is forward protection, not a backlog.
- [ ] **P-65**: register `/v1/users/me/action-items` + `ActionItemResponse` in `openapi.rs`,
      regen types, drop the `as never` casts (`captainActions.ts:56`, `lineups.ts:68-96`).
- [ ] **P-56**: targeted registration lookup endpoint (resolve BOTH match participants by
      id) — fully closes P-53. `openapi.rs` registration required.
- [ ] **P-55**: review queue ordering (adapter is in the contended area).

**B · Lineup product completion (decided scope — see design §0b/§0c):**
- [ ] Evidence ladder: screenshot evidence + **admin manual lineup entry**
      (`source='evidence'|'admin'`).
- [ ] **§0c waiver flow**: `ResolutionType: waived` with mandatory rule+reason.
- [ ] Lineup integrity e2e (Phase F remainder): a played demo shows the substitute tag in
      the UI; an unregistered player surfaces the roster-mismatch review.

**C · Roster-lock rework** (design §9 sequences this LAST, after the lineup proves out):
P-14 (lock settable at all) · P-15 (single enforcement point) · P-16 · P-18 (audited admin
override) · collapse `RosterLockStatus` · retire the `substitute` role.

**D · Product-gap wave (from the inverse audit + the store-action second pass):**
P-60 (logout revocation — top item), P-61 (cascading DQ), P-62 (transfer ownership UI),
P-63 (disband UI), P-66 (audit trail / stored suggestions), **P-70** (role assignment UI —
RBAC is authorable but not assignable), **P-71** (season re-registration), **P-72** (admin
score correction), **P-68 + P-73 + P-64 together** — one admin "Pipeline" page carrying
ingestion health, the backfill button and the rating override, since they share a surface and
P-73 is what makes P-68 necessary.

**E · Minor sweep, one batch:** P-3 · P-6 (confirm-or-kill) · P-41 · P-58 verification
(landed in `3013f58`; confirm it survives the attribution correction, then tick).

**F · Coverage wave — PRIORITY AFTER A. Every handler driven through the UI.**

Exit criterion: **no mutating handler in `src/` is un-driven by an e2e test**, and every
handler that *cannot* be driven has a P-number saying why. Partitioned by surface so agents can
take one row each without contending; tick a row only when the test is red-proven (§1.10).

*Admin — match & dispute (highest bug-yield: these are the override paths, all confirm-gated):*
- [x] **LANE 2 landed** (`5955f9d`, `dispute-resolution.spec.ts` 3→8) — `handleResolveUphold` ·
      `handleResolveAdjusted` · `handleResolveRematch` · `handleResolveDoubleDq` ·
      `handleAssign`, each asserting the modal's Resolution card **and** the match row +
      `resolution_type` over the API. Yielded **P-77..P-81**; uphold/adjust had to be written
      on a new confirmed-result builder because the claim path cannot be asserted honestly (P-77)
- [x] **LANE 1 landed** (`a60af09`, `admin-match-overrides.spec.ts`, 6 tests) — `handleForfeit` ·
      `handleDoubleForfeit` · `handleProcessProgression` · `handleReapplyProgression` ·
      `handleRevertProgression`. Progression asserted both ways (process moves the semi winner
      into the final's slot 1, reapply rewrites it to p2). Revert had to be tested on **round
      robin** — on elimination it is a no-op that reports success → **P-83**
- [x] **LANE 1** — `MatchAdminActionsTab.handleSchedule` (admin manual scheduling) → **P-84**
- [x] **LANE 1** — `MatchOverviewTab.handleTransition` (ready→scheduled→in_progress, button
      relabels each step). The `completed → awaiting_result` entry is a dead control → **P-82**
- [ ] While here: `MatchResultsTab` is presentational with **zero** handlers → that is P-72

*Admin — tournament & league:*
- [ ] `StagesTab.handleCreateStage` · `AdminTournamentDetailPage.handleClearSeeding`
- [ ] `AwardsTab.handleSaveEdit` + void (author→standings→finalize is covered by
      `awards.spec.ts:53`; edit and void are not)
- [ ] Modal saves: `LeagueCreateModal` · `LeagueEditModal` · `LeagueSeasonCreateModal` ·
      `InviteUserModal` · `DemoCatalogModal` · `BanDetailModal`

*Admin — game config:*
- [x] **LANE 5 landed** (`e50ec9c`, `admin-games-config.spec.ts`, 4 tests) — enable/disable ·
      `GameEditModal` save + required-field gate · `GameConfigDialog` read paths.
      **The write half could not be driven and that is the finding**: `PUT maps`,
      `PUT rank-tiers`, `PATCH team-size` and map-catalog CRUD all 404 → **P-87**; rank tiers
      and team size additionally have no control at all → **P-92**

*Admin — demos:*
- [x] **LANE 4 landed** (`dc36288`, `admin-demo-detail.spec.ts`, 5 tests) — categorize ·
      visibility (incl. the `authorize_demo_read` gate: bystander 200 → 403 → 200) · notes
      (incl. `'' → null`) · catalog single · catalog batch (created + existing branches,
      idempotency). Not driveable, and that is the finding: **reprocess → P-74**,
      **`associate` → P-75**; the snackbar leak it declined to certify is **P-76**

*Player:*
- [ ] `SteamTrackingCard` (opt-in/opt-out — the entry point to the whole P-73 pipeline)
- [ ] `AvailabilityOverridesManager` + availability windows create/update/delete
- [ ] `SocialLinksEditor` · `MapPoolPicker` · `DemoBrowser`

*Names & honesty:*
- [ ] `match-workflow.spec.ts:253` asserts `hasText: 'ready'` (certifies the raw enum; survives
      only via case-insensitive matching) — assert the human label
- [ ] Product decisions embedded, to settle as their tests are written: P-62 (transfer
      ownership), P-70 (role assignment), P-71 (season re-registration) — each is a handler
      whose control does not exist. Decide, build the control, then test.

**G · Cleanup & close-out:** **P-67** dead-surface batch (501 progression stub · DELETE
withdraw duplicate · orphaned `admin/demos/pending` · five redundant single-getters ·
`schedule_match` after P-59 · dead `fixtures/match.fixture.ts` helpers) · P-31 remnant
(9 low-traffic `String` fields whose enums lack `Serialize`) · §8 final spot-check.

## 5. Findings register — SINGLE SOURCE OF TRUTH

Every product bug/gap found by this work gets a P-number **here**. The table is
authoritative; the summary is derived from it, never hand-edited. Fixed findings keep only
their row (full write-ups: `COVERAGE-PLAN.old.md` + the commit named in the row). Open
findings have detail entries below the table.

**Status (derived): 92 found · 50 fixed · 42 open** (P-53 mitigated).

Open: P-3, P-6, P-14, P-15, P-16, P-18, P-41, P-53, P-55, P-56, P-58, P-60, P-61, P-62, P-63, P-64, P-65, P-66, P-67, P-68, P-69, P-70, P-71, P-72, P-73, P-74, P-75, P-76, P-77, P-78, P-79, P-80, P-82, P-83, P-84, P-85, P-87, P-88, P-89, P-90, P-91, P-92.

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
| P-3 | `checkInRequired` alone can't open check-in | minor | open |
| P-4 | Tournament **header** shows raw status | user-facing | **fixed** |
| P-5 | Display name: signup allows dupes, save rejects | user trap | **fixed** `a3c1876` |
| P-6 | Result history stale after dispute | suspected | open |
| P-7 | Veto side-select unreachable in UI | feature dead | **fixed** |
| P-8 | Can propose a past time, then hard-fails | dead end | **fixed** `4b7edb4` |
| P-9 | Proposer cannot withdraw own proposal | API gap | **fixed** `a3c1876`+`4b7edb4` |
| P-10 | Admin registrations table prints raw enum | user-facing | **fixed** `f2694b0` |
| P-11 | Roster lock never enforced in admin UI | enforcement | **fixed** `ce732a0` |
| P-12 | No captain entry point to invite modal | blocks flow | **resolved** `ce732a0` |
| P-13 | `TeamEditPage` blank form to non-owners | confusing | **fixed** `ce732a0` |
| P-14 | **Roster lock cannot be set via API at all** | feature dead | open |
| P-15 | Invitation path bypasses the lock check | inconsistent | open |
| P-16 | Role changes not lock-checked | enforcement | open |
| P-17 | Edit modal offers a lock value the API 400s | user-facing | **fixed** `7b4aa8d` |
| P-18 | No admin/emergency override of the lock | design gap | open |
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
| P-31 | **API declares ~no enums — root of the status-drift class** | **architectural** | **class closed**; 25/41 fields, 17 enums |
| P-32 | `AdHoc` serialises as `ad_hoc` vs `adhoc` everywhere else | wire format | **fixed** `62f6726` |
| P-33 | Roster unreachable unless live season in 3 newest | user-facing | **fixed** `19241cf` |
| P-34 | `LeagueSeasonParticipantStatus` serialises PascalCase | wire format | **fixed** `71830df` |
| P-35 | **Result-review Decision Form never renders** | **feature dead** | **fixed** `5b39d88` |
| P-36 | Approve returned 400 for already-approved registrations | blocker | **fixed** `e5773f7` |
| P-37 | **League members endpoint unauthenticated, leaked emails** | **security/PII** | **fixed** `a0e1b98` |
| P-38 | League invitation never says which league | user-facing | **fixed** `dc5136c`+web |
| P-39 | Admin cannot see answered league invitations | admin gap | **fixed** `dc5136c` |
| P-40 | Decline confirmation guards the wrong action | minor | **fixed** (web) |
| P-41 | Two create-team forms disagree on validation | inconsistent | open |
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
| P-53 | **Player past registration #20 cannot submit a result** | **blocks core flow** | 🟡 mitigated `7775a19` → P-56 |
| P-54 | League members truncates at 20; client cannot paginate | user-facing | **fixed** `dc5136c` |
| P-55 | Review queue FIFO — newest escalation on the last page | admin friction | open |
| P-56 | >100-participant tournaments still can't submit (P-53 ceiling) | blocks core flow | open |
| P-57 | 15-min auto-confirm window too short for humans | trust | **fixed** `5590726` (24h) |
| P-58 | Team matches credit participation to nobody | integrity | landed `3013f58`, verify post-§6 |
| P-59 | **`schedule_match` direct-set: no authz → manufactured forfeits** | **security** | **fixed** `930f8c9` (red-proven) |
| P-60 | Logout never revokes the session server-side | security gap | open |
| P-61 | UI disqualify doesn't cascade; strands matches | admin gap | open |
| P-62 | Transfer team ownership has no UI | product gap | open |
| P-63 | Disband team has no UI | product gap | open |
| P-64 | Demo auto-link backfill unreachable from UI | admin gap | open |
| P-65 | `/users/me/action-items` missing from OpenAPI doc | build (P-52 family) | open |
| P-66 | Match audit trail + stored suggestions invisible | minor | open |
| P-67 | Dead-surface cleanup batch | hygiene | open |
| P-68 | Scraped Premier rating has no correction path | data integrity | open |
| P-69 | Platform Elo engine is dead code (never called) | **scope decided** | open → G |
| P-70 | **Platform role assignment has no UI** | admin gap | open |
| P-71 | Returning team can't enter the next season | blocks flow | open |
| P-72 | No admin score correction outside a dispute | admin gap | open |
| P-73 | Ingestion pipeline invisible to admins | ops blind spot | open |
| P-74 | **"Retry Processing" calls no API — reports success anyway** | **trust** | open |
| P-75 | Demo league/tournament association uncorrectable; shows raw UUIDs | admin gap | open |
| P-76 | Categorize snackbar prints the raw enum | minor | open |
| P-77 | **Uphold on a claim-path dispute completes the match with NO result** | **integrity** | open |
| P-78 | **Rematch / double-DQ leave the old winner + score on the match** | **integrity** | open |
| P-79 | Dispute priority: UI has `critical`, backend has `urgent` | user-facing | open |
| P-80 | "Assign to Me" records no assignee — no column exists | design gap | open |
| P-81 | **`e2e/` is in no tsconfig — specs are never typechecked** | **gate gap** | **fixed** `e06ff8f` |
| P-87 | **Every game-config WRITE 404s — handler passes UUID to a slug-keyed update** | **feature dead** | open |
| P-88 | A disabled game vanishes from admin and can never be re-enabled | **traps admin** | open |
| P-89 | `AdminGamesPage` aria-labels rotated by one — **P-45 recurrence** | **a11y/safety** | open |
| P-90 | `GameEditModal` Sort Order shows a fake 0 and can never be set to 0 | user-facing | open |
| P-91 | Disable writes `maintenance`; status chip prints the raw enum | user-facing | open |
| P-92 | Rank tiers + team size are read-only with no editing surface anywhere | product gap | open |
| P-86 | e2e fixtures type statuses as bare `string` — P-31 stops at the test boundary | gate gap | **fixed** `ccd4850` |
| P-82 | **"Revert to Awaiting Result" always 400s — dead control ×2** | feature dead | open |
| P-83 | **Revert Progression is a no-op on elimination, claims success** | **integrity** | open |
| P-84 | Admin scheduling notes discarded; no status-log row | audit gap | open |
| P-85 | `MatchesTab` rows have no `data-testid` | test-facing | open |

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
therefore unreachable. → Roadmap C.

**P-15 — substitute invitations bypass the roster lock.** The sharp form: **two paths
disagree** — `add_member_authorized` checks both lock predicates; `create_invitation`/
`accept_invitation` check only `role.is_primary()` and seat the member directly on the repo.
Fix = one enforcement point. → Roadmap C (structurally affected by the lineup redesign).

**P-16 — role changes not lock-checked.** `promote_to_captain`/`demote_from_captain`
(`team.rs:526-600`) ignore the season lock; the UI is stricter than the backend. Align. → C.

**P-18 — no admin/emergency override of the roster lock.** The lock check is unconditional;
`roster_locked_by` exists as an audit column but no admin operation uses it. → C. (The
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
bare `total`, no sort control — newest escalation is on the last page. → A.

**P-58 — team matches credit participation to nobody.** `StatsUpdaterAdapter:171-207`
credits only individual registrations. Lineup-based team crediting landed (`3013f58`);
verify it survives the §6 attribution correction, then tick. → E.

**P-59 — `schedule_match` direct-set had no authorization.** Any logged-in user could
direct-set any match's `scheduled_at` — which drives check-in windows and no-show forfeits,
so forfeits could be manufactured. Participants are unaffected by gating (they use the
negotiation flow; admins have their own consumed `/v1/admin/.../schedule`). Gate is in the
working tree; commit + red-proven test in Roadmap A; deletion (redundant surface) in P-67.

**P-60 — logout never revokes server-side.** `POST /v1/auth/logout` (`handlers/auth.rs:392`)
and `logout-all` (`:446`, built for compromise response) exist; `stores/auth.ts:354` only
clears localStorage. Call logout on sign-out; add "log out of all devices". → D.

**P-61 — UI disqualify doesn't cascade.** `admin_disqualify` (`handlers/forfeit.rs:200`)
forfeits remaining matches; the UI calls the status-flip variant
(`stores/tournament/_registrations.ts:131`), stranding matches mid-tournament. → D.

**P-62 — transfer team ownership has no UI.** Endpoint works (e2e-proven,
`team-roster.spec.ts:188`); no control exists. → D/F.

**P-63 — disband team has no UI.** `DELETE /v1/league-teams/{id}` gated
`team.settings.manage`; teams are un-removable from the product. → D.

**P-64 — demo auto-link backfill unreachable.** `POST /v1/admin/demos/process-unlinked`
(`handlers/demos.rs:653`); admin page has the toggle but no run-backfill button. → D.

**P-65 — `/users/me/action-items` unregistered in `openapi.rs`.** Route live
(`routes/users.rs:16`), handler annotated (`handlers/users.rs:140-151`), never added to
`paths(...)`/`components(schemas)`. The `as never` at `captainActions.ts:56` masks it; the
casts at `lineups.ts:68-96` are stale (those endpoints ARE registered). → A.

**P-66 — invisible read surfaces.** Match status/history endpoints (transition log with
actor/when) unused by the static timeline; stored scheduling suggestions
(`handlers/availability.rs:490`) lost on reload. → D/F.

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
validateDemo`; `_registrations.fetchCheckInStatus`). → G.

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
(see P-69). → D.

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
ambiguous. → G.

**P-70 — no UI grants a platform role.** `rbac.ts` exposes `getUserRoles:128`,
`assignRoleToUser:138`, `revokeRoleFromUser:160` — all three have **zero** consumers.
`AdminPermissionsPage` has only Roles and Permissions tabs (`:17-26`); it can author a role
and attach permissions to it, but never attach a role to a *person*. `AdminPlayersPage`'s role
chips are **team** roles (`teamRoleMap`, `:399`), not platform ones. Net effect: admins,
organizers and moderators can only be minted by seed or by hand in SQL — the RBAC system is
authorable but not assignable. Fix = a Users tab (or a Roles section on the player detail
modal) over the three existing actions; endpoints are live at `routes/admin.rs:28-36`. → D.
`admin-surfaces.spec.ts:130` covers role→permission and must be extended to user→role.

**P-71 — a returning team cannot enter the next season.**
`leagueTeams.registerTeamForSeason:135` (`POST /v1/league-seasons/{id}/teams/register`) has no
component consumer; the only reachable path is `createTeam`-into-a-season. Since a
`LeagueTeamSeason` is per-season by design, an existing team is stranded when the season rolls
over — the captain's only route is to create a brand-new team, orphaning roster history,
trophies and match history. Fix = a "Register for <season>" action on `TeamDetailPage` /
`MyLeagueTeamsPage`, gated on league membership. → D. (`leagueTeams.addMember` is also
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
same path as `resolve/adjusted` + an audit row, or an admin-raised dispute. → D.

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
test would have had to assert the failure, i.e. certify the bug. → **D, high.**

**P-88 — a disabled game cannot be re-enabled.** `AdminGamesPage` lists from `GET /v1/games`,
which is `list_active()` (`portal-db/src/repositories/game.rs:71-79`), and the Enable button
exists **only inside a row**. Disable a game and it leaves the list on the next fetch, taking
its own Enable button with it — permanently, from the admin UI. Lane 5's test passes only
because `stores/games.ts:88` patches the row client-side, so the control survives until
someone presses Refresh. → D.

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
game's sort order can ever be *set* to 0. Fix needs the field in the DTO. → E.

**P-91 — disable writes `maintenance`, and the chip prints the raw enum.**
`POST /disable` sets status **`maintenance`**, not `disabled` (`portal-db/src/repositories/game.rs:182`),
and `AdminGamesPage.vue:55` renders the status chip from the raw value instead of a label map,
unlike every other admin table (P-10/P-44 family). Related: `GameSummaryResponse.status` is a
bare `string` in the spec — no game-status enum is declared — so it is another **P-31 remnant**
for §4-G, alongside award and veto-session status. → E/G.

**P-92 — rank tiers and team size cannot be edited anywhere.** `games.setRankTiers`
(`stores/games.ts:153`) and `games.updateTeamSize` (`:165`) have zero component consumers;
`GameConfigDialog.vue:162-184` is a read-only `v-list` and `:186-204` is a `readonly` field
captioned "Team size is managed via the game plugin configuration" — **there is no plugin-config
surface in the application**. So the caption points at a door that does not exist. Both are
additionally blocked by P-87 even if a control were added. Same shape as P-62/P-70/P-71. → D.

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
which is P-72's territory). → D.

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
winner routes to a *different* target slot would leave the stale entry behind. → D, high.

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
should be audited, and it is the one that is not. → D, with P-66.

**P-85 — `MatchesTab` rows carry no `data-testid`.** Rows are addressable only by participant
name, and one name is ambiguous once a winner is advanced into a later round, so Lane 1 had
to filter on both names. Minor and test-facing, but it makes the highest-bug-yield admin
surface the most awkward one to assert against. → F/G.

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
`buildConfirmedResultDispute`) — the claim path cannot be asserted honestly. → D, high.

**P-78 — rematch and double-DQ leave the previous result on the match.**
`resolve_with_status_change` (`portal-db/src/adapters/dispute.rs:483-546`) issues
`UPDATE tournament_matches SET status = $2` and nothing else — it never clears
`winner_registration_id`, `loser_registration_id`, `participant{1,2}_score` or `completed_at`.
Callers: `dispute.rs:379` (→ Ready, rematch) and `:510` (→ Cancelled, double-DQ). Probes:
rematch → `{status: ready, winner: 019f95ed…, p1: 1, completed_at: 2026-07-24T20:59:51Z}`;
double-DQ → `{status: cancelled, winner: 019f95ee…, p1: 1}`. So a match "ready to replay"
still records a winner and a completion time, and progression has **already advanced** that
winner. Lane 2's tests assert `winner == null` only on the never-confirmed path, with an
inline comment pointing here, so the suite does not certify the bug (ground rule 8). → D, high.

**P-79 — dispute priority: the UI and the backend disagree on the top severity.**
`statusMaps.ts:133-138` defines `disputePriorityMap` with `critical`; the backend enum is
`low|normal|high|urgent` (`migrations/0039_disputes.sql:57-59`). `getStatusLabel`/
`getStatusColor` fall through to the raw key and grey, so an `urgent` dispute — auto-assigned
to every **cheating** report — renders as literal `urgent priority` in the lowest-weight
styling, while the filter at `AdminDisputesPage.vue:174-179` offers a "Critical" option that
can never match a row. P-10/P-44 family, and a **P-31 remnant**: priority is one of the
low-traffic `String` fields whose enum still lacks `Serialize`, so it was never compile-locked.
Fix belongs with the §4-G P-31 remnant batch. → E/G.

**P-80 — "Assign to Me" assigns to nobody.** The `disputes` table has **no assignee column at
all** (`migrations/0039_disputes.sql:4-60`); `assign_for_review`
(`portal-domain/src/services/tournament/dispute.rs:196-240`) only sets `status = under_review`
and posts an internal system message. Two admins can both "take" the same dispute and neither
the queue nor the modal shows ownership — the button's label promises a guarantee the schema
cannot make. Lane 2's test asserts exactly what it does (status flip, button retires, system
message) rather than pretending assignment happened. Decide: add the column + show ownership,
or rename the control. → D.

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
card editable over the existing action, and resolve the ids to names. → D.

**P-76 — the categorize snackbar leaks the wire value.** `AdminDemoDetailPage.vue:435` —
`snackbar.success(\`Categorized as ${category}\`)` renders "Categorized as scrim" / "pug"
while the chip two lines away renders the `demoCategoryMap` label ("Scrim", "PUG"). P-10/P-44
family. Lane 4's test deliberately asserts the chip and **not** the snackbar, so the suite
does not certify the leak (ground rule 8). → E.

**P-73 — the ingestion pipeline is invisible to operators.** Everything upstream of the demo
catalog runs through `routes/internal.rs` (`steam-tracking/active`, `.../poll-result`,
`discovered-matches` + `/pending` + `/claim` + `/enriched` + `/failed`, `demos/pending`,
`demos/{id}/stats-failed`) and **none of it has an admin read surface** — `AdminDemosPage`
starts at the catalogued demo. There is no view of tracking-token health, the discovered-match
queue depth, poll failures, or enrichment failures, so silent ingestion stoppage is
undetectable from the portal — and since ingestion is what supplies ratings, it fails
*quietly* into P-68. Fix = an admin "Pipeline" page over the existing internal reads (promote
them to admin-authed equivalents; do not expose `X-API-Key` routes to the browser). Pairs with
P-64 (the backfill button, same page). → D.

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

## 8. Definition of done

- [x] Guardrails merged and enforcing in CI (ratchet, baseline `{}`)
- [x] Zero vacuous guards (112 → 0)
- [x] Every never-loaded route covered (`fbe1500`)
- [x] Class-B tests eliminated or honestly renamed (last one: veto-bo3, rewritten)
- [ ] **Every mutating handler in `src/` exercised through the UI** (§4-F) — and every handler
      that cannot be, carrying a P-number that says why. This is now the lead objective
- [ ] Store-action reachability scan clean: no `async function` in `src/stores/**` without a
      UI consumer, except those explicitly retired in P-67
- [ ] `match-workflow:253` name/assertion fixed (last misleading-name item)
- [ ] Register drained to decided-wontfix or fixed (32 open as of 2026-07-24)
- [ ] Final spot-check: deliberately break a component and watch the suite go **red**
