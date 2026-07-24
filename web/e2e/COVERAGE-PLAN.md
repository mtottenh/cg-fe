# E2E Coverage & Product Findings — Tracker

**Rewritten clean 2026-07-24.** The original working document grew to ~1900 lines of
analyse→correct→settle sediment; this version keeps **final states only**. The full history —
every superseded analysis, correction, and fixed-finding write-up — is preserved verbatim in
`COVERAGE-PLAN.old.md` (and in git). Methodology lives in `api/docs/audit-protocol.md`; the
lineup design in `api/docs/lineup-design.md`.

**Why this exists, in one line:** a test that genuinely drives the UI forces the question
*"what should happen here?"* — and that question surfaced **67 product findings** from what
began as a test-quality audit. The findings are the deliverable; the tests are the instrument.

**Campaign outcome so far:** 244 test executions audited (2026-07-22 baseline: 161 genuine,
88 vacuous-guard sites) → vacuous anti-pattern **eradicated** (ratchet baseline `{}`,
112 → 0) → **67 findings · 41 fixed** → the status-drift defect class closed at the source
(P-31: 1 → 17 spec enums; drift is now a compile error) → the lineup system built and being
corrected (§6) → the inverse audit run (268 API operations vs. frontend consumers).

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
| Web typecheck | **`npm run typecheck`** — NEVER `npx vue-tsc --noEmit -p tsconfig.json` (solution-style `"files": []`; checks **zero files, always exits 0**; it masked a real error for a whole phase) |
| Test-quality ratchet | `node e2e/scripts/check-test-quality.mjs` — baseline is `{}` (zero); may only stay zero |
| E2E | `npx playwright test e2e/<spec>` — **5173 is contended between parallel agents**; use a per-agent `E2E_WEB_PORT=51xx PLAYWRIGHT_BASE_URL=http://localhost:51xx` |
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
- Statuses are compile-checked unions since P-31 — if a status literal doesn't typecheck,
  **the literal is wrong**, not the type.

## 3. Current state

- **Suite:** ratchet `{}` · web typecheck clean · api suite green (last full sequential run:
  681 passed / 0 failed / 1 ignored — the ignored test needs the demo service on `:3100`;
  count grows as agents add tests).
- **In flight right now:**
  1. **Lineup attribution correction + P-26** (implementation agent) — see §6.
  2. **League-invitations API batch** (agent) — P-38, P-39, P-46, P-54, P-40.
- **Uncommitted in the tree, deliberately:** the **P-59 gate** on `schedule_match`
  (complete, in `match_lifecycle.rs`) — held because that file also carries the lineup
  agent's in-flight edits; committing now would sweep them.

## 4. Roadmap — remaining work in order

**A · The moment the lineup agent lands (contended-file queue):**
- [ ] Verify the attribution correction end-to-end (a registered non-declared sub KEEPS
      stats + gets the sub tag; unregistered stays NULL and raises the review; the rewritten
      `test_attribution_gated_to_lineup` asserts the corrected model; P-26 wired).
- [ ] Commit the **P-59 gate** + red-proven 403 test.
- [ ] **Admin manual-scheduling e2e** — `MatchAdminActionsTab.handleSchedule` exists and
      calls the properly-gated `/v1/admin/.../schedule`, but is untested (P-35-shaped risk).
      User-priority item.
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

**D · Product-gap wave (from the inverse audit):** P-60 (logout revocation — top item),
P-61 (cascading DQ), P-62 (transfer ownership UI), P-63 (disband UI), P-64 (backfill
button), P-66 (audit trail / stored suggestions).

**E · Minor sweep, one batch:** P-3 · P-6 (confirm-or-kill) · P-41 · P-58 verification
(landed in `3013f58`; confirm it survives the attribution correction, then tick).

**F · Coverage wave (§7-remainder + names), partitioned by surface:**
- Admin: `DisputeDetailModal` remaining resolutions (`handleResolveUphold/Adjusted/Rematch/
  DoubleDq/handleAssign`) · `MatchOverviewTab.handleTransition` · `StagesTab.handleCreateStage`
  · `AwardsTab.handleSaveEdit` · `AdminGamesPage` enable/disable · `AdminDemoDetailPage`
  (categorize/reprocess/notes/visibility) · `BanDetailModal` · modal saves: `LeagueCreateModal`,
  `LeagueEditModal`, `LeagueSeasonCreateModal`, `GameEditModal`, `GameConfigDialog`,
  `InviteUserModal`, `DemoCatalogModal` · `AdminTournamentDetailPage.handleClearSeeding`
- Player: `SteamTrackingCard` · `SocialLinksEditor` · `AvailabilityOverridesManager` ·
  `MapPoolPicker` · `DemoBrowser`
- Names: `match-workflow.spec.ts:253` asserts `hasText: 'ready'` (certifies the raw enum;
  survives only via case-insensitive matching) — assert the human label.
- Product decision embedded: captain **transfer-ownership has no UI** (P-62) — decide, then test.

**G · Cleanup & close-out:** **P-67** dead-surface batch (501 progression stub · DELETE
withdraw duplicate · orphaned `admin/demos/pending` · five redundant single-getters ·
`schedule_match` after P-59 · dead `fixtures/match.fixture.ts` helpers) · P-31 remnant
(9 low-traffic `String` fields whose enums lack `Serialize`) · §8 final spot-check.

