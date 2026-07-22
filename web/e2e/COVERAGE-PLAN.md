# E2E Coverage Plan

Working tracker for bringing `web/e2e/` to genuine, non-vacuous frontend coverage.
Tick the boxes as work lands. **Read "Ground rules" before changing any spec.**

- **Baseline audit:** 2026-07-22 — all 27 spec files, 21 fixture modules, `global-setup.ts` read (~13k lines). 244 test executions.
- **Status legend:** `[ ]` todo · `[~]` in progress · `[x]` done (merged + CI green)

---

## 1. Why this exists

`ResultDisputeModal.handleDispute` shipped a real defect — it fired a redundant
`raiseDispute` call wrapped in `.catch(() => {})`, so **every dispute in production
silently made a failing API call**. No test caught it, because **no test ever clicked
"Submit Dispute."** The modal was only ever opened, validated, and cancelled; every
test that needed a disputed match created one through the API.

The audit that followed found this is not an isolated case. The suite's headline
problem is not slowness or flakiness — it is **tests that cannot fail**.

### Baseline numbers

| Classification | Count | Meaning |
|---|---:|---|
| **A** — genuine frontend test | 161 | API seeds preconditions; the action under test is driven through the UI; assertions are on the UI |
| **B** — bypassed action | 5 | The *core action the test claims to cover* is done via API, not the UI |
| **C** — API-only assertions | 28 | Asserts only on API/DB state; a broken component still passes |
| **D** — partial / vacuous | 50 | Opens a UI but never completes the action, or the body is skipped entirely |
| **Total** | **244** | |

The suite is **bimodal**. Specs written since ~Jul 2026 are genuinely good and should
be used as reference implementations. The four oldest specs hold most of the debt.

---

## 2. The anti-pattern that dominates (~88 occurrences)

```ts
if (await x.isVisible().catch(() => false)) {
  … the entire test …
}
```

If the element is missing — **exactly when the frontend is broken** — the body is
skipped and the test **passes green**. These tests are *vacuous*: they cannot fail.

| Spec | guards |
|---|---:|
| `team-management.spec.ts` | 42 |
| `tournament-public.spec.ts` | 25 |
| `tournament-admin.spec.ts` | 16 |
| `tournament-team.spec.ts` | 5 |
| every other spec | 0–2 |

Related "cannot fail" shapes to eliminate wherever found:

- `expect(a || b).toBe(true)` where `b` is the *empty state* of `a` (e.g. `hasTeams || hasEmptyHeading`).
- `expect(anything || true).toBe(true)` — literal tautology.
- Asserting the element you just typed into is non-empty, as a fallback for "the save worked".
- Asserting a page heading is still visible as a proxy for "the action succeeded".
- A test body with no action and/or no assertion.

---

## 3. Ground rules (apply to every test you write or fix)

1. **Seed via API, act via UI, assert on UI + backend.** Using fixtures to build
   preconditions is correct and encouraged. Performing *the action under test* via API
   is not.
2. **Every test must be able to fail.** No `if (visible)` wrappers around bodies. If the
   precondition isn't guaranteed, *build* it — don't guard on it.
3. **Own your state.** Don't depend on `global-setup`'s shared tournament for
   state-sensitive flows; it advances (see §5.1). Build a fresh entity per test with the
   lifecycle fixtures.
4. **Assert the mutation, twice.** A UI assertion (chip/snackbar/row appears) *and* an API
   cross-check (`getMatch()`, `listRegistrations()`, …). UI-only can pass on stale render;
   API-only (class C) can't catch a broken component.
5. **The test name is a contract.** If it says "user disputes a result", a user must
   dispute a result through the UI. Rename or fix — see §9.
6. **Two-context flows.** For P1/P2 interactions use two browser contexts;
   `veto-realtime.spec.ts:117–126` is the reference pattern.
7. **Reference implementations:** `veto-flow`, `veto-realtime`, `tournament-seeding`,
   `tournament-lifecycle`, `uploads`, `evidence`. Copy these patterns.
8. **Finding product bugs is the point — report them, don't paper over them.** Driving a real
   UI forces you to decide what *should* happen, which is exactly when missing or broken
   frontend/API behaviour surfaces. If you cannot make a test pass honestly because the app is
   wrong: **do not weaken the assertion to get green.** Drop it, record the finding in §9b with
   root cause + evidence (`file:line`), and say so in your report. A test that passes by
   accommodating a bug is worse than no test — it *certifies* the bug.

---

## 4. Phase 0 — Guardrails (do these FIRST, before the sweeps)

Landing these first stops the debt from being re-created while we pay it down.

- [x] **Ban the vacuous guard in CI.** Implemented as a **ratchet**, not a hard ban — a hard
      ban would fail instantly on the ~93 pre-existing sites. `web/e2e/scripts/check-test-quality.mjs`
      baselines counts per file in `.test-quality-baseline.json`; **counts may only decrease**.
      Wired as `npm run test:quality` + a CI step in `test.yml`.
      *Verified it fails on an injected guard and passes when reverted.*
- [x] **Ban tautological assertions** (`expect(… || true)`) and **or-assertions**
      (`expect(a || b).toBe(true)`) — both in the ratchet.
- [x] ~~Lint rule: no test body without at least one `expect`~~ — **prototyped and deliberately
      dropped from automation.** Reliably delimiting a test body needs real parsing (template
      and regex literals defeat brace counting); the approximation flagged known-good specs
      (`uploads`, `league-season`). A guardrail that cries wolf gets ignored. The genuine
      "no assertion" tests are tracked by hand in §5.3 instead.
- [x] Add a short `web/e2e/README.md` pointing at §3 Ground rules + this plan.
- [x] Exemption mechanism: `// coverage-plan-exempt: <reason>` on the line — honoured by the
      ratchet, for genuinely API-level checks (e.g. RBAC 403) with no UI surface.

**Progress:** Wave 1 cut this from **112 → 79 violations (10 → 7 files)**.

