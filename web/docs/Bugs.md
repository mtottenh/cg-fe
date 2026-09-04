# Live Buglist as of Sept 4th 2026

- [x] There is a League that does not show in the admin 'leagues' view on the live site (3 leagues, only 2 show on the leagues view, the league with id a69a47a2-a397-45c6-8863-fdfab8f917d6?season=46a6e742-7351-45fd-805b-a066c04c280e is missing
    - Fixed: the screen was built from `/v1/users/me/leagues`, which only returns leagues you are a *member* of and filtered out any league not `status = 'active'`. Added `GET /v1/admin/leagues` (all statuses, `admin.leagues.manage_any`) and pointed the page at it; memberships now carry `league_status`. The public `/v1/leagues` search parameter also works now — it was silently dropped.

- [x] Ability to 'delete' (soft delete, no longer visible in non-admin view) of the following (with appropriate cascading behavior), think about the verb here, maybe 'arhcive' is more appropriate:
    - [x] Leagues
    - [x] Teams
    - [x] Tournaments
    - [x] Seasons
    - Went with **archive**, as you suggested: `archived_at`/`archived_by` columns (migration 0096) rather than a status value, so a completed tournament or a disbanded team comes back as what it was. Cascade is *inherited*: a child of an archived league is hidden because its parent is, so restoring the league restores exactly what archiving it hid, while a child archived in its own right stays archived. Player-facing listings filter it out; operator listings opt in with a permission-gated `include_archived`. Archive/restore controls are on the admin leagues page, the seasons + teams panels, and the tournament actions menu.
- [x] Ability to 'restore' a soft deleted/archived team.
    - Restore exists for all four. Archived teams are reached with the "Show archived" switch on the league's Teams panel.
- [x] Ability to move a team between leagues
    - `POST /v1/league-teams/{id}/move` (platform admin). Takes a target league *and* season, because a team's roster and participation are season-scoped: in one transaction it changes league, registers for the target season and carries its roster across. Refused if the team has played, holds a tournament entry, the season is not in the target league, or the name/tag is taken there. UI: the move action on the league's Teams panel.
- [x] Ability to move a tournament between leagues and or seasons
    - `POST /v1/tournaments/{id}/move` (platform admin), including detaching it from every league. Refused once anyone has registered — an entry points at a team in its league's season and would be stranded. UI: "Move to league…" in the tournament actions menu.
- [x] Ability to rename a league/tournament/season
    - Already worked, verified end to end: the Name field is editable in the league edit modal, the season edit modal and the tournament edit form, and each sends `name` in its PATCH when it changed (`LeagueEditModal.vue:258`, `LeagueSeasonEditModal.vue:295`, `useTournamentForm.ts:391`). No change needed.
- [x] Don't show email on profile if signed up via steam (Just show steam name)
    - Fixed: Steam sign-up mints `steam_<id64>@steam.invalid`, which the profile printed under "Email". That row is now dropped for a placeholder address and a Steam row (persona name, linked to the Steam profile) shown instead. An account that linked Steam to a real address keeps both.
- [x] Demo pipeline looks broken ('trying to work with closed connection?').
    - Fixed: that string is `tungstenite::Error::AlreadyClosed` — a dead Steam websocket. cs2-enricher only treated `StreamClosed` as session death, so a socket that failed on *send* was recorded as a per-match GC failure and burned each match's retry budget in turn. `GcTransportError::is_session_fatal()` now decides who pays; the enricher reconnects instead. Matches already written off are recoverable with the new "Requeue stuck" control on the admin pipeline page (`POST /v1/admin/pipeline/discovered-matches/requeue`), plus a per-row Retry.

## Found by the second UX review (4 Sep 2026)

Functionality only; the copy, layout and IA findings live in the review itself (https://claude.ai/code/artifact/e133ad11-fc38-4dfb-963c-5a42cc6f69c5).

- [x] Every standard veto ends one action early: `is_complete_at` tests `action_number >= sequence.len()` against a one-based next action, so the trailing Decider never runs and the last map stays `available` with no game number (`portal-core/src/types/veto.rs:361`, called from `services/tournament/veto.rs:823`; auto-chain at `:369-406` never reached). On Bo1 this means no map is selected at all.
    - Fixed (api `ux-review-fixes`): `is_complete_at` now compares with `>`; unit test pins bo1/bo3/bo5 completing only after the decider. The decider auto-chain is shared with the timeout path so a timed-out sixth action still produces the decider.
- [x] A 2-1 Bo3 cannot be submitted: game 3 has no map id (consequence of the decider bug; the page only feeds `picked`/`decider` maps, `useMatchDetail.ts:186-190`) and `isValidSubmission` refuses any played game without one, with no message on why Submit is disabled (`ResultSubmissionPanel.vue:393-411`).
    - Fixed: the form now shows a map picker for any game the veto did not fix (so a decider slot can be filled even on old sessions), and when Submit is disabled it says which field is missing (`submitBlockedReason`, rendered beside the button). With the decider fix on the api side the third map arrives from the veto and no picker is needed.
- [x] A 2-0 Bo3 is rejected on submit: the form posts every game row including the unplayed 0-0 with an empty `map_id`, and the server answers "Game scores don't sum to series score" (`ResultSubmissionPanel.vue:436-446`, `services/tournament/result.rs:819`). A two-row payload is accepted.
    - Fixed: `handleSubmit` posts only the games with a score entered, so a 2-0 sends two rows and the server accepts it.
- [ ] The veto session is created, started and coin-flipped the moment the check-in window opens (15 min before kick-off), and the 30 s turn timeout then auto-bans before either captain has checked in (`portal-api/src/background/mod.rs:93, 494-510, 887-930`).
- [ ] No action item or notification exists for a veto turn; the action-item query's status filter omits `pick_ban` (`portal-db/src/repositories/action_item.rs:80`).
- [ ] On phones the navigation drawer opens over every page on load: the layout initialises `drawer = ref(true)` and the drawer is `temporary` below `md` (`PortalLayout.vue:46`, `PortalSidebar.vue:7-8`).
- [ ] League page defaults to the newest-created season (the draft one) instead of the current one: picks `status === 'active'` else `seasons[0]`, and the list is `ORDER BY created_at DESC` (`useLeagueDetail.ts:85-94`, `portal-db/src/adapters/league_team/season.rs:177`). `leagues.current_season_id` exists with a trigger (migrations 0025:325, 0026:406) but is not exposed on `LeagueResponse`.
- [ ] League page's Tournaments section ignores the selected season (fetched by `league_id` only, `useLeagueDetail.ts:127-136`) while Teams/Awards/Stats obey it; `GET /v1/tournaments?season_id=` already works.
- [ ] Draft seasons appear in the public season selector for non-admin players, with no status label.
- [ ] Creating a team on a draft season fails with "Tournament registration is closed": the season guard reuses `DomainError::RegistrationClosed` (`services/league_team/team.rs:160`), and the Create Team button is offered regardless of season status (`LeagueDetailPage.vue:224`).
- [ ] Tournament registration never checks roster size against `tournament.team_size`: a one-player team registers for a 5-player cup and is marked Approved (`services/tournament/registration.rs:439-467`; client check `useTournamentContext.ts:90-105` also ignores roster).
- [ ] Browse and detail routes (`/leagues`, `/leagues/:id`, `/tournaments`, `/tournaments/:slug`, `/players`) carry `requiresAuth` and bounce signed-out visitors to login, while every corresponding API read is public (`router/index.ts:40-72, 279-283`).
- [ ] Map Veto Format on the tournament form is optional, clearable and has no default; a tournament created without one runs its matches with no veto at all, and the match stepper then shows Pick/Ban ticked as if it happened (`TournamentForm.vue:293-315`).
- [ ] The match status stepper changes shape mid-match: Pick/Ban only appears once a veto session exists, because it is keyed on `veto_required`, which only session creation sets (`MatchStatusTimeline.vue:108-110`).
- [ ] After a result is disputed, both captains are shown a fresh, blank Submit Match Result form above the dispute thread: `canSubmitResult` is true whenever the claim is no longer `pending` (`useMatchDetail.ts:136-140`).
- [ ] Every `v-textarea` that sets both `label` and `placeholder` paints them on top of each other (13 components, e.g. `ResultSubmissionPanel.vue:117-120` and the dispute dialog).
- [ ] Forfeit outcome is rendered as "Forfeited by registration <uuid>" on the match timeline for both players instead of the team name.
- [ ] Admin dispute queue and detail modal show raw UUIDs for Match, Raised By, Original Winner and Result Claim, with no team names, tournament, or link to the match; the dispute DTO carries ids only (`AdminDisputesPage.vue:77-78, 192-196`, `DisputeDetailModal.vue:61-73`, `dto/responses/dispute.rs:19-45`).
- [ ] Starting a tournament manually leaves `starts_at` null, so cards read "Live Now" and "Start date TBD" at once (`TournamentCard.vue:62-68`); the admin tournament header and table also never show which league or season a tournament belongs to.
- [ ] Season dates (`registration_start/end`, `season_start/end`) exist in the schema and the DTO but nothing sets or displays them: the admin seasons panel shows "-" under Registration and the public page has no dates (migration 0025:34-37, `dto/responses/league_team.rs:32-38`).
