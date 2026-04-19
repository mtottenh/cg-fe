# Frontend Refactor Roadmap

Tracked outcomes from the code review (2026-04-19). Items ordered by risk/leverage.

Legend: 🔴 Critical · 🟡 Important · 🟢 Nice-to-have · ✅ Done

## Week 1 — Safety net & quick wins

- [ ] 🔴 **W1.1 ESLint + CI type-checking.** Add `eslint-plugin-vue`, `@vue/eslint-config-typescript`, `@typescript-eslint/no-explicit-any` (warn). Add `lint` and `typecheck` scripts; surface in CI.
- [ ] 🔴 **W1.2 Dead `loading`/`error` refs on stores.** Stores expose `loading = ref(false)` / `error = ref(null)` that are never assigned. Pages consume them thinking they're live signals. Convert to computed aggregates over the per-action states.
  - `stores/tournaments.ts:95` (consumers: `AdminTournamentDetailPage.vue:712`, `AdminTournamentsPage.vue:269`, `TournamentDetailPage.vue:336`, `useMatchDetail.ts:54`)
  - `stores/evidence.ts:31`, `stores/availability.ts:26`, `stores/disputes.ts:37`, `stores/bans.ts:35`, `stores/matchScheduling.ts:21`, `stores/rbac.ts:23`, `stores/resultReviews.ts:20`, `stores/matchResults.ts:27`, `stores/players.ts:32`, `stores/auth.ts:46-47`
- [ ] 🟡 **W1.3 `window.confirm()` at `LeagueDetailPage.vue:549`.** Replace with `useConfirmDialog` to match the rest of the app.
- [ ] 🟡 **W1.4 `as any` casts in `useSteamTracking.ts` and `usePlayerStats.ts`.** Five occurrences manually destructure `{ data, error: apiError }` then cast. Switch to `unwrapApi` like every other store.
  - `useSteamTracking.ts:20,54,78,100`
  - `usePlayerStats.ts:38`
- [ ] 🔴 **W1.5 `useMatchDetail` polling re-fetches the world every 15 s.** `composables/useMatchDetail.ts:237-251` calls `fetchAll`, which re-hits tournament-by-slug, registrations, my-teams, proposals, evidence, discover-demos, dispute… Narrow the poll to match-state endpoints only.

## Week 2 — Store de-monolithing

- [ ] 🔴 **W2.1 Split `stores/tournaments.ts` (960 LOC, 45+ actions)** into domain stores under `stores/tournament/`:
  - `tournamentsStore` — CRUD + lifecycle (publish, cancel, finalize…)
  - `tournamentRegistrationsStore` — registrations, approvals, withdraw, check-in
  - `tournamentMatchesStore` — matches, brackets, admin match actions, progression
  - `tournamentSeedingStore` — seeding
  - `tournamentStagesStore` — stages + map pool
- [ ] 🟡 **W2.2 `storeToRefs` adoption.** Only 3 files use it; ~10 pages redeclare store fields as computeds. Migrate the worst offenders (admin pages + large detail pages).

## Week 3 — Modal modernization

- [ ] 🟡 **W3.1 `defineModel<boolean>()` migration.** 36 modal components manually declare `modelValue` prop + `update:modelValue` emit. Only 2 files use `defineModel` today. Mechanical, grouped by directory.
- [ ] 🟡 **W3.2 `withFeedback` helper.** 30+ near-identical `try { await store.X(id); snackbar.show(...); await fetchData() } catch { snackbar.show(store.error, 'error') }` blocks in admin pages. Extract a single wrapper.

## Week 4 — AdminTournamentDetailPage breakup

- [ ] 🔴 **W4.1 Split `AdminTournamentDetailPage.vue` (1163 LOC)** by tab: `TournamentOverviewTab`, `TournamentRegistrationsTab`, `TournamentSeedingTab`, `TournamentBracketTab`, `TournamentMatchesTab`, `TournamentStagesTab`. Extract `<TournamentStatusActions>` and `useTournamentAdminActions(tournament)` composable.
- [ ] 🟡 **W4.2 Complete the OpenAPI types** for `TournamentBracketResponse` (`current_round`/`total_rounds`) and bracket standings. Remove `as Record<string, unknown>` and `as any[]` casts (`AdminTournamentDetailPage.vue:351,731-743`, `TournamentBracket.vue:135,155`).