## 5. Findings register — SINGLE SOURCE OF TRUTH

Every product bug/gap found by this work gets a P-number **here**. The table is
authoritative; the summary is derived from it, never hand-edited. Fixed findings keep only
their row (full write-ups: `COVERAGE-PLAN.old.md` + the commit named in the row). Open
findings have detail entries below the table.

**Status (derived): 67 found · 41 fixed · 26 open** (P-53 mitigated, P-59 gated-pending-commit).

Open: P-3, P-6, P-14, P-15, P-16, P-18, P-26, P-38, P-39, P-40, P-41, P-46, P-53, P-54,
P-55, P-56, P-58, P-59, P-60, P-61, P-62, P-63, P-64, P-65, P-66, P-67.

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
| P-26 | "Sub can't face own team" never enforced | integrity | 🟡 being wired (in-flight agent) |
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
| P-38 | League invitation never says which league | user-facing | 🔵 agent in flight |
| P-39 | Admin cannot see answered league invitations | admin gap | 🔵 agent in flight |
| P-40 | Decline confirmation guards the wrong action | minor | 🔵 agent in flight |
| P-41 | Two create-team forms disagree on validation | inconsistent | open |
| P-42 | **Auto-linked demos raised false reviews, stalled brackets** | **pipeline** | **fixed** `f6778e7` |
| P-43 | Review queue showed only the oldest 20, forever | user-facing | **fixed** `9f87495` |
| P-44 | `resultReviewStatusMap` 3/5 wrong, leaked raw enum | user-facing | **fixed** `070d104` |
| P-45 | Role-row aria-labels rotated; "Manage" wired to Delete | **a11y/safety** | **fixed** `fbe1500` |
| P-46 | invite-only refusal: 403 tournaments vs 400 leagues | inconsistent | 🔵 agent in flight |
| P-47 | No frontend invite-only awareness / organiser invite UI | feature unusable | **fixed** `616a2d6` |
| P-48 | User cannot see their own pending league application | user-facing | **fixed** `c7d395e` |
| P-49 | Captain cannot approve a join request from team page | blocks flow | **fixed** `c7d395e` |
| P-50 | **Result auto-confirmed with opponent never notified** | **integrity/trust** | **fixed** `2f94b47` |
| P-51 | Invitee cannot read own invite state (gate was soft) | design gap | **fixed** `c7d395e` |
| P-52 | Duplicate `operationId` broke the generated client | build | **fixed** `098832a`; guarded `c5ea9e5` |
| P-53 | **Player past registration #20 cannot submit a result** | **blocks core flow** | 🟡 mitigated `7775a19` → P-56 |
| P-54 | League members truncates at 20; client cannot paginate | user-facing | 🔵 agent in flight |
| P-55 | Review queue FIFO — newest escalation on the last page | admin friction | open |
| P-56 | >100-participant tournaments still can't submit (P-53 ceiling) | blocks core flow | open |
| P-57 | 15-min auto-confirm window too short for humans | trust | **fixed** `5590726` (24h) |
| P-58 | Team matches credit participation to nobody | integrity | landed `3013f58`, verify post-§6 |
| P-59 | **`schedule_match` direct-set: no authz → manufactured forfeits** | **security** | 🟡 gated in tree, commit pending |
| P-60 | Logout never revokes the session server-side | security gap | open |
| P-61 | UI disqualify doesn't cascade; strands matches | admin gap | open |
| P-62 | Transfer team ownership has no UI | product gap | open |
| P-63 | Disband team has no UI | product gap | open |
| P-64 | Demo auto-link backfill unreachable from UI | admin gap | open |
| P-65 | `/users/me/action-items` missing from OpenAPI doc | build (P-52 family) | open |
| P-66 | Match audit trail + stored suggestions invisible | minor | open |
| P-67 | Dead-surface cleanup batch | hygiene | open |

**Inverse audit (2026-07-24):** all 268 spec operations joined against actual `web/src/`
consumers — **249 consumed · 19 not** (9 product gaps → P-59..P-64/P-66 · 2 service
endpoints · 8 superseded/dead → P-67). Generated client verified key-by-key against the
spec (not stale).

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
dead `fixtures/match.fixture.ts` helpers hitting removed paths. → G.

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

**In flight (agent):** the attribution **correction** — the first implementation wrongly
hard-gated attribution on lineup membership and dropped un-sideable registered players;
being reworked to the model above, P-26 wired, `test_attribution_gated_to_lineup` rewritten
(it asserted the bug). **Verify on landing** (Roadmap A).

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
| `dispute-resolution.spec.ts` | 3 | 2 | – | 1 | – | [x] | |
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

## 8. Definition of done

- [x] Guardrails merged and enforcing in CI (ratchet, baseline `{}`)
- [x] Zero vacuous guards (112 → 0)
- [x] Every never-loaded route covered (`fbe1500`)
- [x] Class-B tests eliminated or honestly renamed (last one: veto-bo3, rewritten)
- [ ] Every remaining §4-F handler exercised through the UI
- [ ] `match-workflow:253` name/assertion fixed (last misleading-name item)
- [ ] Register drained to decided-wontfix or fixed (26 open as of the rewrite)
- [ ] Final spot-check: deliberately break a component and watch the suite go **red**
