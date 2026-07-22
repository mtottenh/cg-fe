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

## 4b. CI blockers found mid-campaign (fix before the next CI run)

- [ ] **`e2e/global-setup.ts:233` finds the test league by scanning only page 1 of
      `/v1/leagues`** (no query params ⇒ 20 rows). The DB now holds 22 leagues, so on a fresh
      run `e2e-test-league` may not be on page 1; setup then tries to re-create it and 409s,
      failing every spec. **This is P-28's root cause inside the test harness** — the same
      "only sees the first page" defect. Fix: query by slug / `per_page`, not page 1. Owner: me
      (deferred until the admin-surface agent commits — `global-setup.ts` is a §11 contended file).
- [ ] **Leftover temp file `web/playwright.noseed.tmp.config.ts`** — created by the player-facing
      agent to work around the above; believed removed, still on disk. Delete.

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

- [x] **Investigated — dead code, deleted.** `pages/TeamCreatePage.vue` was imported by
      **nothing** (`router/index.ts:137` redirects `/teams/new` → `/leagues` without it). The
      page was a "teams are now created within leagues, go to /leagues" signpost pointing at
      the same destination the redirect already reaches, so it could only ever have added a
      click. Confirmed not a test gap. Deleted; `vue-tsc` clean.

---

## 9. Tests whose name misrepresents what they verify

- [ ] ⚠️ **`match-workflow.spec.ts` — "displays tournament and match status chips" asserts
      `hasText: 'ready'`, i.e. it was written to certify the RAW ENUM.** It still passes after
      the status sweep only because Playwright's `hasText` is case-insensitive and now matches
      "Ready". This is the §3 anti-pattern in its purest form — a test that would have
      *prevented* the fix had it been stricter. Reassert the human label explicitly.
      (Found by the P-19/P-21 sweep; that spec is owned by the §6.5 workstream.)


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

**Status:** 30 found · **12 fixed** (P-4, P-7, P-2, P-5, P-19, P-21, P-20, P-24, P-10, P-11, P-17, P-22) · P-9 API shipped, UI open ·
1 decision pending UI (P-12) · 5 deliberately deferred to the lineup redesign (P-15, P-18, P-23,
P-25, P-26 — see `api/docs/lineup-design.md`; do not fix these in isolation).

**This register is authoritative.** Any product bug found by this work gets a P-number *here*,
even if it also appears in a §9c sweep list — findings parked only in a checklist get lost.
P-19..P-22 were promoted out of §9c for exactly that reason.

| # | Finding | Severity | State |
|---|---|---|---|
| P-1 | `MapResultsSummary` never renders | data hidden | open |
| P-2 | Open registration never auto-approves | blocks flow | **fixed** `a3c1876` |
| P-3 | `checkInRequired` alone can't open check-in | minor | open |
| P-4 | Tournament **header** shows raw status | user-facing | **fixed** |
| P-5 | Display name: signup allows dupes, save rejects | user trap | **fixed** `a3c1876` |
| P-6 | Result history stale after dispute | suspected | open |
| P-7 | Veto side-select unreachable in UI | feature dead | **fixed** |
| P-8 | Can propose a past time, then hard-fails | dead end | open |
| P-9 | Proposer cannot withdraw own proposal | API gap | **API done** `a3c1876`, UI open |
| P-10 | Admin registrations table prints raw enum | user-facing | **fixed** `f2694b0` |
| P-11 | Roster lock never enforced in admin UI | enforcement | **fixed** `ce732a0` |
| P-12 | No captain entry point to invite modal | blocks flow | decided |
| P-13 | `TeamEditPage` blank form to non-owners | confusing | open |
| P-14 | **Roster lock cannot be set via API at all** | feature dead | open |
| P-15 | Invitation path bypasses the lock check | inconsistent | open |
| P-16 | Role changes not lock-checked | enforcement | open |
| P-17 | Edit modal offers a lock value the API 400s | user-facing | **fixed** `7b4aa8d` |
| P-18 | No admin/emergency override of the lock | design gap | open |
| P-19 | **"Upcoming" tournaments tab always empty** | user-facing | **fixed** `c4bca02` |
| P-20 | Home page hides `pick_ban`/`ready`/`awaiting_result` matches | user-facing | **fixed** `c727267` |
| P-21 | Tournament **list** cards print raw enum | user-facing | **fixed** `c4bca02` |
| P-22 | Season roster-lock column always "Open" | enforcement | **fixed** `7b4aa8d` |
| P-23 | Roster-mismatch review built but unreachable | integrity | open |
| P-24 | **Check-in has no authz — anyone can start any match** (+forfeit, +reg check-in) | **security** | **fixed** `98c8f48` |
| P-25 | Benched players credited with matches; ringer stats count | integrity | open |
| P-26 | "Sub can't face own team" never enforced | integrity | open |
| P-27 | `invite_only` tournaments accept anyone | trust | open |
| P-28 | `/tournaments` search/filters only see first 20 rows | user-facing | open |
| P-29 | **`GET /users/me/matches` 500s for everyone** | **backend** | open |
| P-30 | Season edit Save disabled when max_teams is null | user-facing | open |