**Baseline originally recorded (2026-07-22):** 112 violations across 10 files —
`visibilityGuard` 93, `orAssertion` 17, `tautology` 1. The guard counts reproduce the
manual audit exactly (team-management 42 · tournament-public 25 · tournament-admin 16 ·
tournament-team 5), independently confirming §2.

### Shared fixtures added for Wave 1 (so parallel agents never touch contended files)
- [x] `createOpenRegistrationTournament(adminToken, opts)` — fresh tournament left in
      `registration` status, so `Register Now` / `Withdraw` / `Check In` actually render (§5.2).
- [x] `transitionTournament(adminToken, tournamentId, action)` — exported lifecycle transition
      so specs can build an exact precondition instead of guarding on one.
      Both in `fixtures/tournament-lifecycle.fixture.ts`.

---

## 5. Phase 1 — P0: the critical holes

Highest risk-per-effort. These are the flows a real user hits first.

### 5.1 Result flow — the exact hole that hid the dispute bug

- [x] **`match-results.spec.ts:360`** — "P1 submits a result, **P2 disputes it**" does the
      dispute via `disputeResultClaim()` at `:373`. Replace with UI: prime P2 auth → goto
      match → click `Dispute` → fill `Reason for dispute` → click **`Submit Dispute`** →
      assert `Disputed` in UI **and** `getMatch().status === 'disputed'`.
      Keep `submitResultClaim` at `:366` as seeding. → covers `ResultDisputeModal.handleDispute`
- [x] **`match-results.spec.ts:306`** — confirms via `confirmResultClaim()` at `:339`.
      Replace with a second browser context as P2 clicking **`Confirm Result`**; assert the
      `Final` chip + `1 - 0`. → covers `ResultConfirmationPanel.handleConfirm`
      **(currently untested on the happy path of the most important flow in the product)**
- [x] **`match-results.spec.ts:269`** — keep the validation half; drop the cancel-only
      ending once the above lands (it created the false sense of coverage).

### 5.2 Tournament registration — the primary way a user enters the product

Root cause: `global-setup.ts:657–721` (`startTournamentAndGetMatches`) **starts** the
seeded tournament, so `Register Now` / `Withdraw` / `Check In` never render and all 9
guarded bodies skip. The spec's own comments concede this (`:187–188`, `:300–301`).

- [x] Build a fresh `registration`-status tournament per test using
      `fixtures/tournament-lifecycle.fixture.ts:271–296` (`createDraftTournament` → publish →
      open-registration). Stop pointing these at `TEST_TOURNAMENT_SLUG`.
- [x] `:156` redirect-to-login when unauthenticated (guard `:165`)
- [x] `:205` open registration modal (guard `:219`)
- [x] `:228` **register successfully** — remove guard `:255` + early `return` `:249`; replace
      the "no error visible" assertion `:284` with a positive chip assertion + `listRegistrations()`
- [x] `:364` / `:383` withdraw shown / withdraw performed (guards `:377`, `:394`)
- [x] `:407` check-in button — **body currently has no action and no assertion**
- [x] `:420` checked-in status after check-in (guard `:431`)

→ covers `PlayerRegistrationModal.handleRegister`, `TournamentDetailPage.handlePlayerRegister`,
`TournamentDetailPage.handleCheckIn`, withdraw on `TournamentRegistrationCard`,
`stores/tournament/_registrations.ts`

### 5.3 Assertions that verify nothing

- [x] **`admin-management.spec.ts:323`** — "redirect non-admin users from admin pages"
      asserts the URL lacks `/admin/dashboard`, **a route that does not exist** (`router/index.ts:143`
      → `/admin`). A security test that always passes. Use `await expect(page).not.toHaveURL(/\/admin/)`.
- [x] `admin-management.spec.ts:257` — delete `expect(hasRefresh || true).toBe(true)`
- [x] `admin-management.spec.ts:275` — "filter games by search" types, then asserts nothing
- [x] `auth.spec.ts:171` — dead test; `/tournaments` is public (`router/index.ts:67–70`).
      Retarget at `/my-teams` or `/profile`
- [x] `player-profile.spec.ts:158` — "update bio successfully" falls back to asserting the
      field it just typed into (`:202`). Assert the snackbar + API re-fetch
- [x] `player-profile.spec.ts:302` — "create availability window" asserts only the page
      heading (`:333`). Assert the new slot renders + `GET /v1/players/me/availability`
- [x] `player-profile.spec.ts:336` — asserts the heading, not that the dialog closed

---

## 6. Phase 2 — De-guard the vacuous specs

One workstream per spec file (see §10 for parallelisation).

### 6.1 `team-management.spec.ts` — 42 guards, 906 lines, mostly cannot fail
- [ ] `:231` **create team** — whole flow inside `if (hasCreateButton)` `:238`. Build the
      league/season with the actor guaranteed eligible (copy `league-season.spec.ts:88–96`),
      drop the guard, assert the team in the season list **and** via `getTeamMembers()`
- [ ] `:788` **save team changes** — nested guards `:712`, `:720`, `:814` → `TeamEditPage.handleSubmit`
- [ ] `:728` display edit form / `:755` validate edit form — same nesting; `:783` uses an
      un-failable `hasError || isDisabled`
- [ ] `:478` **remove member** — reaches the dialog then clicks **Cancel** `:504`
      (properly covered in `team-roster.spec.ts:126` — consider deleting)
- [ ] `:510` **send invitation** — opens modal (guard `:524`), never submits
- [ ] `:554` / `:571` accept / decline invitation — guards `:560`, `:576`; admin has no
      pending invites so they never run
- [ ] `:840` **class B** — invite + accept both via API; only a `/my-teams` visibility check.
      Split into (a) captain invites via `LeagueTeamInviteModal`, (b) player 2 clicks **Accept**
      on `/invitations`
- [ ] Weak-assertion cluster: `:98`, `:307`, `:551`, `:630` — "or" of a real state and its empty state
- [ ] Consider relocating roster cases to `team-roster.spec.ts` (unguarded, uses `createTeamWithMembers`)

### 6.2 `tournament-public.spec.ts` — covered in §5.2 (P0)
- [ ] Sweep the remaining 25 guards not listed in §5.2

