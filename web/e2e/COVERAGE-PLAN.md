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

---

## 4. Phase 0 — Guardrails (do these FIRST, before the sweeps)

Landing these first stops the debt from being re-created while we pay it down.

- [ ] **Ban the vacuous guard in CI.** ESLint rule (or a grep gate) failing on
      `isVisible().catch(() => false)` used as an `if` condition inside `web/e2e/`.
- [ ] **Ban tautological assertions**: `expect(… || true)`, and flag
      `expect(a || b).toBe(true)` for manual review.
- [ ] **Lint rule / review check: no test body without at least one `expect`.**
- [ ] Add a short `web/e2e/README.md` pointing at §3 Ground rules + this plan.
- [ ] Decide + document the exemption mechanism (e.g. `// coverage-plan-exempt: <reason>`)
      so genuinely API-only tests (RBAC 403 checks) can pass the gate honestly.

---

## 5. Phase 1 — P0: the critical holes

Highest risk-per-effort. These are the flows a real user hits first.

### 5.1 Result flow — the exact hole that hid the dispute bug

- [ ] **`match-results.spec.ts:360`** — "P1 submits a result, **P2 disputes it**" does the
      dispute via `disputeResultClaim()` at `:373`. Replace with UI: prime P2 auth → goto
      match → click `Dispute` → fill `Reason for dispute` → click **`Submit Dispute`** →
      assert `Disputed` in UI **and** `getMatch().status === 'disputed'`.
      Keep `submitResultClaim` at `:366` as seeding. → covers `ResultDisputeModal.handleDispute`
- [ ] **`match-results.spec.ts:306`** — confirms via `confirmResultClaim()` at `:339`.
      Replace with a second browser context as P2 clicking **`Confirm Result`**; assert the
      `Final` chip + `1 - 0`. → covers `ResultConfirmationPanel.handleConfirm`
      **(currently untested on the happy path of the most important flow in the product)**
- [ ] **`match-results.spec.ts:269`** — keep the validation half; drop the cancel-only
      ending once the above lands (it created the false sense of coverage).

### 5.2 Tournament registration — the primary way a user enters the product

Root cause: `global-setup.ts:657–721` (`startTournamentAndGetMatches`) **starts** the
seeded tournament, so `Register Now` / `Withdraw` / `Check In` never render and all 9
guarded bodies skip. The spec's own comments concede this (`:187–188`, `:300–301`).

- [ ] Build a fresh `registration`-status tournament per test using
      `fixtures/tournament-lifecycle.fixture.ts:271–296` (`createDraftTournament` → publish →
      open-registration). Stop pointing these at `TEST_TOURNAMENT_SLUG`.
- [ ] `:156` redirect-to-login when unauthenticated (guard `:165`)
- [ ] `:205` open registration modal (guard `:219`)
- [ ] `:228` **register successfully** — remove guard `:255` + early `return` `:249`; replace
      the "no error visible" assertion `:284` with a positive chip assertion + `listRegistrations()`
- [ ] `:364` / `:383` withdraw shown / withdraw performed (guards `:377`, `:394`)
- [ ] `:407` check-in button — **body currently has no action and no assertion**
- [ ] `:420` checked-in status after check-in (guard `:431`)

→ covers `PlayerRegistrationModal.handleRegister`, `TournamentDetailPage.handlePlayerRegister`,
`TournamentDetailPage.handleCheckIn`, withdraw on `TournamentRegistrationCard`,
`stores/tournament/_registrations.ts`

### 5.3 Assertions that verify nothing

- [ ] **`admin-management.spec.ts:323`** — "redirect non-admin users from admin pages"
      asserts the URL lacks `/admin/dashboard`, **a route that does not exist** (`router/index.ts:143`
      → `/admin`). A security test that always passes. Use `await expect(page).not.toHaveURL(/\/admin/)`.
- [ ] `admin-management.spec.ts:257` — delete `expect(hasRefresh || true).toBe(true)`
- [ ] `admin-management.spec.ts:275` — "filter games by search" types, then asserts nothing
- [ ] `auth.spec.ts:171` — dead test; `/tournaments` is public (`router/index.ts:67–70`).
      Retarget at `/my-teams` or `/profile`
- [ ] `player-profile.spec.ts:158` — "update bio successfully" falls back to asserting the
      field it just typed into (`:202`). Assert the snackbar + API re-fetch
- [ ] `player-profile.spec.ts:302` — "create availability window" asserts only the page
      heading (`:333`). Assert the new slot renders + `GET /v1/players/me/availability`
- [ ] `player-profile.spec.ts:336` — asserts the heading, not that the dialog closed

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
- [ ] Add a test that actually **creates a ban** (`BanCreateModal.submit`) and one that **lifts** it;
      assert the row + `GET /v1/admin/bans`
- [ ] (assertion fixes tracked in §5.3)

### 6.7 Smaller items
- [ ] `veto-bo3.spec.ts:244` — **class B**: name says "the opponent selects the side" but the
      write is `selectSide()` at `:300`; the CT/T buttons are only asserted visible `:284–289`.
      Click the button instead; keep the backend cross-check `:303–308`
- [ ] `match-checkin.spec.ts:74–93` — the one UI click has a silent API fallback; remove it
- [ ] `team-roster.spec.ts` — demote/transfer are API-driven because **no UI exists**;
      confirm that's intended (if UI is planned, add tests then)
- [ ] `auth.spec.ts:171` — dead test (also in §5.3)

---

## 7. Phase 3 — Untested frontend inventory

Handlers with user-facing **mutating** actions that **no e2e test triggers through the UI**.