**P-14/15/16/17/18 are one cluster** (roster lock). **P-23/P-25/P-26 are a second cluster**, all
blocked on the same missing table, and **P-15/P-18 are superseded in part** by the
substitute/lineup redesign — see `api/docs/lineup-design.md`. Do not fix P-15 in isolation.

⚠️ **P-24 is a live authorization hole and must NOT wait on any of that** — it is independent,
it is exploitable today, and a stranger can force any match to start.
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
- ✅ **API shipped** in `a3c1876`. `POST /v1/tournaments/{tid}/matches/{mid}/schedule/cancel`,
  body `{ "proposal_id": "<uuid>" }`, returns `ScheduleProposalResponse` with
  `status: "cancelled"`. Errors: 400 not pending · 401 anon · 403 not the proposer ·
  404 unknown proposal or wrong match. After 200, `…/schedule/active` returns `data: null`,
  a fresh propose succeeds immediately, and the cancelled row stays in `…/schedule/history`.
- ⚠️ For the UI: `responded_by_user_id` is now **"who took the terminal action"**, not
  "the opponent" — on a cancel it is the proposer. Do not label it as the responder.
- [ ] **UI still to build** — no withdraw affordance exists on the proposal card.
- **Symptom:** mistype a time and you are stuck. The proposer sees only
  "Waiting for your opponent to respond…" (`ProposalCard.vue:137-145`) with no cancel control, so
  a wrong proposal blocks scheduling for the full 48h TTL unless the opponent happens to respond.
- **Root cause:** no cancel endpoint is exposed (`routes/tournaments.rs:148-164`);
  `ProposalStatus::Cancelled` is only ever set by `admin_schedule`
  (`services/tournament/scheduling.rs:344-353`). A missing capability rather than a broken one.
- [ ] **DECIDED: proposers SHOULD be able to withdraw.** A real product/API gap: add the cancel
      endpoint and a control on `ProposalCard`. (Wave 3 — API first, then UI)

### P-10 — Admin registrations table prints the raw status enum
- ✅ **Verified already fixed** (`f2694b0`): `RegistrationsTab.vue:22` applies `getStatusLabel` over `registrationStatusMap`, which covers all eight DB statuses. Confirmed by inspection. No change needed.
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
- ✅ **Verified already fixed** (`ce732a0`): `LeagueTeamDetailModal.vue` uses the `rosterLock.ts` helper. Confirmed by inspection — imports `rosterLockColor/Hint`, renders via `rosterLockChip`. No change needed.
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

### P-14 — The roster lock CANNOT BE SET through the API, so all its enforcement is unreachable  ⚠️⚠️ whole feature non-functional
- **Symptom:** an admin sets "Roster Lock" and gets a **200 with no effect**. The column stays
  `'open'` forever, so every roster-lock rule the backend implements is dead code.