### 6.3 `tournament-admin.spec.ts` — 16 guards on an arbitrary shared-DB row
All navigate to `page.locator('table tbody tr').first()` then guard on a state that row
probably isn't in. All are strictly dominated by `tournament-seeding.spec.ts:44` and
`tournament-lifecycle.spec.ts:49`.
- [ ] Delete `:260`, `:284`, `:311`, `:350`, `:372`, `:415`, `:439`, `:463`
- [ ] Add ONE new unguarded test for the genuinely uncovered actions:
      **Disqualify** (`AdminTournamentDetailPage.handleReasonConfirm` disqualify branch)
      and **admin check-in** (`handleAdminCheckIn`), seeded with `createTournamentWithApprovedPlayers`

### 6.4 `tournament-team.spec.ts` — 18 tests of `expect(.v-card).toBeVisible()`
- [ ] Replace smoke assertions with real ones (`:87`, `:137`, `:200` are representative)
- [ ] `:35` matches `/team|teams/i` against a page whose nav drawer contains "Teams"
- [ ] `:64` team selection when registering — guarded `:75`
- [ ] Cover `TeamRegistrationModal.handleRegister` + `TournamentDetailPage.handleTeamRegister`

### 6.5 `match-workflow.spec.ts` — the scheduling negotiation is open→cancel
- [ ] `:225` selects a slot, asserts "1 time selected", **never clicks Propose**
- [ ] `:271` only asserts accept/reject/counter buttons are visible
- [ ] `:284` opens the counter dialog and clicks **Cancel** `:300`
- [ ] Replace with ONE full negotiation: P1 selects → **Propose** → P2 → **Accept** →
      assert the scheduled time on both pages. Covers `handlePropose` + `handleAccept` + `ProposalCard`

### 6.6 `admin-management.spec.ts` — 23 tests, zero mutations
- [x] Add a test that actually **creates a ban** (`BanCreateModal.submit`) and one that **lifts** it;
      assert the row + `GET /v1/admin/bans`
- [ ] (assertion fixes tracked in §5.3)

### 6.7 Smaller items
- [ ] `veto-bo3.spec.ts:244` — **class B**: name says "the opponent selects the side" but the
      write is `selectSide()` at `:300`; the CT/T buttons are only asserted visible `:284–289`.
      Click the button instead; keep the backend cross-check `:303–308`
- [ ] `match-checkin.spec.ts:74–93` — the one UI click has a silent API fallback; remove it
- [ ] `team-roster.spec.ts` — demote/transfer are API-driven because **no UI exists**;
      confirm that's intended (if UI is planned, add tests then)
- [x] `auth.spec.ts:171` — dead test (also in §5.3)

---

## 7. Phase 3 — Untested frontend inventory

Handlers with user-facing **mutating** actions that **no e2e test triggers through the UI**.

### Tier 1 — core user flows (highest risk)
- [x] `ResultConfirmationPanel.handleConfirm` — `components/match/results/ResultConfirmationPanel.vue:231`
- [x] `ResultDisputeModal.handleDispute` — `components/match/results/ResultDisputeModal.vue:102`
- [x] `PlayerRegistrationModal.handleRegister`
- [x] `TournamentDetailPage.handlePlayerRegister` / `handleCheckIn`
- [ ] `TeamRegistrationModal.handleRegister` + `TournamentDetailPage.handleTeamRegister`
- [ ] `MatchDetailPage.handlePropose` / `handleAccept` / `handleReject` / `handleCounter`
      (+ `MatchSchedulingPanel.submitProposal/submitCounter`, `ProposalCard.handleAccept/confirmReject`)
- [ ] `TeamEditPage.handleSubmit`
- [ ] `LeagueTeamCreateModal.save` + `LeagueDetailPage.handleCreateTeam`
- [ ] `InvitationsPage.handleAccept` `:257` / decline / `handleAcceptLeague` `:233` / `handleDeclineLeague` `:245`
      — **the only way to join a team**
- [ ] `LeagueTeamInviteModal` submit

### Tier 2 — admin / organizer surfaces
- [x] `BanCreateModal.submit` + ban lift (`AdminBansPage.confirmLiftBan`) — done in §5.3.
      Still open: `BanDetailModal` detail actions
- [ ] **`OrganizerToolbar.vue` — entire component untested**: `handlePublish`, `handleOpenRegistration`,
      `handleCloseRegistration`, `handleReopenRegistration`, `handleStart`, `handleComplete`,
      `handleFinalize`, `handleAdvanceRound`
      (`tournament-lifecycle.spec.ts:160–163` notes it drove reopen via API because the button only lives here)
- [ ] `DisputeDetailModal`: `handleResolveUphold` / `handleResolveAdjusted` / `handleResolveRematch` /
      `handleResolveDoubleDq` / `handleAssign` (only `handleResolveOverturn` + `handleAddMessage` covered)
- [ ] `DisputeThreadPanel.handleSendMessage` `:83` — captain-side reply
- [ ] `ResultReviewAlert.handleAcknowledge` `:77`
- [ ] `ResultReviewDetailModal.handleApprove` / `handleReject`
- [ ] `MatchOverviewTab.handleTransition`; `MatchAdminActionsTab.handleSchedule`
- [ ] `MatchEvidenceTab.handleLinkDemo` / `handleUnlinkDemo`
- [ ] `StagesTab.handleCreateStage`; `AwardsTab.handleSaveEdit`
- [ ] `AdminTournamentDetailPage.handleClearSeeding` / `handleAdminCheckIn` / disqualify branch
- [ ] Modal saves: `LeagueCreateModal`, `LeagueEditModal`, `LeagueSeasonCreateModal`,
      `LeagueSeasonEditModal`, `LeagueTeamDetailModal.saveSettings`, `GameEditModal`,
      `GameConfigDialog.saveMap/savePool`, `RoleCreateEditModal.submitForm`, `RolePermissionsModal`,
      `InviteUserModal`, `DemoCatalogModal`
- [ ] `AdminGamesPage.handleEnableGame` / `handleDisableGame`
- [ ] `AdminDemoDetailPage.handleCategorize` / `handleReprocess` / `handleSaveNotes` / `handleToggleVisibility`

