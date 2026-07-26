# E2E Test Backlog

Prioritized workflows to add to the Playwright suite at `web/e2e/`. Each item is scoped so a single agent can own it independently. Items call out the **suggested file**, the **scenarios** to cover, **fixtures needed**, and a rough **effort** (S/M/L).

## Coverage baseline (as of 2026-04-20)

Existing specs in `web/e2e/`:
- `auth.spec.ts` — registration, login, password visibility, session persistence
- `admin-management.spec.ts` — dashboard, bans list/filter, games list, access control
- `league-season.spec.ts` — league browse, season view, team creation, admin season
- `match-results.spec.ts` — result submission, confirmation, dispute creation
- `match-workflow.spec.ts` — scheduling, check-in panel, counter-proposal
- `player-profile.spec.ts` — profile view/edit, availability management
- `team-management.spec.ts` — team creation, invitations (accept/decline), roster display
- `tournament-admin.spec.ts` — create, publish, open/close registration, approve/reject
- `tournament-public.spec.ts` — browse, register (individual + team), withdraw
- `tournament-team.spec.ts` — team tournament view, team registration

Fixture surface (`e2e/fixtures/`):
- `auth.fixture.ts` — `loginAsAdmin`, `loginAsPlayer2`, `getAdminToken`, `authenticatedPage` fixture
- `match.fixture.ts` — `getFirstMatch`, `proposeSchedule`, `submitResult`, `respondToResult`, `setAvailabilityWindow`
- `team-member.fixture.ts` — `invitePlayer`, `acceptInvitation`, `declineInvitation`
- `test-data.ts` — `testUsers`, `testTournaments`, `testTeams`, `testLeagues`
- `seeded-state.ts` — IDs + tokens from `global-setup.ts` (admin, player2, tournament, match, league, season, team)

## Tier 1 — Critical Paths (ship first)

### 1.1 Image uploads (profile + team) — **S, high priority**