- **Verified chain:**
  - The DTO **accepts and validates** it — `portal-api/src/dto/requests/league_team.rs:189-217`
    parses `roster_lock_status` into `UpdateLeagueSeasonCommand`.
  - `LeagueSeasonService::update_season` (`portal-domain/src/services/league_team/season.rs:145-166`)
    **never forwards it**.
  - The repo command `UpdateLeagueSeason` (`portal-domain/src/repositories/league_team.rs:119-133`)
    **has no such field**, and the adapter's UPDATE never binds the column.
  - `LeagueSeasonService::update_roster_lock` (`season.rs:193-218`) would work but has
    **no HTTP route** — a search over `portal-api/src/routes` and `handlers` finds nothing.
- **Consequence:** the enforcement that *does* exist and is correct — `create_invitation`
  (`invitation.rs:85-89`), `accept_invitation` (`:288-293`), `add_member_authorized`
  (`team.rs:390-401`), `remove_member_authorized` (`team.rs:488-499`) — can never trigger.
- This is strictly more serious than P-11 (the UI half): P-11 made the control look absent;
  this makes the feature absent.
- **Why no e2e test asserts `hard_lock` blocks invites:** nothing can put a season into
  `hard_lock`, and e2e has no DB access. Rather than fake it, the test trips the *same*
  predicate through the reachable half (advancing the season to `active`, which also fails
  `allows_primary_roster_changes()`), with a comment explaining why the literal variant is
  unwritable. Ground rule 8.
- [ ] Fix: plumb `roster_lock_status` through `update_season` (add the repo field + bind the
      column), **or** expose a route for the existing `update_roster_lock`. Then add the
      `hard_lock` e2e test that is currently impossible.

### P-15 — Substitute invitations bypass the roster lock
- `create_invitation` (`invitation.rs:85-89`) and `accept_invitation` (`:288-293`) check only
  `role.is_primary()`; neither consults `allows_substitute_changes()`, and acceptance seats the
  member via `accept_and_add_member` directly on the repo, bypassing `add_member_authorized`.
- So under `hard_lock` — "no roster changes" per the migration's own comment — a **substitute**
  can still be invited and seated.
- **Reframed:** the sharp version of this is NOT "should `hard_lock` block substitutes" (a design
  opinion) but that **two paths disagree**. `add_member_authorized` correctly checks BOTH
  predicates; the invitation path checks only `role.is_primary()` and then seats the member
  directly on the repo, bypassing the authorized path entirely. Whatever the policy, both paths
  must implement it — today the same action is allowed or denied depending on which route you take.
- The domain is explicit that `hard_lock` excludes substitutes:
  `allows_substitute_changes()` returns `Open | SoftLock` only
  (`portal-core/src/types/league_team.rs`). It is dead code — never called.
- [ ] Fix: call `allows_substitute_changes()` on the invitation path (create + accept), or route
      acceptance through `add_member_authorized` so there is one enforcement point rather than two.

### P-18 — No admin or emergency override of the roster lock
- **Symptom:** under `hard_lock`, a team that genuinely cannot field (injury, no-show, no
  rostered substitute) has **no legitimate path** — and neither does a league admin. The lock
  check in `add_member_authorized` (`portal-domain/src/services/league_team/team.rs:390-401`) is
  **unconditional**; a search for any override/bypass/force path over
  `services/league_team/` finds nothing.
- **Why this matters:** real leagues handle "we can't field a team" with an admin exception, not
  by weakening the lock. The schema already anticipates it — `roster_locked_by` exists as an
  audit column — but there is no operation an admin can perform.
- **Note this is the RIGHT fix for the "subs should be flexible" instinct**, rather than exempting
  substitutes from `hard_lock`: exempting them reopens the ringer loophole the lock exists to
  close (anyone could be added mid-playoffs labelled "substitute"), whereas an audited admin
  override handles the genuine emergency without weakening the rule.