### Tier 3 — other components with mutating handlers, no coverage
- [ ] **`LeagueTeamDetailModal` admin demote-from-captain** (`src/components/admin/LeagueTeamDetailModal.vue:139-146`)
      — reached from `/admin/teams`, a route §8 says no test ever loads. Closes a §8 route and a
      §7 Tier-2 component in one test. (A captain-facing demote UI does NOT exist; transfer-ownership
      has no UI at all — the endpoint appears only in the generated client.)
- [ ] `SteamTrackingCard.handleRegister` / `handleUpdate` / `handleDelete`
- [ ] `SocialLinksEditor` + `ProfileEditPage.saveSocialLinks`
- [ ] `AvailabilityOverridesManager.saveOverride`
- [ ] `CaptainActionsWidget` / `CaptainActionsBell` / `CaptainActionItem`
      (+ `stores/captainActions.ts`, `composables/useCaptainActions.ts`)
- [ ] `TeamDetailPage.handleApplyToTeam` / `handleCancelInvitation`
- [ ] `LeagueDetailPage.handleJoinLeague` / `handleApplyToLeague`
- [ ] `MapPoolPicker`, `DemoBrowser`

---

## 8. Phase 4 — Routes never exercised

Verified by enumerating every `page.goto()` in `e2e/*.spec.ts` against `src/router/index.ts`.
No test ever loads these:

- [ ] `/admin/result-reviews` — **and** `ResultReviewDetailModal.handleApprove/handleReject`
- [ ] `/admin/permissions`
- [ ] `/admin/players`
- [ ] `/admin/settings`
- [ ] `/admin/teams`
- [ ] `/players` (list)

Each needs at minimum a load + render assertion; those with mutating actions need a
real action test (tracked in §7).

- [ ] **Investigate:** `pages/TeamCreatePage.vue` appears unreachable —
      `router/index.ts:137` redirects `/teams/new` → `/leagues`. Likely dead code, not a test gap.
      Delete the page or restore the route.

---

## 9. Tests whose name misrepresents what they verify

Actively misleading — rename or fix (most are also tracked above).

- [x] `match-results.spec.ts:360` "P2 **disputes it**" → API call `:373`
- [ ] `team-management.spec.ts:231` "should **create team successfully**" → may not execute
- [ ] `team-management.spec.ts:788` "should **save** team changes" → triple-guarded
- [ ] `team-management.spec.ts:478` "should **remove member**" → clicks Cancel
- [ ] `team-management.spec.ts:510` "should **send invitation**" → never submits
- [ ] `team-management.spec.ts:554` / `:571` "should **handle accept/decline**" → never runs
- [x] `tournament-public.spec.ts:228` "should **register player successfully**" → guarded, early-returns
- [x] `tournament-public.spec.ts:383` "should **withdraw**" → guarded
- [x] `tournament-public.spec.ts:420` "checked-in status **after check-in**" → guarded
- [x] `tournament-public.spec.ts:407` "should show check-in button" → no action, no assertion
- [ ] `tournament-admin.spec.ts:284` / `:311` / `:372` "**approve/reject/disqualify**" → guarded
- [ ] `tournament-admin.spec.ts:415` / `:439` / `:463` "**publish/open/close** registration" → guarded
- [x] `admin-management.spec.ts:323` "**redirect non-admin users**" → asserts a nonexistent route
- [x] `admin-management.spec.ts:275` "should **filter** games" → asserts nothing
- [x] `player-profile.spec.ts:158` "should **update bio successfully**" → asserts its own input
- [x] `player-profile.spec.ts:302` "should **create** availability window" → asserts a heading
- [ ] `tournament-team.spec.ts:87` / `:137` / `:200` → `expect(.v-card).toBeVisible()`
- [ ] `veto-bo3.spec.ts:244` "**the opponent selects the side**" → `selectSide()` REST call

**Honest-by-name API tests — leave as-is** (each still marks a UI path needing its own test):
`team-roster.spec.ts:86`, `match-results.spec.ts:306` ("via API" — being replaced in §5.1),
`team-management.spec.ts:840`, `awards.spec.ts:141`, `admin-demo-links.spec.ts:140`,
`steam-auth.spec.ts:31`, `match-checkin.spec.ts:125`.

---

## 9b. PRODUCT findings uncovered by this work

**Wave 3 status:** 13 found · 1 fixed (P-4) · 4 product decisions taken (P-2, P-5, P-9, P-12).
Three of these — **P-4, P-10, P-11** — are the *same defect*: a hand-rolled comparison against a
status string that drifted from the backend. Fix them as one sweep, not three point fixes.

**This is a primary deliverable, not a side-effect.** Writing a test that genuinely drives
the UI forces you to answer "what *should* happen here?" — and that keeps surfacing places
where the frontend or API is missing/broken. These are **product bugs, not test gaps**.

**Rule:** if you cannot write a passing test because the app is wrong, **do not write a test
that passes anyway.** Drop the assertion, record the finding here, and keep going.

