# Live Buglist as of Sept 4th 2026

- [x] There is a League that does not show in the admin 'leagues' view on the live site (3 leagues, only 2 show on the leagues view, the league with id a69a47a2-a397-45c6-8863-fdfab8f917d6?season=46a6e742-7351-45fd-805b-a066c04c280e is missing
    - Fixed: the screen was built from `/v1/users/me/leagues`, which only returns leagues you are a *member* of and filtered out any league not `status = 'active'`. Added `GET /v1/admin/leagues` (all statuses, `admin.leagues.manage_any`) and pointed the page at it; memberships now carry `league_status`. The public `/v1/leagues` search parameter also works now — it was silently dropped.

- [] Ability to 'delete' (soft delete, no longer visible in non-admin view) of the following (with appropriate cascading behavior), think about the verb here, maybe 'arhcive' is more appropriate:
    - [] Leagues
    - [] Teams
    - [] Tournaments
    - [] Seasons
- [] Ability to 'restore' a soft deleted/archived team.
- [] Ability to move a team between leagues
- [] Ability to move a tournament between leagues and or seasons
- [] Ability to rename a league/tournament/season
- [] Don't show email on profile if signed up via steam (Just show steam name)
- [] Demo pipeline looks broken ('trying to work with closed connection?').