## Week 5 — Bulk ops & polish

- [ ] 🟡 **W5.1 Parallelize `handleBulkStartMatches`** (`AdminTournamentDetailPage.vue:837-860`) with `Promise.allSettled`; surface per-match failures. Today one failure aborts silently mid-loop.
- [ ] 🟡 **W5.2 `useConfirmDialog` ergonomics.** Returns raw refs, forcing `.value` in templates. Return a reactive state object or `toRefs(state)`.
- [ ] 🟢 **W5.3 Generic `<SearchAutocomplete<T>>`.** `UserSearchAutocomplete` + `LeagueSearchAutocomplete` share ~80% of logic.
- [ ] 🟢 **W5.4 Remove remaining `as any` casts** in `useFileUpload.ts:122,214,223`, `VetoPanel.vue:138`, `AvailabilityCalendarOverlay.vue:202-204`, `AdminTournamentDetailPage.vue:1097`, `TournamentEditModal.vue:460,486`, `LeagueCreateModal.vue:306`, `TournamentCreateModal.vue:569`, `AdminGamesPage.vue:473-475`, `useEvidenceUpload.ts:35,66`, `AdminDashboardPage.vue:219`, `VetoMapGrid.vue:10`.

## Not scoped

- `useFileUpload`, the veto stack, `apiAction.ts` — already well-factored.
- Virtualization — fine at current scale; revisit if participant counts grow past a few hundred.

## Discovered during refactor

- ⚠️ **67 pre-existing `vue-tsc` errors on `master`.** `npm run build` runs `vue-tsc -b && vite build`, but the incremental cache can mask them locally. Most are OpenAPI ↔ store drift (e.g. `LeagueInvitationResponse.data`, `CreateStageRequest` missing from generated types, `matchCheckIn` body shape, `forfeitMatch` needing `registration_id`, `autoSeed` needing a body). Fixing requires `npm run generate:api` against a live backend + reconciling store code. Create a separate ticket; do not conflate with this refactor.

---

## Progress log

| Date | Item | Notes |
|------|------|-------|
| 2026-04-19 | Roadmap created | Baseline after full review |
| 2026-04-19 | W1.1 ✅ | ESLint 9 flat config + typescript-eslint + eslint-plugin-vue. `lint`, `lint:fix`, `typecheck` scripts added. 0 errors, 65 warnings (pre-existing `as any` backlog + unused `e` in catch blocks). Uncovered 67 pre-existing `vue-tsc` errors — see "Discovered during refactor". |
| 2026-04-19 | W1.2 ✅ | Added `aggregateActionStates` helper in `stores/helpers/apiAction.ts`. Replaced dead `loading = ref(false)` / `error = ref(null)` on 11 stores (auth, tournaments, evidence, availability, disputes, bans, matchScheduling, rbac, resultReviews, matchResults, players) with writable aggregates over per-action states. External mutation (`store.error = null`) still works via the aggregate's setter. All 26 auth tests pass; no new type errors. |
| 2026-04-19 | W1.3 ✅ | `LeagueDetailPage.vue`: replaced `window.confirm()` in `handleLeaveLeague` with `useConfirmDialog` + mounted `ConfirmDialog` component. Consistent UX with the rest of the app. |
| 2026-04-19 | W1.4 ✅ | `useSteamTracking.ts` + `usePlayerStats.ts` now use `unwrapApi` / `unwrapApiOptional`. Removed 5 `as any` casts (60 warnings remaining vs 65). |
| 2026-04-19 | W1.5 ✅ | Extracted `pollMatch()` in `useMatchDetail.ts` that only hits match-state endpoints (match, active proposal, current result, discovered demos, dispute). 15 s poll loop + visibility-regain now skip tournament-by-slug, registrations, my-teams, linked demos, evidence list, result review — roughly 4× less server traffic per tick. `fetchAll` is retained for initial load and route change. |