Each entry below was independently re-verified (not taken on the agent's word).

### P-1 — `MapResultsSummary` can never render (per-map breakdown is dead on finished matches)
- **Symptom:** the per-map result breakdown — "the primary artifact of a finished series",
  per its own comment — never appears on a completed match.
- **Root cause:** the render condition is mutually exclusive with the data it needs.
  `MatchDetailPage.vue:76–80` gates it on `match.status === 'completed' && currentResult`.
  But `GET /v1/matches/{id}/result` → `get_pending_claim` →
  `WHERE match_id = $1 AND status = 'pending'`
  (`portal-db/src/adapters/tournament/result_claim.rs:52`). Once the match completes the
  claim is no longer `pending`, so the endpoint 404s and
  `stores/matchResults.ts` sets `currentResult = null` on 404. Both halves can never be true at once.
- **Found by:** §5.1 — the agent drafted an assertion on the summary, traced why it wouldn't
  hold, and correctly dropped it rather than writing a green-but-wrong test.
- [ ] Fix: either fetch the *resolved* claim for completed matches (new endpoint/param), or
      render the summary from the match's final scores instead of `currentResult`.

### P-2 — Open-registration tournaments never auto-approve (documented behaviour not wired up)
- **Symptom:** every self-registration lands in `pending` and needs manual admin approval,
  even for tournaments whose `registration_type` is `Open`.
- **Root cause:** `RegistrationService::initial_status_for_tournament`
  (`portal-domain/src/services/tournament/registration.rs:257`) implements exactly this rule —
  its docstring says *"For `Open` tournaments: `Approved` (auto-approved)"* — but it is
  **dead code**: a repo-wide search finds no call site, only the definition. The insert
  (`portal-db/src/adapters/tournament/registration.rs:176–200`) never sets `status`, so the DB
  default `'pending'` (`migrations/0030_create_tournaments.sql`) always wins.
- **Found by:** §5.2 — the agent had to determine the true post-registration state to assert on.
- [ ] **DECIDED: Open tournaments SHOULD auto-approve.** Wire `initial_status_for_tournament`
      into the registration path so `registration_type: Open` yields `Approved`. (Wave 3)

### P-4 — Public tournament page shows the RAW status (`registration`) instead of "Registration Open"  ⚠️ user-facing
- **Symptom:** the status badge on the public tournament detail page — the most-visited page in
  the product — renders the raw enum, e.g. **`registration`**, to end users.
  *Confirmed from the failure screenshot, not inferred.*
- **Root cause:** `components/tournament/TournamentHeader.vue` hand-rolls its own
  `statusLabel` / `statusColor` `switch` instead of using `utils/statusMaps.ts`, and its cases are
  **stale**: it matches `registration_open`, `registration_closed`, `check_in_open`, `ready` —
  none of which the backend emits. The real status is `registration`, so it falls through to
  `default: return props.tournament.status` and prints the enum.
- **Correction to the first diagnosis:** the local switch was *not* pointless duplication — it
  carried deliberate public-facing copy ("Live Now", "Coming Soon", "Announced") distinct from
  the admin voice ("In Progress", "Draft", "Published"). Collapsing it into `tournamentStatusMap`
  regressed an existing, correct test (`match-results.spec.ts:178` asserts "Live Now"). The bug
  was purely the **stale/incomplete keys plus a raw-enum fallback**, not the separate voice.
- **Blast radius:** every status the stale switch doesn't know, including the most common public
  state. Worth auditing other hand-rolled status switches for the same drift.
- **Found by:** §5.2 — the new test asserted the user-visible label; the app showed an enum.
- [x] **Fixed** in `TournamentHeader` (but see §9c — `TournamentCard` has the identical bug, unfixed): added `tournamentPublicStatusMap` to `utils/statusMaps.ts` (public voice, full
      coverage of the real backend statuses) and `TournamentHeader` now reads it, falling back to
      the admin map so a status we forget to add still renders a real label instead of leaking the
      enum. Both the new assertion ("Registration Open") and the pre-existing one ("Live Now") pass.

### P-5 — A display name you can register but can never keep: signup allows duplicates, profile save rejects them  ⚠️ user-facing trap
- **Symptom:** `PATCH /v1/players/me` returns **409 "Display name '…' is already taken"**, so an
  affected user **can never save their profile** (bio, socials, anything) until they also change
  their display name — a name the product let them register with.
- **Root cause — three layers disagree:**
  - *Registration:* no display-name uniqueness check (`portal-domain/src/services/user.rs`).
  - *Schema:* **no `UNIQUE` constraint** on `players.display_name` in any migration.
  - *Update:* `PlayerService` **does** enforce it (`portal-domain/src/services/player.rs:174-181`),
    correctly excluding self (`existing.id != player_id`) — so this is not a "can't save my own
    name" bug; it's that the duplicate was allowed to exist at signup.
- **Found by:** §5.3 — the bio test hit a real 409 in the live run.
- [ ] **DECIDED: display names SHOULD be unique.** Enforce at registration AND add the missing
      `UNIQUE` constraint on `players.display_name`, so all three layers agree. Needs a migration
      plus a plan for any existing duplicates. (Wave 3)

### P-6 — SUSPECTED: result history doesn't refresh in-page after a dispute
- **Symptom:** after disputing through the UI, the Result History timeline still shows
  **"Awaiting Confirmation"** (the `pending` label) rather than `Disputed`, for at least 10s.
  The backend *does* flip the claim (`adapters/dispute.rs:732` —
  `UPDATE result_claims SET status='disputed' ... WHERE status='pending'`).
- **Contributing risk:** `composables/useMatchDetail.ts:222-228` refetches with `.catch(() => null)`
  / `.catch(() => [])` — a failed refresh is **silently swallowed** and the stale list kept. (Same
  swallowed-error shape as the original dispute bug.) No 4xx/5xx appeared on result endpoints in
  the run, so the cause is not yet proven.
- **Status:** the assertion was moved to after a reload so the test is reliable. If it passes
  there, the in-page refresh is confirmed stale and this becomes a real bug.
- [ ] Confirm on the next run, then fix the refresh (and stop swallowing refetch errors).

### P-7 — Map-veto side selection is UNREACHABLE through the UI (frontend and backend disagree on who picks)  ⚠️ feature dead in the product
- **Symptom:** in `picker_choice` mode, nobody can select a side. The only client shown the
  CT/T buttons is rejected by the API with 403; the client the API accepts is never given a
  control. The whole side-selection step is dead in the UI.
- **Root cause — the two layers carry literally opposite rules, each with a comment asserting it:**
  - Frontend `src/components/match/veto/VetoSideSelect.vue:69-73` —
    `// In picker_choice mode, the picker selects the side` →
    `return action.performed_by_registration_id === props.userRegistrationId`
  - Backend `portal-domain/src/services/tournament/veto.rs:507-512` —
    `// In picker_choice mode, the OPPONENT (non-picker) selects the side.` →
    `if acting_for_registration == picker { return NotAuthorized("The opponent of the picker selects the side") }`
  - The WS path (`portal-api/src/handlers/veto_ws.rs:611-625`) feeds the same service, so it is
    rejected identically — there is no alternate route in.
- **History:** the backend was deliberately changed to require the opponent (`bf22c90`, after
  `47738fa` flagged the disagreement). **The frontend was never updated to match**, so the
  inversion is still live — now pointing the other way.
- **Intent is settled:** backend, the domain comment, CS convention and the product decision
  taken earlier in this work all agree — *the opponent chooses*. So the frontend is the side
  that is wrong.
- **Found by:** §6.7 — the agent tried to actually click the button, discovered the client it was
  told to click has no control, and traced both layers instead of forcing the test green.
- **Note on the test:** assertions were deliberately made role-agnostic ("exactly one client is
  offered the control"). Pinning them to today's behaviour would have *certified* the bug and
  gone red when it is fixed.
- [ ] Fix: flip `canSelectSide` to `!==` (and reword the waiting chip, which will then show to
      the picker). One-line frontend change; the backend is already correct.

### P-8 — Calendar mode lets you propose a time in the PAST, then hard-fails  ⚠️ user-facing dead end
- **Symptom:** page back a week in the scheduling calendar, click a slot, and **Send Proposal is
  enabled** — then the API rejects it with a hard 400 *"Proposed times must be in the future"*.
- **Root cause:** `components/match/MatchSchedulingPanel.vue:205-209` deliberately skips the
  picker's validity check in calendar mode —
  `if (viewMode.value === 'calendar') return nonEmpty` — on the assumption that "the calendar
  overlay only offers valid cells". That assumption is false: `AvailabilityCalendarOverlay.vue:7`
  renders an **ungated** "Previous week" button (no `:disabled`), past weeks are built identically
  (weekly-recurring windows repeat backwards), and neither `handleCellClick` nor `cellToIso`
  applies a future check. Backend guard: `services/tournament/scheduling.rs:94-100`.
- **Found by:** §6.5, while driving the calendar path for real.
- [ ] Fix: add a future-date guard in `hasValidTime` (or disable past cells / the Previous-week
      button once `weekOffset` would go before today).

### P-9 — A proposer cannot withdraw their own schedule proposal
- **Symptom:** mistype a time and you are stuck. The proposer sees only
  "Waiting for your opponent to respond…" (`ProposalCard.vue:137-145`) with no cancel control, so
  a wrong proposal blocks scheduling for the full 48h TTL unless the opponent happens to respond.
- **Root cause:** no cancel endpoint is exposed (`routes/tournaments.rs:148-164`);
  `ProposalStatus::Cancelled` is only ever set by `admin_schedule`
  (`services/tournament/scheduling.rs:344-353`). A missing capability rather than a broken one.
- [ ] **DECIDED: proposers SHOULD be able to withdraw.** A real product/API gap: add the cancel
      endpoint and a control on `ProposalCard`. (Wave 3 — API first, then UI)

### P-10 — Admin registrations table prints the raw status enum
- **Symptom:** organisers see `checked_in`, `no_show`, `disqualified` in the admin registrations
  table instead of readable labels.
- **Root cause:** `components/admin/tournament-detail/RegistrationsTab.vue:20-24` renders
  `{{ item.status }}`. It *imports* `registrationStatusMap` but uses only the **color** half
  (`:118`, `:144`) — the `label` is never applied. The public participants table on the same data
  maps it correctly (`TournamentDetailPage.vue:185-189`), so this reads as an oversight.
- Same family as P-4 (a status map imported but half-used), one severity lower (admin-only).
- **Note:** the test asserts the *raw* text to match shipped behaviour, with an inline comment —
  rather than asserting the correct label and shipping a red test. Flagged here instead.
- [ ] Fix: `getStatusLabel(registrationStatusMap, item.status)`.

### P-11 — Roster lock is NEVER enforced in the admin UI (compares against a value that cannot exist)  ⚠️ enforcement gap
- **Symptom:** the "Roster Locked" chip never renders, and **Invite Player / member-action menus
  are never disabled** — an admin can invite players and mutate rosters on a `hard_lock` season.
- **Root cause:** `components/admin/LeagueTeamDetailModal.vue:54`, `:67`, `:128` all test
  `team?.roster_lock_status === 'locked'`. The column's CHECK constraint permits only
  `open` / `soft_lock` / `hard_lock` (`api/migrations/0025_league_teams_and_seasons.sql:46,69`);
  **`'locked'` appears nowhere in the schema or domain**, so all three conditions are dead.
- Same failure mode as P-4/P-10 — a hand-rolled comparison against a stale string — but here the
  consequence is a bypassed business rule, not cosmetics.
- **Found by:** §6.1. It made the agent's test *pass*, so it was reported rather than asserted on.
- [ ] Fix: compare against the real values (`soft_lock` / `hard_lock`, with the intended semantics
      for each) and add a test that a hard-locked season blocks invites.

### P-12 — No captain-facing entry point to the team invite modal
- **Symptom:** a captain cannot invite from their own team page. `LeagueTeamInviteModal` lives in
  `components/admin/` and is only mounted by `LeagueTeamDetailModal` (`:311`), reachable from
  `/admin/teams` and `/admin/leagues`. `TeamDetailPage.vue` shows a captain-only "Pending
  Invitations" card with *cancel* buttons but **no invite button**.
- The only captain path is `PlayerDetailPage.vue:53-62` — you must already know the player and
  open their profile; there is no "invite" affordance on your own team.
- **This invalidated a plan assumption:** §6.1's "captain invites through `LeagueTeamInviteModal`"
  is not achievable as written. Both real surfaces were covered instead of pretending it exists.
- [ ] **DECIDED: captains SHOULD be able to invite.** Add a captain-facing invite entry point on
      `TeamDetailPage` (today the modal is admin-only). (Wave 3)

### P-13 — `TeamEditPage` renders a blank editable form to non-owners
- **Symptom:** a non-owner sees the full edit form with empty fields next to "Only the team owner
  can edit team settings".
- **Root cause:** `onMounted` sets the error and `return`s (`pages/TeamEditPage.vue:281-284`)
  *before* populating `form`, but the template's `v-if="team"` is already satisfied.
- Harmless today (`hasChanges` stays false so Save is disabled), but confusing.
- [ ] Fix: gate the form on ownership, or populate/redirect before rendering.

**Process note (not a product bug):** `composables/useUnsavedChanges.ts:30-33` puts a
`window.confirm` in front of in-app navigation. **Playwright auto-dismisses dialogs**, so any
future test that routes away from a dirty edit form will silently fail to navigate. Structure such
tests to never leave a form dirty.

### P-3 — `checkInRequired` alone can never open check-in
- **Symptom:** creating a tournament with `checkInRequired: true` is not sufficient for
  `is_check_in_open()` to return true — it also needs a check-in *window*, and
  `CreateTournamentOptions` (`fixtures/tournament-lifecycle.fixture.ts`) exposes no
  `checkInStart`/`checkInEnd`.
- **Impact:** minor/test-facing today (worked around via `createCheckInScenario`), but the flag
  is misleading to anyone using it.
- [ ] Add the window fields to the options (and confirm the API accepts them on create).
- [ ] `match-workflow-extra.fixture.ts` — `proposeScheduleViaApi` is now unused suite-wide (the
      describe that used it was deleted); `MatchDetails` omits `scheduled_at` and nothing reads
      `/schedule/active` or `/schedule/history`. Fold the spec-local helpers in and drop the dead one.
- [ ] `fixtures/checkin.fixture.ts` — `advanceMatchToCheckingIn` swallows HTTP 400 on both the
      schedule and the transition, so a fixture failure surfaces later as a confusing UI failure.
      Fail loudly instead. (Same swallowed-error family as P-6 and the original dispute bug.)

---

## 9c. The stale-status-string defect class (systematic sweep)

P-4, P-7, P-10 and P-11 all turned out to be **the same defect**: a hand-rolled
comparison or `switch` against a status string that drifted from what the backend
actually emits, with a `default` that leaks the raw enum. A sweep of `src/` against the
Rust enums and DB `CHECK` constraints found **~12 more instances**. Fixing them one at a
time was never going to work.

Also found: several maps in `statusMaps.ts` were **missing real backend values** — most
notably `disputeStatusMap` lacked `pending` and `cancelled`, the two most common dispute
states, so the admin disputes table rendered raw enums. Those are fixed.

### ⚠️ FUNCTIONAL — these silently hide data from users (fix first)
- [ ] **`pages/TournamentsPage.vue:196`** — the **"Upcoming" tab filters on
      `['draft','published','registration_open','registration_closed','ready']`**. The real
      statuses are `registration` and `scheduled`, so the tab **silently drops nearly every
      upcoming tournament**. Not cosmetic — the page appears empty.
- [ ] **`pages/HomePage.vue:344,346-352`** — the local map and `ACTIVE_MATCH_STATUSES`
      contain `'scheduling'` (not a real status) and omit `ready`, `pick_ban`,
      `awaiting_result`, so **matches in those states never appear in "your upcoming
      matches"**.
- [ ] `pages/TournamentsPage.vue:190` — the Registration-Open tab compares
      `'registration_open'`; it only works at all via the `is_registration_open` fallback.

### Raw enum leaked to users (P-4 / P-10 class)
- [ ] **`components/tournament/TournamentCard.vue:108-155`** — **P-4 verbatim, still
      unfixed, on the tournaments LIST page** (`registration_open`, `check_in_open`,
      `ready` … then `default: return props.tournament.status`). Arguably higher-traffic
      than the header that was fixed. `tournamentPublicStatusMap` already has the right
      public copy.
- [ ] `components/player/MatchHistoryList.vue:41` — renders the raw status on the public
      player profile.
- [ ] `pages/LeagueDetailPage.vue:154` — renders the raw season status; the file imports
      `getStatusLabel` but never applies it. NOTE: `e2e/league-season.spec.ts:68,185`
      currently assert the raw text and must be updated with the fix.
- [ ] `components/tournament/TournamentMatchCard.vue:113,149` — compares `'scheduling'`
      (not a real status) and omits `ready`/`forfeit`, which fall through to the raw enum.
- [ ] `components/match/evidence/EvidenceDisplay.vue:65-66` — raw evidence status (no map
      exists for it yet).

### Dead conditions / behavioural gaps
- [ ] **`components/admin/LeagueSeasonsPanel.vue:60,64`** — a **second instance of P-11**:
      `roster_lock_status === 'locked'`, so the Locked/Open column always reads "Open".
- [ ] `components/match/MatchStatusTimeline.vue:48-62` — the step list omits `forfeit` and
      `disputed`, so such a match highlights no current step.
- [ ] `composables/useMatchLobby.ts:154-165` — a `cancelled` veto session is treated as
      in-progress.
- [ ] `components/admin/DisputeDetailModal.vue:201` — `status !== 'closed'` can never be
      false; reduces to `!dispute.resolution`.

### Verified correct — no action
`GameMapCard` / `VetoMapGrid`, the awards components, `ResultReviewDetailModal`,
`ProposalCard`, `AdminDisputesPage` filters, `AdminDemoDetailPage`, all `=== 'active'`
filters, `useTournamentContext`, `TournamentRegistrationCard`. `EvidenceCard` /
`EvidenceAttachmentPanel` and `AvailabilityCalendarOverlay` compare **client-side** unions,
not backend enums — legitimate. (`EvidenceCard` is additionally unreferenced anywhere.)

**Preventing recurrence:** every one of these is a string literal that no compiler checks.
Worth considering generated union types from the OpenAPI schema (`src/api/types.ts` already
exists) so a drifted status becomes a type error rather than a silent `default:` branch.

## 10. Per-spec tracker

`Audited` is done for all (baseline 2026-07-22). Tick `Fixed` when that spec's items are closed.

| Spec | tests | A | B | C | D | Audited | Fixed | Notes |
|---|---:|---:|---:|---:|---:|:--:|:--:|---|
| `veto-flow.spec.ts` | 3 | 3 | – | – | – | [x] | [x] | Exemplary — reference |
| `veto-realtime.spec.ts` | 1 | 1 | – | – | – | [x] | [x] | Exemplary — reference (2-context) |
| `veto-realtime-full.spec.ts` | 3 | 3 | – | – | – | [x] | [x] | Exemplary |
| `veto-bo3.spec.ts` | – | – | 1 | – | – | [x] | [ ] | §6.7 — side-select via API `:300` |
| `tournament-seeding.spec.ts` | 3 | 3 | – | – | – | [x] | [x] | Exemplary — reference |
| `tournament-lifecycle.spec.ts` | 4 | 4 | – | – | – | [x] | [x] | Exemplary — reference |
| `uploads.spec.ts` | 7 | 7 | – | – | – | [x] | [x] | Exemplary (incl. negative validation) |
| `evidence.spec.ts` | 3 | 3 | – | – | – | [x] | [x] | Genuine |
| `stats-leaderboard.spec.ts` | 1 | 1 | – | – | – | [x] | [x] | Genuine |
| `league-season.spec.ts` | 8 | 8 | – | – | – | [x] | [x] | Season transitions API-only by design |
| `tournament-formats.spec.ts` | 4 | 4 | – | – | – | [x] | [x] | Progression API-only by design |
| `team-tournament.spec.ts` | 1 | 1 | – | – | – | [x] | [x] | Solid |
| `admin-demo-links.spec.ts` | 4 | 3 | – | 1 | – | [x] | [x] | 1 honest RBAC test |
| `awards.spec.ts` | 2 | 1 | – | 1 | – | [x] | [x] | 1 honest RBAC test |
| `steam-auth.spec.ts` | 4 | 3 | – | 1 | – | [x] | [x] | 1 honest redirect test |
| `dispute-resolution.spec.ts` | 3 | 2 | – | 1 | – | [x] | [x] | Fixed in `31c2a3e` |
| `auth.spec.ts` | 13 | 12 | – | – | 1 | [x] | [x] | §5.3 done — `2c26cc2` |
| `match-checkin.spec.ts` | 3 | 2 | – | 1 | – | [x] | [ ] | §6.7 — silent API fallback |
| `team-roster.spec.ts` | 4 | 2 | 2 | – | – | [x] | [ ] | §6.7 — demote/transfer have no UI |
| `match-results.spec.ts` | 15 | 13 | 1 | – | 1 | [x] | [x] | §5.1 done — `9283af3` |
| `player-profile.spec.ts` | 18 | 15 | – | 2 | 1 | [x] | [x] | §5.3 done — `2c26cc2` |
| `match-workflow.spec.ts` | 18 | 15 | – | – | 3 | [x] | [ ] | §6.5 |
| `admin-management.spec.ts` | 23 | 18 | – | 2 | 3 | [x] | [x] | §5.3+§6.6 done — `2c26cc2`, now has mutations |
| `tournament-admin.spec.ts` | 23 | 15 | – | – | 8 | [x] | [ ] | §6.3 — 16 guards |
| `tournament-team.spec.ts` | 18 | 6 | – | 9 | 3 | [x] | [ ] | §6.4 — smoke tests |
| `tournament-public.spec.ts` | 21 | 8 | – | 4 | 9 | [x] | [x] | §5.2 done — `975874f`, guards 25→0 |
| `team-management.spec.ts` | 34 | 6 | 1 | 6 | 21 | [x] | [ ] | §6.1 — 42 guards, worst file |

---

## 11. How to parallelise (agent fan-out)

**Partition by spec file.** Each workstream owns its spec file(s) exclusively; two agents
must never edit the same spec.

### Contended files — do NOT let parallel agents edit these
- `web/e2e/fixtures/*.ts`
- `web/e2e/global-setup.ts`
- `web/playwright.config.ts`
- ESLint config / CI workflow

**Protocol:** an agent that needs a new/changed fixture must **report the required change
rather than making it**, unless it owns the fixtures workstream. Batch fixture changes into
a single serialized pass (Wave 0) so downstream agents build on a stable base.

### Suggested waves

- [x] **Wave 0 (serial):** Phase 0 guardrails + all shared fixture/`global-setup` changes
      needed by Phase 1 (esp. the fresh-registration-tournament helper for §5.2). **Done** —
      ratchet + CI gate + README + `createOpenRegistrationTournament` / `transitionTournament`.
- [x] **Wave 1 (parallel, P0):** **Done** — `9283af3`, `975874f`, `2c26cc2`. one agent each →
      `match-results.spec.ts` (§5.1) · `tournament-public.spec.ts` (§5.2) ·
      `admin-management.spec.ts` + `auth.spec.ts` + `player-profile.spec.ts` (§5.3)
- [ ] **Wave 2 (parallel, de-guard):** one agent each →
      `team-management.spec.ts` · `tournament-admin.spec.ts` · `tournament-team.spec.ts` ·
      `match-workflow.spec.ts` · (`veto-bo3` + `match-checkin` + `team-roster` as one small stream)
- [ ] **Wave 3 (parallel, new coverage):** Phase 3 handlers + Phase 4 routes, grouped by area
      (admin-bans · organizer-toolbar · dispute-resolutions · result-reviews · profile/steam · captain-actions)

### Definition of done per workstream
1. No `isVisible().catch(() => false)` guards remain in the owned file(s).
2. Every touched test performs its named action through the UI.
3. Every mutation asserts both UI and backend state.
4. `npm run lint` + `npm run typecheck` clean; the owned specs pass locally against a live stack.
5. Any product bug encountered is recorded in §9b (root cause + `file:line` evidence),
   rather than worked around to get a green test.
6. The relevant boxes in this document are ticked in the same commit.

---

## 12. Overall definition of done

- [ ] Phase 0 guardrails merged and enforcing in CI
- [ ] Zero vacuous guards across `web/e2e/`
- [ ] Zero class-B tests (or renamed to honestly describe an API-level check)
- [ ] Every Tier 1 handler (§7) exercised through the UI
- [ ] Every route in §8 loaded by at least one test
- [ ] Every misleading name in §9 fixed or renamed
- [ ] Full suite green, and a deliberately broken component makes it **red** (spot-check the guarantee)