### Tier 1 — core user flows (highest risk)
- [ ] `ResultConfirmationPanel.handleConfirm` — `components/match/results/ResultConfirmationPanel.vue:231`
- [ ] `ResultDisputeModal.handleDispute` — `components/match/results/ResultDisputeModal.vue:102`
- [ ] `PlayerRegistrationModal.handleRegister`
- [ ] `TournamentDetailPage.handlePlayerRegister` / `handleCheckIn`
- [ ] `TeamRegistrationModal.handleRegister` + `TournamentDetailPage.handleTeamRegister`
- [ ] `MatchDetailPage.handlePropose` / `handleAccept` / `handleReject` / `handleCounter`
      (+ `MatchSchedulingPanel.submitProposal/submitCounter`, `ProposalCard.handleAccept/confirmReject`)
- [ ] `TeamEditPage.handleSubmit`
- [ ] `LeagueTeamCreateModal.save` + `LeagueDetailPage.handleCreateTeam`
- [ ] `InvitationsPage.handleAccept` `:257` / decline / `handleAcceptLeague` `:233` / `handleDeclineLeague` `:245`
      — **the only way to join a team**
- [ ] `LeagueTeamInviteModal` submit

### Tier 2 — admin / organizer surfaces
- [ ] `BanCreateModal.submit`; `BanDetailModal` lift/detail actions; `AdminBansPage`
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

- [ ] `match-results.spec.ts:360` "P2 **disputes it**" → API call `:373`
- [ ] `team-management.spec.ts:231` "should **create team successfully**" → may not execute
- [ ] `team-management.spec.ts:788` "should **save** team changes" → triple-guarded
- [ ] `team-management.spec.ts:478` "should **remove member**" → clicks Cancel
- [ ] `team-management.spec.ts:510` "should **send invitation**" → never submits
- [ ] `team-management.spec.ts:554` / `:571` "should **handle accept/decline**" → never runs
- [ ] `tournament-public.spec.ts:228` "should **register player successfully**" → guarded, early-returns
- [ ] `tournament-public.spec.ts:383` "should **withdraw**" → guarded
- [ ] `tournament-public.spec.ts:420` "checked-in status **after check-in**" → guarded
- [ ] `tournament-public.spec.ts:407` "should show check-in button" → no action, no assertion
- [ ] `tournament-admin.spec.ts:284` / `:311` / `:372` "**approve/reject/disqualify**" → guarded
- [ ] `tournament-admin.spec.ts:415` / `:439` / `:463` "**publish/open/close** registration" → guarded
- [ ] `admin-management.spec.ts:323` "**redirect non-admin users**" → asserts a nonexistent route
- [ ] `admin-management.spec.ts:275` "should **filter** games" → asserts nothing
- [ ] `player-profile.spec.ts:158` "should **update bio successfully**" → asserts its own input
- [ ] `player-profile.spec.ts:302` "should **create** availability window" → asserts a heading
- [ ] `tournament-team.spec.ts:87` / `:137` / `:200` → `expect(.v-card).toBeVisible()`
- [ ] `veto-bo3.spec.ts:244` "**the opponent selects the side**" → `selectSide()` REST call

**Honest-by-name API tests — leave as-is** (each still marks a UI path needing its own test):
`team-roster.spec.ts:86`, `match-results.spec.ts:306` ("via API" — being replaced in §5.1),
`team-management.spec.ts:840`, `awards.spec.ts:141`, `admin-demo-links.spec.ts:140`,
`steam-auth.spec.ts:31`, `match-checkin.spec.ts:125`.

---

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
| `auth.spec.ts` | 13 | 12 | – | – | 1 | [x] | [ ] | §5.3 — dead test `:171` |
| `match-checkin.spec.ts` | 3 | 2 | – | 1 | – | [x] | [ ] | §6.7 — silent API fallback |
| `team-roster.spec.ts` | 4 | 2 | 2 | – | – | [x] | [ ] | §6.7 — demote/transfer have no UI |
| `match-results.spec.ts` | 15 | 13 | 1 | – | 1 | [x] | [ ] | **§5.1 P0** |
| `player-profile.spec.ts` | 18 | 15 | – | 2 | 1 | [x] | [ ] | §5.3 |
| `match-workflow.spec.ts` | 18 | 15 | – | – | 3 | [x] | [ ] | §6.5 |
| `admin-management.spec.ts` | 23 | 18 | – | 2 | 3 | [x] | [ ] | §5.3 + §6.6 — zero mutations |
| `tournament-admin.spec.ts` | 23 | 15 | – | – | 8 | [x] | [ ] | §6.3 — 16 guards |
| `tournament-team.spec.ts` | 18 | 6 | – | 9 | 3 | [x] | [ ] | §6.4 — smoke tests |
| `tournament-public.spec.ts` | 21 | 8 | – | 4 | 9 | [x] | [ ] | **§5.2 P0** — 25 guards |
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

- [ ] **Wave 0 (serial):** Phase 0 guardrails + all shared fixture/`global-setup` changes
      needed by Phase 1 (esp. the fresh-registration-tournament helper for §5.2).
- [ ] **Wave 1 (parallel, P0):** one agent each →
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
5. The relevant boxes in this document are ticked in the same commit.

---

## 12. Overall definition of done

- [ ] Phase 0 guardrails merged and enforcing in CI
- [ ] Zero vacuous guards across `web/e2e/`
- [ ] Zero class-B tests (or renamed to honestly describe an API-level check)
- [ ] Every Tier 1 handler (§7) exercised through the UI
- [ ] Every route in §8 loaded by at least one test
- [ ] Every misleading name in §9 fixed or renamed
- [ ] Full suite green, and a deliberately broken component makes it **red** (spot-check the guarantee)