- [ ] Decide: add an admin-only roster change that bypasses the lock and is audited
      (actor + reason), or accept that `hard_lock` is absolute and leagues must use `soft_lock`
      when they want flexibility.

**Design context established while investigating this (worth keeping):**
- There is **no match-lineup concept** — match participants are team *registrations*
  (`migrations/0030_create_tournaments.sql:314-315`), so "who plays tonight" is not modelled.
  Anyone on the roster is eligible, always.
- Substitutes are a **pre-registered, capped bench** (`substitute` member role +
  `league_seasons.max_substitutes`, default 2), not ad-hoc fill-ins.
- Consequently, using an already-rostered sub in a match needs **no** roster change and is
  unaffected by any lock. `hard_lock` only blocks changing *who is eligible*.
- `soft_lock` already encodes "primary roster frozen, bench still movable" — so the flexible
  behaviour is a **per-season operator choice**, not a missing feature.

### P-16 — Role changes are not lock-checked
- `promote_to_captain` / `demote_from_captain` (`team.rs:526-600`) never consult the season lock,
  so captaincy can change under `hard_lock`.
- The UI is deliberately stricter here (the member-action menu is disabled under `hard_lock`);
  that mismatch should be resolved in the backend's favour or the UI's, not left implicit.
- [ ] Decide and align.

### P-17 — `LeagueSeasonEditModal` offers a roster-lock value the API rejects with 400
- ✅ **FIXED** in `7b4aa8d`. Both `<v-select>` option lists (`statusOptions` had `registration_open/registration_closed/in_progress`; `rosterLockOptions` had `locked`) are now derived from the real enums. Same P-11/P-22 family.
- `src/components/admin/LeagueSeasonEditModal.vue:196-199` — `rosterLockOptions` is
  `[open, locked]`. `'locked'` is not a valid `RosterLockStatus`, so selecting it produces a
  **400 "Invalid roster lock status"**; selecting `'open'` is a silent no-op per P-14.
- Its `statusOptions` (`:187-194`) are equally stale — `registration_open`,
  `registration_closed`, `in_progress` are not backend season statuses
  (`draft/registration/active/playoffs/completed/cancelled`). Same family as §9c.
- [ ] Fix both option lists against the real enums (and see §9c for the fourth `=== 'locked'`
      instance in `LeagueSeasonsPanel.vue`).

### P-19 — The "Upcoming" tournaments tab is silently empty  ⚠️ user-facing
- ✅ **FIXED** in `c4bca02`.
- **Symptom:** `pages/TournamentsPage.vue:195-197` filtered on
  `['draft','published','registration_open','registration_closed','ready']`. **Three of those
  five are not real statuses** (`registration_open`, `registration_closed`, `ready`), so the
  tab matched almost nothing and rendered as an empty state.
- ⚠️ **Correction to an earlier version of this entry**, which claimed none of the five were
  real. `draft` and `published` **are** valid. The authoritative list is
  `draft, published, registration, scheduled, in_progress, completed, finalized, cancelled`
  (`portal-core/src/types/status.rs:118-137`).
  **`migrations/0030_create_tournaments.sql:77` is STALE** — it still permits `check_in` and
  `seeding`, which no longer exist. The live constraint is
  `migrations/0053_fix_tournament_status_constraint.sql`. Do not read 0030 as source of truth.
  (0030 must NOT be edited to fix this — sqlx checksums applied migrations.)
- **Three further instances of the same defect were found in the same file and fixed:** the
  Registration-Open tab, the Completed tab (was dropping `finalized`), and the status
  `v-select`, which offered `registration_open` as a value into a strict-equality filter at
  `:221` so selecting "Open Registration" always returned zero results.
- **Impact:** the primary discovery surface for upcoming tournaments shows zero results,
  permanently. Not cosmetic — users cannot find tournaments that have not started.
