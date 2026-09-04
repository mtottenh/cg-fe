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