- **File:** `e2e/uploads.spec.ts`
- **Why:** Just-shipped backend endpoints (`POST /v1/league-teams/{id}/{logo,banner}`) and a refactored `ImageUpload` component with a typed `path`/`pathParams` API + `onUnauthorized` retry. Zero e2e coverage today.
- **Scenarios:**
  - Player uploads avatar on Profile Edit → `ProfilePage` reloads and shows the new URL
  - Player uploads banner → same
  - Team owner uploads team logo on Team Edit → team detail displays it
  - Team owner uploads team banner → same
  - Non-owner attempts team upload via direct navigation → UI blocks or API returns 403 surfaced as error alert
  - Invalid MIME type (text file) → client-side validation rejects before POST
  - Oversized file (larger than the component's `maxSize` prop) → same
- **Fixtures needed:**
  - A tiny valid test image under `e2e/fixtures/images/test.png` (1x1 PNG, ~100 bytes)
  - An invalid file (text file) for rejection tests
- **Notes:** `ImageUpload` is typed against OpenAPI `MultipartPath`. Prop API is `path="/v1/…"` + `:path-params="{ team_id: id }"`. Verify reload persistence, not just "upload returned 200".

### 1.2 Dispute resolution (admin side) — **M, high priority**

- **File:** `e2e/dispute-resolution.spec.ts`
- **Why:** `match-results.spec.ts` covers raising a dispute but the admin resolution surface (`AdminDisputesPage`, `DisputeDetailModal`, `DisputeThreadPanel`) has no coverage. `DisputeThreadPanel.authorLabel` was recently changed.
- **Scenarios:**
  - Submit result as P1 → P2 disputes with reason → admin opens `AdminDisputesPage` → finds dispute in list → opens detail → posts admin reply → resolves in favor of P1 → match shows P1 as winner and status=completed
  - Admin posts an internal note (`is_internal=true`) → captain thread panel doesn't show it (visibility test on `DisputeThreadPanel`)
  - Resolve in favor of P2 flips the winner and score
- **Fixtures needed:** extend `match.fixture.ts` with `raiseDispute(matchId, reason)` and `addDisputeMessage(disputeId, text)`. Both via API to keep setup fast.
- **Dependency:** check `handlers/disputes.rs` for POST message + resolve endpoints; OpenAPI types are already regenerated.

### 1.3 Full tournament lifecycle (admin) — **L, high priority**

- **File:** `e2e/tournament-lifecycle.spec.ts`
- **Why:** Covers the bulk of the recent W1 lifecycle-guard unification and `useTournamentAdminActions`. Admin specs test each transition in isolation, none walks the state machine end-to-end.
- **Scenarios (one long linear test):**
  - Admin creates tournament (draft) → publishes → opens registration → two seeded players register → admin approves both → closes registration → auto-seeds → starts tournament → bracket populates → round-1 matches visible
  - Admin cancels tournament mid-play → confirm dialog → status=cancelled → only "View Public" button remains
  - Re-open registration from `scheduled` → status bounces back to `registration`
  - Negative: after `completed`, publish/start buttons aren't present (guard gates hide them)
- **Fixtures needed:** new `tournament.fixture.ts` with `createTournament(body)`, `approveRegistration`, `openRegistration` helpers. Needs two seeded players with league-team rosters for team tournaments, but this item can use individual participants to keep it simple.

### 1.4 ImageUpload round-trip (merged into 1.1)

Small enough to fold into 1.1. No separate file.

## Tier 2 — Important

### 2.1 Ban enforcement lifecycle — **M**
- **File:** `e2e/bans.spec.ts`
- **Why:** Admin tests cover creation UI but enforcement (banned player can't register / check-in / submit) is untested.
- **Scenarios:** admin bans player → banned user sees block message on relevant page; admin lifts ban → user can proceed; ban expiry auto-lifts.
- **Fixture:** new `admin.fixture.ts` with `createBan` + `liftBan` helpers.

### 2.2 League + season creation (admin) — **M**
- **File:** `e2e/league-admin.spec.ts`
- **Why:** `LeagueCreateModal`, `LeagueEditModal`, `LeagueSeasonCreateModal`, `LeagueSeasonEditModal` have no e2e. The `useLeagueEligibility` composable is runtime-only today.
- **Scenarios:** admin creates league with eligibility rules → rules persist; admin edits → clears rules; creates season → configures dates → appears on public detail; under-rating player blocked from join (exercises EligibilityService).

### 2.3 Registration approval + bracket seeding — **M**
- **File:** `e2e/tournament-seeding.spec.ts`
- **Why:** `handleApproveRegistration` / `handleRejectRegistration` / `autoSeed` / `manualSeed` combined are the gap between "tournament exists" and "matches can be played."
- **Scenarios:** approval-type tournament: 4 apply, admin approves 3 + rejects 1 (with reason) → reg closes → auto-seed → round-1 pairings materialize. Manual seed reorder → participants reflect new order. Re-seed after late withdrawal.

### 2.4 Match check-in enforcement — **S**
- **File:** `e2e/match-checkin.spec.ts`
- **Why:** `match-workflow.spec.ts` tests only the visual check-in panel. Enforcement (required before `in_progress`, no-show auto-forfeit) is untested.
- **Scenarios:** check-in required: P1 checks in, P2 doesn't → admin triggers `processNoShows` → match forfeited to P1; both check in → match transitions to `in_progress`.

### 2.5 Team roster management — **M**
- **File:** `e2e/team-roster.spec.ts`
- **Why:** `team-management.spec.ts` covers invite/accept but not promote/demote, remove, ownership transfer.
- **Scenarios:** captain promotes/demotes co-captain, captain removes member (member loses access), owner transfers ownership (old owner loses team-settings).

## Tier 3 — Backfill

### 3.1 Demo upload + evidence pipeline — **L**
- **File:** `e2e/evidence.spec.ts`
- **Scenarios:** upload demo → link to match → appears in evidence list → admin reviews → dispute cites it.

### 3.2 Player search + public profile — **S**
- **File:** `e2e/players.spec.ts`
- **Scenarios:** `PlayersPage` search/filters, navigate to `PlayerDetailPage`, match history + game stats display.

### 3.3 RBAC permissions (admin) — **M**
- **File:** `e2e/permissions-admin.spec.ts`
- **Scenarios:** role creation + assignment + scope-based action visibility.

### 3.4 Availability calendar deep coverage — **M**
- **File:** `e2e/availability.spec.ts` (extend existing or split)
- **Scenarios:** weekly schedule, overrides, overlap detection, `useAvailabilityOverlay` driving suggested times.

### 3.5 Full onboarding journey — **L, integration**
- **File:** `e2e/onboarding-journey.spec.ts`
- **Scope:** register → profile → find league → create team → register for tournament → schedule → play → result. One linear ~200-line journey.
- **Caveat:** brittle. Tag `@slow` / `@nightly`; exclude from PR CI, run on main merges only.

## Conventions for contributors

1. **API-seed setup, UI-assert behavior.** Follow the existing `match.fixture.ts` pattern — don't build test state by clicking through the UI.
2. **Prefer `testTournaments.standard` / `testTournaments.team`** from `test-data.ts` when the scenario doesn't need a bespoke config.
3. **Use unique identifiers per run** — `Date.now()` suffix or `crypto.randomUUID()` — so parallel runs don't collide on unique constraints.
4. **Extend `global-setup.ts` only if the seeded state is reused across 3+ specs.** Prefer per-test API setup.
5. **Tag expensive tests `@slow`** so CI can exclude them from PR runs: `test('…', { tag: '@slow' }, async () => { … })`.
6. **Declare `serial` mode for dependent tests:** `test.describe.configure({ mode: 'serial' })` when tests share mutable state.
7. **Don't edit existing fixture files without checking for parallel work** — extensions to `auth.fixture.ts` / `match.fixture.ts` should coordinate via PR review. New narrowly-scoped fixtures (e.g. `dispute.fixture.ts`) avoid conflicts.

## Dispatch order recommendation

Three parallel agents, wave-based:

**Wave 1:** 1.1 uploads · 1.2 dispute resolution · 2.4 check-in enforcement
**Wave 2:** 1.3 tournament lifecycle · 2.3 seeding/approval · 2.5 team roster
**Wave 3:** 2.1 bans · 2.2 league admin · 3.1 evidence pipeline
**Later:** 3.2 / 3.3 / 3.4 / 3.5 as backfill

Wave 1 covers recent changes + biggest coverage gaps. Wave 2 introduces fixtures later waves reuse.