- **Root cause:** same stale-status-string class as P-4/P-10/P-11 (§9c).
- [ ] Filter on the real statuses (`registration`, `scheduled`); add an e2e assertion that an
      upcoming tournament actually appears under the tab.

---

### P-20 — Home page drops matches in three states from "your upcoming matches"  ⚠️ user-facing
- ✅ **FIXED** in `c727267`. The active list is now *derived* from the shared `matchStatusMap` as "everything non-terminal", so a new status cannot be silently dropped again.
- **Symptom:** `pages/HomePage.vue:344` — `ACTIVE_MATCH_STATUSES` is
  `['pending','scheduling','scheduled','checking_in','in_progress']`. `scheduling` **is not a
  real status**, and `ready`, `pick_ban` and `awaiting_result` are **missing**. The local
  `matchStatusMap` (`:346-352`) has the same holes.
- **Impact:** a match sitting in veto (`pick_ban`) or awaiting a result — precisely when a
  player most needs to act — **does not appear on their home page at all.**
- [ ] Use the shared `matchStatusMap` from `utils/statusMaps.ts` instead of a second local copy,
      and derive the active list from it.

---

### P-21 — Tournament **list** page prints the raw status enum (P-4 verbatim, higher traffic)  ⚠️ user-facing
- ✅ **FIXED** in `c4bca02` using the P-4 public-map-first pattern; the two maps remain separate.
- **Symptom:** `components/tournament/TournamentCard.vue:107-155` is the same hand-rolled
  `switch` that P-4 fixed on the header — matching `registration_open`, `check_in_open`,
  `ready` (none real) and falling through to `default: return props.tournament.status`.
- **Impact:** every card on the tournaments list shows the raw enum. This is the **more
  trafficked** surface of the two; P-4 fixed only the detail page.
- **Fix is already available:** `tournamentPublicStatusMap` (added for P-4) has the correct
  public copy. ⚠️ Use the P-4 pattern — public map first, `tournamentStatusMap` as fallback.
  Do **not** collapse to the admin map; the divergence is intentional (see P-4).
- [ ] Replace the switch with the P-4 computed pattern.

---

### P-28 — `/tournaments` search and filters only see the first 20 rows  ⚠️ user-facing
- **Symptom:** `fetchData` in `pages/TournamentsPage.vue` sends only `page` / `per_page`.
  Search text, game, status and every tab then filter **client-side over the 20 rows already
  fetched**. Any tournament past position 20 in the default ordering is **undiscoverable by
  search** — typing its exact name returns nothing.
- **The API already supports this**: `search`, `status`, `upcoming` and `active` query filters
  exist server-side and are simply never sent.
- **Impact grows with the catalogue** — invisible with 12 tournaments, badly broken with 200.
  Found while fixing P-19; the tab filters and the search box share the root cause.
- [ ] Send the filters to the API instead of filtering the fetched page.

---

### P-22 — Season roster-lock column always reads "Open" (second instance of P-11)
- ✅ **FIXED** in `7b4aa8d`. Uses `rosterLockLabel/Color/Hint` from `rosterLock.ts` (fails closed: unknown ⇒ hard_lock). Verified: tsc + ratchet clean.
- **Symptom:** `components/admin/LeagueSeasonsPanel.vue:60,64` compares
  `roster_lock_status === 'locked'`. The real values are `open` / `soft_lock` / `hard_lock`,
  so the chip renders "Open" for every season including locked ones.
- **Impact:** admins are told every roster is unlocked. Compounds P-14 — the lock cannot be
  set, and where it could be, the UI would not show it.
- [ ] Use `rosterLockStatusMap`; fail closed (unknown ⇒ treat as locked), matching
      `src/utils/rosterLock.ts`.

---

### P-27 — `invite_only` tournaments accept anyone (leagues enforce it; tournaments don't)
- **Symptom:** `register_team` (`portal-domain/src/services/tournament/service.rs:451`) and
  `register_player` (`:505`) check only `is_registration_open()`. There is **no invite check**,
  so an `invite_only` tournament behaves exactly like `approval`: anyone may register, an
  organiser must approve.
- **The inconsistency is the tell:** leagues *do* enforce it —
  `portal-domain/src/services/league.rs:218` returns `DomainError::LeagueInviteOnly`
  (mapped to 400 at `portal-api/src/error.rs:276`). The same concept is enforced for leagues
  and decorative for tournaments.
- **Impact:** an organiser running a closed/invited event gets no protection from the setting
  that promises it — the tournament is silently public. Found while implementing P-2, which
  touches the same `RegistrationType` match but does not change this.
- [ ] Decide whether tournaments need a real invite list (leagues have one) or whether
      `InviteOnly` should be removed from `RegistrationType` as a false promise.

---

### P-29 — `GET /v1/users/me/matches` returns HTTP 500 for every caller  ⚠️⚠️ backend, hard failure
- **Symptom:** the endpoint 500s unconditionally — reproduced live with both admin and
  participant tokens: `for SELECT DISTINCT, ORDER BY expressions must appear in select list`.
- **Root cause:** `list_by_player`
  (`api/crates/portal-db/src/adapters/tournament/match_.rs:807-837`) does `SELECT DISTINCT tm.*`
  then `ORDER BY CASE tm.status::text WHEN … END`. Although `tm.status` is selected via `tm.*`,
  the `CASE` **expression** is not in the select list, which Postgres rejects unconditionally
  under `DISTINCT`. Not data-dependent — it fails on every call, empty DB or not.
- **Why it stayed hidden:** `src/stores/players.ts:fetchMyMatches` swallows the error, so the
  profile's "Recent Matches" card silently shows "No matches yet". Same swallowed-error family
  as P-6.
- **Blast radius:** the `MatchHistoryList` label fix in `c727267` is correct but **unreachable**
  until this is fixed. Its e2e test was **dropped, not weakened** (documented at
  `e2e/player-profile.spec.ts:246`), per §3.
- [ ] Fix the query: the `OR` join on both participant slots can duplicate rows, so `DISTINCT`
      is likely load-bearing — add the `CASE` ordering expression to the select list rather than
      dropping `DISTINCT`.
- [ ] Then restore the `MatchHistoryList` e2e test.
- [ ] Un-swallow `fetchMyMatches` so the next such 500 is visible, not silent.

---

### P-30 — `LeagueSeasonEditModal` Save is permanently disabled for a default season  ⚠️ user-facing dead end
- **Symptom:** every newly created season has `max_teams = null` (the default). The edit
  modal binds "Max Teams" with the `positiveNumber` rule, which — unlike the sibling
  `nonNegativeNumber` / `maxGreaterThanMin` rules — has **no empty-value guard**
  (`src/composables/useFormRules.ts:39`: `(v: number) => v > 0 || '…'`; `null > 0` is false).
  So `formValid` is false on open and **Save Changes never enables** until the admin happens
  to type a Max Teams value.
- **Impact:** an admin cannot edit *any* setting of a freshly-created season — change its
  status, its dates, anything — without first noticing they must fill an unrelated optional
  field. Found while writing the P-17 status-persist test; worked around by filling a valid
  Max Teams rather than weakening the assertion.
- **Not fixed** — the rule lives in the frozen `src/composables/`. Root cause is a missing
  null guard on one rule, so the fix is one line but should be verified against every other
  `positiveNumber` call site.
- [ ] Add an empty/null guard to `positiveNumber` (mirror `nonNegativeNumber`), or make the
      Max Teams binding tolerate empty.

---

### P-23 — Roster-mismatch detection is fully built and permanently dead  ⚠️ integrity
- **Symptom:** `result_reviews.roster_mismatch` / `unrecognized_players`
  (`migrations/0042_result_reviews.sql:18,25`) and the whole two-captain acknowledgment flow
  (`services/tournament/result_review.rs:45-170`) are complete. The producer is
  `let unrecognized = Vec::new();` (`portal-api/src/adapters/demo_validator.rs:88`) — declared,
  never mutated, passed at `:145`. **`roster_mismatch` is always false in production.**
- **Same defect in the CS2 plugin:** `Cs2EvidenceValidator::verify_players` returns
  `(true, 0, 0)` on empty input (`evidence_validator.rs:182-186`) and its only production call
  site passes two empty slices (`plugins/src/games/cs2/mod.rs:1352`, comment: *"Steam IDs
  unavailable at this layer"*). Player verification always passes.
- **Root cause:** both need to know who was *supposed* to play. Nothing records that.
  → blocked on `docs/lineup-design.md`.
- [ ] Populate `unrecognized_players` by diffing demo Steam IDs against the declared lineup.

---

### P-24 — `match_check_in` has NO authorization: anyone can check in any team  ⚠️⚠️ SECURITY
- ✅ **FIXED** in `98c8f48` (api repo). Verified independently: fmt/clippy clean, and the three
  denial tests were confirmed to fail (200 instead of 403) when the guard is reverted, so they
  catch the real bug.
- **Scope was WORSE than recorded — the same hole existed in two more endpoints**, both now fixed:
  - `POST /matches/{id}/forfeit` — even more damaging: hands someone else's match away.
  - `POST /registrations/{rid}/check-in` — participant-facing tournament check-in.
  - `POST /registrations/{rid}/admin-check-in` was **already** gated by
    `tournament.participants.manage` — verified, left unchanged.
- **Fix:** generalized the veto authorization service to `can_act_for_registration` and added a
  `require_registration_actor` handler helper — scoped `tournament.participants.manage` +
  admin override first, then the participant-actor fallback (captain / owner / delegate, or the
  registered player for individual entries). The helper resolves the tournament from the
  **registration row, not the URL**, closing a cross-tournament variant the agent found unprompted.
- **Bonus hardening:** the participant-binding check now runs BEFORE the `Scheduled → CheckingIn`
  auto-transition, so a rejected non-participant can no longer nudge match status as a side effect.
- **Symptom:** `portal-api/src/handlers/tournaments/match_lifecycle.rs:116-155` takes
  `AuthenticatedUser` but **no `PermissionChecker`**, and
  `services/tournament/match_lifecycle.rs:201-208` only verifies the `registration_id` is one of
  the two match participants — never that the caller has any authority over it.
- **Impact:** any authenticated user can check in **any** team for **any** match. Because
  `both_checked_in()` auto-advances to `PickBan`/`InProgress` (`match_lifecycle.rs:244-260`), a
  stranger can **force a match to start**. The stored `participantN_checked_in_by` is then a
  meaningless audit value.
- **Contrast:** veto solves exactly this — `services/tournament/veto_authorization.rs:114-160`
  (captain / owner / active `veto_delegates`). Check-in simply never adopted it.
- **Fix independently of the lineup work — this is live.**
- [ ] Reuse `VetoAuthorizationService::is_captain / is_owner / is_delegate` in `check_in`.
- [ ] Add an e2e test: a non-member must get 403 checking in someone else's team.

---

### P-25 — Benched players are credited with matches they did not play  ⚠️ integrity
- **Symptom:** the completion saga bumps `player_game_profile` (`matches_played`, `wins`,
  `losses`, `win_streak`) for the **team-season roster**, recording idempotency in
  `player_match_stats_applied (player_id, match_id)`
  (`migrations/0073_player_match_stats_applied.sql:20-28`). There is no lineup, so it cannot do
  otherwise.
- **Impact:** a player who sat out the entire season still shows a full match record.
- **Related:** demo stat attribution is a bare global `steam_id_64` equality UPDATE with **no**
  match/roster/eligibility predicate (`adapters/demo.rs:899-919`,
  `adapters/demo_stats.rs:118-132`), so **a ringer's stats count** toward leaderboards
  (`demo_stats.rs:175-205`) and awards. → blocked on `docs/lineup-design.md`.
- [ ] Credit participation from the lineup, not the roster.

---

### P-26 — "Substitutes cannot play against their primary team" is a comment, not a rule
- **Symptom:** `migrations/0025_league_teams_and_seasons.sql:16` states the intent. No code
  enforces it. `idx_one_primary_team_per_season`
  (`0026_restructure_league_teams.sql:275-277`) deliberately lets a `substitute` be active on
  many teams in one season, so the situation is reachable by design.
- **Why it is unenforceable today:** the rule is about a *match* ("play against"), and nothing
  binds a player to a match. → blocked on `docs/lineup-design.md`.
- [ ] Enforce at lineup submission once lineups exist.

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
- [x] → **promoted to P-19, FIXED `c4bca02`.** **`pages/TournamentsPage.vue:196`** — the **"Upcoming" tab filters on
      `['draft','published','registration_open','registration_closed','ready']`**. The real
      statuses are `registration` and `scheduled`, so the tab **silently drops nearly every
      upcoming tournament**. Not cosmetic — the page appears empty.
- [x] → **promoted to P-20.** **`pages/HomePage.vue:344,346-352`** — the local map and `ACTIVE_MATCH_STATUSES`
      contain `'scheduling'` (not a real status) and omit `ready`, `pick_ban`,
      `awaiting_result`, so **matches in those states never appear in "your upcoming
      matches"**.
- [ ] `pages/TournamentsPage.vue:190` — the Registration-Open tab compares
      `'registration_open'`; it only works at all via the `is_registration_open` fallback.

### Raw enum leaked to users (P-4 / P-10 class)
- [x] → **promoted to P-21, FIXED `c4bca02`.** **`components/tournament/TournamentCard.vue:108-155`** — **P-4 verbatim, still
      unfixed, on the tournaments LIST page** (`registration_open`, `check_in_open`,
      `ready` … then `default: return props.tournament.status`). Arguably higher-traffic
      than the header that was fixed. `tournamentPublicStatusMap` already has the right
      public copy.
- [x] **FIXED `c727267`** `components/player/MatchHistoryList.vue:41` — renders the raw status on the public
      player profile.
- [x] **FIXED `c727267`** `pages/LeagueDetailPage.vue:154` — renders the raw season status; the file imports
      `getStatusLabel` but never applies it. NOTE: `e2e/league-season.spec.ts:68,185`
      currently assert the raw text and must be updated with the fix.
- [x] **FIXED `c4bca02`** — `components/tournament/TournamentMatchCard.vue:113,149` — compares `'scheduling'`
      (not a real status) and omits `ready`/`forfeit`, which fall through to the raw enum.
- [x] **FIXED `c727267`** `components/match/evidence/EvidenceDisplay.vue:65-66` — raw evidence status (no map
      exists for it yet).

### Dead conditions / behavioural gaps
- [x] → **promoted to P-22, FIXED `7b4aa8d`.** **`components/admin/LeagueSeasonsPanel.vue:60,64`** — a **second instance of P-11**:
      `roster_lock_status === 'locked'`, so the Locked/Open column always reads "Open".
- [x] **FIXED `c727267`** `components/match/MatchStatusTimeline.vue:48-62` — the step list omits `forfeit` and
      `disputed`, so such a match highlights no current step.
- [x] **FIXED `c727267`** `composables/useMatchLobby.ts:154-165` — a `cancelled` veto session is treated as
      in-progress.
- [x] **FIXED `7b4aa8d`** — `components/admin/DisputeDetailModal.vue:201`: rebuilt as `canResolve` mirroring `Dispute::can_resolve()` (pending | under_review), wider than the old accident which showed the resolve UI on cancelled disputes. — `status !== 'closed'` can never be
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
