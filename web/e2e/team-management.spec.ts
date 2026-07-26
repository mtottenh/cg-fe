import { test, expect, type Locator, type Page } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import { uniqueId } from './fixtures/test-data'
import { invitePlayer } from './fixtures/team-member.fixture'
import {
  advanceSeason,
  createLeagueSeasonScenario,
  createSeason,
  setRosterLock,
  type CreatedSeason,
  type LeagueSeasonScenario,
} from './fixtures/league-season-extra.fixture'
import {
  createTeamWithMembers,
  getTeamMembers,
  loginAsUser,
  registerAsRosterUser,
  type RosterUser,
  type TeamRosterScenario,
} from './fixtures/team-roster.fixture'
import { createInvitationScenario } from './fixtures/team-management-extra.fixture'

/**
 * League-Based Team Management E2E Tests
 *
 * Teams are created and managed within league contexts.
 * Flow: Browse Leagues -> Select League -> Select Season -> Create/Join Teams
 *
 * Ground rules (COVERAGE-PLAN.md §3):
 *   - preconditions are BUILT through the API, never guarded on
 *   - the action under test is always driven through the UI
 *   - every mutation is asserted twice: once on the UI, once on the backend
 *
 * There are deliberately NO `isVisible().catch(() => false)` guards in this
 * file. If an element this spec reaches for is missing, the frontend is
 * broken and the test MUST fail.
 *
 * Roster mutations (promote / demote / remove / transfer ownership) live in
 * `team-roster.spec.ts`, which already drives them unguarded — they are not
 * duplicated here.
 */

/**
 * Several tests build their own league + season + team + players inside the
 * test body (state they mutate must not be shared with a sibling test running
 * in the same worker). That is ~10 API round-trips before the first click, so
 * the default 30s budget is too tight.
 */
test.describe.configure({ timeout: 60_000 })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface ApiEnvelope<T> {
  data: T
}

async function apiGet<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const resp = await fetch(`${API_URL}${path}`, { headers })
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`GET ${path} failed (${resp.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

interface SeasonTeamRow {
  team_id: string
  team_season_id: string
  team_name: string
  team_tag: string
  active_member_count: number
}

/** `GET /v1/league-seasons/{season_id}/teams` — public season roster listing. */
async function listSeasonTeams(seasonId: string): Promise<SeasonTeamRow[]> {
  const body = await apiGet<ApiEnvelope<SeasonTeamRow[]>>(
    `/v1/league-seasons/${seasonId}/teams?per_page=100`,
  )
  return body.data ?? []
}

interface TeamInvitationRow {
  id: string
  player_id: string
  role: string
  status: string
}

/**
 * `GET /v1/league-team-seasons/{team_season_id}/invitations` — captain/admin
 * only, and returns *pending* invitations only
 * (`find_pending_by_team_season`, portal-db/src/adapters/league_team/invitation.rs:122).
 */
async function listPendingInvitations(
  token: string,
  teamSeasonId: string,
): Promise<TeamInvitationRow[]> {
  const body = await apiGet<ApiEnvelope<TeamInvitationRow[]>>(
    `/v1/league-team-seasons/${teamSeasonId}/invitations`,
    token,
  )
  return body.data ?? []
}

interface TeamRecord {
  id: string
  name: string
  tag: string
  description: string | null
  status: string
  owner_player_id: string
  primary_color: string | null
  secondary_color: string | null
}

async function fetchTeamRecord(teamId: string): Promise<TeamRecord> {
  const body = await apiGet<ApiEnvelope<TeamRecord>>(`/v1/league-teams/${teamId}`)
  return body.data
}

/** Resolve the acting user's player id (league-team APIs are player-scoped). */
async function getMyPlayerId(token: string): Promise<string> {
  const body = await apiGet<ApiEnvelope<{ id: string }>>('/v1/players/me', token)
  return body.data.id
}

/** A Vuetify `v-btn` renders as `<a>` when it carries `:to`, so match on class. */
function vBtn(scope: Page | Locator, label: string) {
  return scope.locator('.v-btn').filter({ hasText: label })
}

/**
 * The edit form's card title (TeamEditPage.vue:35-38). Pinned to `.v-card-title`
 * because plain text matching is substring + case-insensitive, so
 * `getByText('Edit Team Settings')` ALSO matches the non-owner alert "Only the
 * team owner can edit team settings" — which silently turned a
 * "form is absent for non-owners" assertion into one that could never hold
 * (see team-roster.spec.ts:188).
 */
function editSettingsTitle(scope: Page | Locator) {
  return scope.locator('.v-card-title').filter({ hasText: 'Edit Team Settings' })
}

test.describe('League Team Management Flows', () => {
  test.describe('Browse Teams via Leagues', () => {
    let scenario: LeagueSeasonScenario
    let roster: TeamRosterScenario

    test.beforeAll(async () => {
      const adminToken = await getAdminToken()
      scenario = await createLeagueSeasonScenario(adminToken)
      // Register a team into the season so the browse flows always have a real
      // team card to read and click.
      roster = await createTeamWithMembers({
        leagueId: scenario.leagueId,
        seasonId: scenario.seasonId,
        memberCount: 1,
        teamNamePrefix: 'Browse Teams Team',
      })
    })

    test('should display leagues list page', async ({ page }) => {
      await page.goto('/leagues')
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { name: /Leagues/i })).toBeVisible()

      // MUST show league cards (links to league detail pages)
      const leagueLinks = page.locator('a[href^="/leagues/"]')
      await expect(leagueLinks.first()).toBeVisible()
    })

    test('should display league detail with season selector', async ({ page }) => {
      // The public leagues list is paginated server-side, so a fresh league is
      // not guaranteed to be on page 1 — navigate to the detail page by id.
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      await expect(
        page.locator('.v-card-title').filter({ hasText: scenario.leagueName })
      ).toBeVisible()

      // The season selector MUST be visible and MUST have our season selected
      // (LeagueDetailPage auto-selects the first season when none is active).
      const seasonSelect = page.locator('.v-select').filter({ hasText: /Season/i })
      await expect(seasonSelect).toBeVisible()
      await expect(seasonSelect).toContainText(scenario.seasonName)
    })

    test('should list the teams registered for the selected season', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      // The fixture registered exactly one team into this season, so the teams
      // grid MUST render its card — name, tag and member-count chip
      // (LeagueDetailPage.vue:249-269).
      const teamCard = page.locator('.v-card').filter({ hasText: roster.teamName }).first()
      await expect(teamCard).toBeVisible({ timeout: 10_000 })
      await expect(teamCard.getByText(`[${roster.teamTag}]`)).toBeVisible()
      // Owner + one invited member.
      await expect(teamCard.getByText('2 members')).toBeVisible()

      // Backend cross-check: the same roster size the card claims.
      const members = await getTeamMembers(roster.teamSeasonId, roster.owner.token)
      expect(members.filter((m) => m.status.toLowerCase() === 'active')).toHaveLength(2)
    })

    test('should open the team roster modal from a league team card', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      const teamCard = page.locator('.v-card').filter({ hasText: roster.teamName }).first()
      await expect(teamCard).toBeVisible({ timeout: 10_000 })
      await teamCard.click()

      // `viewTeam()` opens the detail dialog and fetches the roster
      // (LeagueDetailPage.vue:605-608, dialog markup at :390-445).
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()
      await expect(modal.getByText('Roster (2 members)')).toBeVisible()

      // Every member the API reports MUST be listed in the modal.
      const [invited] = roster.members
      await expect(modal.getByText(roster.owner.displayName)).toBeVisible({ timeout: 10_000 })
      await expect(modal.getByText(invited.displayName)).toBeVisible()
    })
  })

  test.describe('Create Team within League', () => {
    let scenario: LeagueSeasonScenario

    test.beforeAll(async () => {
      // The admin creates the league, which makes them a league member
      // (LeagueService::create_league adds the founder as an Admin member), and
      // they have no team in the fresh season — the two conditions the
      // "Create Team" CTA is gated on (LeagueDetailPage.vue:172).
      const adminToken = await getAdminToken()
      scenario = await createLeagueSeasonScenario(adminToken)
    })

    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
    })

    test('should show the create team CTA to a league member without a team', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      await expect(
        page.locator('.v-card-title').filter({ hasText: scenario.leagueName })
      ).toBeVisible()

      // Rendered twice while the season is empty: the toolbar button and the
      // empty-state CTA (LeagueDetailPage.vue:171-178 and :281-289).
      await expect(page.getByRole('button', { name: 'Create Team' }).first()).toBeVisible()
    })

    test('should open create team modal', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      await page.getByRole('button', { name: 'Create Team' }).first().click()

      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()
      await expect(modal.getByLabel('Team Name')).toBeVisible()
      await expect(modal.getByLabel('Team Tag')).toBeVisible()
    })

    test('should keep submit disabled until name and tag are valid', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      await page.getByRole('button', { name: 'Create Team' }).first().click()
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()

      const submit = modal.getByRole('button', { name: 'Create Team' })
      await expect(submit).toBeDisabled()

      // Name alone is not enough — the tag is required too.
      await modal.getByLabel('Team Name').fill(`E2E Validation Team ${uniqueId()}`)
      await expect(submit).toBeDisabled()

      await modal.getByLabel('Team Tag').fill(uniqueId().substring(0, 4).toUpperCase())
      await expect(submit).toBeEnabled()
    })

    /**
     * COVERAGE-PLAN **P-41**. This test used to be
     * "should reject a team name shorter than three characters", pinning
     * `rules.minLength(3)` on this form — a bound the BACKEND does not have.
     * `CreateLeagueTeamRequest` (api/crates/portal-api/src/dto/requests/
     * league_team.rs:247-275) is `length(min = 2, max = 50)` for the name and
     * `length(min = 2, max = 5)` for the tag, and the admin modal used a third
     * set of numbers again (2..100 / 2..8).
     *
     * Ground rule 9: the assertion changed because the test was pinning a bug —
     * a client rule stricter than the server's, which refused input the product
     * accepts. The rejection half is NOT relaxed away, it is retargeted at the
     * real minimum below, and the two tests after it pin the maxima that this
     * form used to let through into a guaranteed 400.
     */
    test('should accept a two-character team name — the backend minimum', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      await page.getByRole('button', { name: 'Create Team' }).first().click()
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()

      await modal.getByLabel('Team Name').fill('AB')
      await modal.getByLabel('Team Tag').fill(uniqueId().substring(0, 4).toUpperCase())

      await expect(modal.getByText('Must be at least 2 characters')).toHaveCount(0)
      await expect(modal.getByText('Must be at least 3 characters')).toHaveCount(0)
      await expect(modal.getByRole('button', { name: 'Create Team' })).toBeEnabled()
    })

    test('should reject a one-character team name', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      await page.getByRole('button', { name: 'Create Team' }).first().click()
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()

      await modal.getByLabel('Team Name').fill('A')
      await modal.getByLabel('Team Tag').fill(uniqueId().substring(0, 4).toUpperCase())

      await expect(modal.getByText('Must be at least 2 characters')).toBeVisible()
      await expect(modal.getByRole('button', { name: 'Create Team' })).toBeDisabled()
    })

    test('should reject a team tag longer than the backend maximum', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      await page.getByRole('button', { name: 'Create Team' }).first().click()
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Six characters. The backend caps the tag at five, so this form used to
      // enable Create and then take a 400 on submit.
      await modal.getByLabel('Team Name').fill(`E2E Tag Bound ${uniqueId()}`)
      await modal.getByLabel('Team Tag').fill('ABCDEF')

      await expect(modal.getByText('Must be at most 5 characters')).toBeVisible()
      await expect(modal.getByRole('button', { name: 'Create Team' })).toBeDisabled()

      // Five is the boundary and must still be accepted.
      await modal.getByLabel('Team Tag').fill('ABCDE')
      await expect(modal.getByText('Must be at most 5 characters')).toHaveCount(0)
      await expect(modal.getByRole('button', { name: 'Create Team' })).toBeEnabled()
    })

    test('should create a team that appears in the season list and on the roster', async ({
      page,
    }) => {
      // Own state: a player may only be the primary member of ONE team per
      // season (LeagueTeamService::create_team, team.rs:136-145), so this test
      // builds its own league + season rather than sharing the describe's.
      const adminToken = await getAdminToken()
      const own = await createLeagueSeasonScenario(adminToken)
      const adminPlayerId = await getMyPlayerId(adminToken)

      const suffix = uniqueId()
      const teamName = `E2E Create Team ${suffix}`
      const teamTag = suffix.substring(0, 4).toUpperCase()

      await page.goto(`/leagues/${own.leagueId}`)
      await page.waitForLoadState('networkidle')

      await page.getByRole('button', { name: 'Create Team' }).first().click()
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()

      await modal.getByLabel('Team Name').fill(teamName)
      await modal.getByLabel('Team Tag').fill(teamTag)
      await modal.getByLabel('Description').fill('Team created by the E2E create-team flow')

      const submit = modal.getByRole('button', { name: 'Create Team' })
      await expect(submit).toBeEnabled()
      await submit.click()

      // UI assertion 1: the dialog closes and the new team renders as a card in
      // the season's teams grid.
      await expect(modal).toBeHidden()
      const teamCard = page.locator('.v-card').filter({ hasText: teamName }).first()
      await expect(teamCard).toBeVisible({ timeout: 10_000 })
      await expect(teamCard.getByText(`[${teamTag}]`)).toBeVisible()
      await expect(teamCard.getByText('1 members')).toBeVisible()

      // UI assertion 2: the CTA is replaced by the "you already have a team"
      // chip (LeagueDetailPage.vue:179-182).
      await expect(page.getByText('You have a team in this season')).toBeVisible()

      // Backend assertion: the team exists in the season and the creator is on
      // its roster as captain.
      const seasonTeams = await listSeasonTeams(own.seasonId)
      const created = seasonTeams.find((t) => t.team_name === teamName)
      expect(created, 'created team should be registered in the season').toBeDefined()
      expect(created!.team_tag).toBe(teamTag)

      const members = await getTeamMembers(created!.team_season_id, adminToken)
      const captainRow = members.find((m) => m.player_id === adminPlayerId)
      expect(captainRow, 'creator should be on the roster').toBeDefined()
      expect(captainRow!.role.toLowerCase()).toBe('captain')
      expect(captainRow!.status.toLowerCase()).toBe('active')

      const record = await fetchTeamRecord(created!.team_id)
      expect(record.description).toBe('Team created by the E2E create-team flow')
    })

    /**
     * COVERAGE-PLAN §7 Tier 1 — `LeagueTeamCreateModal.save`. This is a
     * DIFFERENT component from the create-team dialog on the public league page
     * driven above: `components/admin/LeagueTeamCreateModal.vue` is mounted only
     * by `components/admin/LeagueDetailModal.vue:96`, reached from
     * /admin/leagues, and it is the only surface that can set a team's brand
     * colours. Nothing exercised it.
     */
    test('admin creates a team with branding from the league management modal', async ({
      page,
    }) => {
      // Own league + season: the creator becomes the team's captain, and a
      // player may only be the primary member of one team per season.
      const adminToken = await getAdminToken()
      const own = await createLeagueSeasonScenario(adminToken)
      const adminPlayerId = await getMyPlayerId(adminToken)

      const suffix = uniqueId()
      const teamName = `E2E Admin Team ${suffix}`
      const teamTag = suffix.substring(0, 4).toUpperCase()
      const primaryColor = '#FF5500'
      const secondaryColor = '#001133'

      await page.goto('/admin/leagues')
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'Leagues' })).toBeVisible()

      // AdminLeaguesPage.vue:17-27 — search narrows the per-game expansion
      // panels, whose tables page at 10 rows (the admin owns ~50 leagues).
      await page.getByLabel('Search leagues...').fill(own.leagueName)
      const leagueRow = page.locator('tr').filter({ hasText: own.leagueName })
      await expect(leagueRow).toBeVisible({ timeout: 10_000 })
      await leagueRow.getByRole('button', { name: 'Manage seasons and teams' }).click()

      // LeagueDetailModal auto-selects the league's first season on open
      // (:185-196), then the Teams tab renders LeagueTeamsPanel.
      const detailModal = page.getByRole('dialog').filter({ hasText: own.leagueName })
      await expect(detailModal).toBeVisible()
      await detailModal.getByRole('tab', { name: /Teams/ }).click()
      await expect(detailModal.locator('.v-select').filter({ hasText: 'Season' })).toContainText(
        own.seasonName,
      )

      await detailModal.getByRole('button', { name: 'Create Team' }).click()

      const createModal = page.getByRole('dialog').filter({ hasText: 'Create New Team' })
      await expect(createModal).toBeVisible()

      // `:disabled="!formValid"` (LeagueTeamCreateModal.vue:112) — required
      // name/tag are empty on open.
      const submit = createModal.getByRole('button', { name: 'Create Team' })
      await expect(submit).toBeDisabled()

      await createModal.getByLabel('Team Name').fill(teamName)
      await createModal.getByLabel('Team Tag').fill(teamTag)
      await createModal.getByLabel('Description').fill('Created from the admin league modal')
      await createModal.getByLabel('Primary Color').fill(primaryColor)
      await createModal.getByLabel('Secondary Color').fill(secondaryColor)

      await expect(submit).toBeEnabled()
      await submit.click()

      // UI assertion 1: the create dialog closes and the parent modal raises
      // its snackbar (LeagueDetailModal.onTeamCreated, :246-250).
      await expect(createModal).toBeHidden()
      await expect(page.locator('.v-snackbar').getByText('Team created successfully')).toBeVisible()

      // UI assertion 2: `onTeamCreated` refetches, so the new team must appear
      // in the panel's table with its tag and a 1-member roster.
      const teamRow = detailModal.locator('tr').filter({ hasText: teamName })
      await expect(teamRow).toBeVisible({ timeout: 10_000 })
      await expect(teamRow.getByText(`[${teamTag}]`)).toBeVisible()

      // Backend assertions: registered in the season, admin seated as captain,
      // and the branding fields — which ONLY this modal can set — persisted.
      const seasonTeams = await listSeasonTeams(own.seasonId)
      const created = seasonTeams.find((t) => t.team_name === teamName)
      expect(created, 'created team should be registered in the season').toBeDefined()
      expect(created!.team_tag).toBe(teamTag)

      const members = await getTeamMembers(created!.team_season_id, adminToken)
      const captainRow = members.find((m) => m.player_id === adminPlayerId)
      expect(captainRow, 'creator should be on the roster').toBeDefined()
      expect(captainRow!.role.toLowerCase()).toBe('captain')

      const record = await fetchTeamRecord(created!.team_id)
      expect(record.description).toBe('Created from the admin league modal')
      expect(record.primary_color).toBe(primaryColor)
      expect(record.secondary_color).toBe(secondaryColor)
    })
  })

  test.describe('My Teams Page', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      await page.goto('/my-teams')

      await expect(page).toHaveURL(/\/login/)
    })

    test('should display my teams page when authenticated', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/my-teams')
      await page.waitForLoadState('networkidle')

      // The page renders both an h1 page header and a section h2 with the same
      // text — anchor on the h1 so strict mode doesn't reject the match.
      await expect(page.locator('h1').filter({ hasText: /My Teams/i })).toBeVisible()
    })

    test("should list the signed-in player's team with role, status and season", async ({
      page,
    }) => {
      const adminToken = await getAdminToken()
      const scenario = await createLeagueSeasonScenario(adminToken)
      const roster = await createTeamWithMembers({
        leagueId: scenario.leagueId,
        seasonId: scenario.seasonId,
        memberCount: 0,
        teamNamePrefix: 'My Teams Card',
      })

      await loginAsUser(page, {
        email: roster.owner.email,
        password: roster.owner.password,
      })
      await page.goto('/my-teams')
      await page.waitForLoadState('networkidle')

      // MyLeagueTeamsPage.vue:84-139 — one card per membership.
      const card = page.locator('.v-card').filter({ hasText: roster.teamName }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })
      await expect(card.getByText(`[${roster.teamTag}]`)).toBeVisible()
      // teamRoleMap/teamStatusMap labels (utils/statusMaps.ts:111, :128).
      await expect(card.locator('.v-chip').filter({ hasText: 'Captain' })).toBeVisible()
      await expect(card.locator('.v-chip').filter({ hasText: 'Active' })).toBeVisible()
      await expect(card.getByText(`Season: ${scenario.seasonName}`)).toBeVisible()

      // Backend cross-check: the membership the card is rendering.
      const members = await getTeamMembers(roster.teamSeasonId, roster.owner.token)
      const mine = members.find((m) => m.player_id === roster.owner.playerId)
      expect(mine, 'owner should be on their own roster').toBeDefined()
      expect(mine!.role.toLowerCase()).toBe('captain')
      expect(mine!.status.toLowerCase()).toBe('active')
    })

    test('should group teams under their league and link back to it', async ({ page }) => {
      const adminToken = await getAdminToken()
      const scenario = await createLeagueSeasonScenario(adminToken)
      const roster = await createTeamWithMembers({
        leagueId: scenario.leagueId,
        seasonId: scenario.seasonId,
        memberCount: 0,
        teamNamePrefix: 'My Teams Group',
      })

      await loginAsUser(page, {
        email: roster.owner.email,
        password: roster.owner.password,
      })
      await page.goto('/my-teams')
      await page.waitForLoadState('networkidle')

      // Teams are grouped by league with a "N team(s)" chip
      // (MyLeagueTeamsPage.vue:73-80).
      await expect(page.getByText(scenario.leagueName).first()).toBeVisible({ timeout: 10_000 })

      const card = page.locator('.v-card').filter({ hasText: roster.teamName }).first()
      await expect(card).toBeVisible()

      // "View League" navigates back to the league detail page (:120-127).
      await vBtn(card, 'View League').click()
      await expect(page).toHaveURL(new RegExp(`/leagues/${scenario.leagueId}`))
      await expect(
        page.locator('.v-card-title').filter({ hasText: scenario.leagueName })
      ).toBeVisible()
    })
  })

  test.describe('Team Detail Page', () => {
    let scenario: LeagueSeasonScenario
    let roster: TeamRosterScenario

    test.beforeAll(async () => {
      const adminToken = await getAdminToken()
      scenario = await createLeagueSeasonScenario(adminToken)
      roster = await createTeamWithMembers({
        leagueId: scenario.leagueId,
        seasonId: scenario.seasonId,
        memberCount: 2,
        teamNamePrefix: 'Team Detail',
      })
    })

    test('should show the team name, tag, description and status', async ({ page }) => {
      await page.goto(`/teams/${roster.teamId}?season=${roster.teamSeasonId}`)
      await page.waitForLoadState('networkidle')

      // TeamDetailPage.vue:25-26, :59-61, :69-71
      await expect(
        page.locator('.v-card-title').filter({ hasText: roster.teamName })
      ).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(`[${roster.teamTag}]`)).toBeVisible()

      const record = await fetchTeamRecord(roster.teamId)
      expect(record.description, 'fixture creates the team with a description').toBeTruthy()
      await expect(page.getByText(record.description!)).toBeVisible()
      // The status chip renders the raw backend status (TeamDetailPage.vue:69-71).
      await expect(page.locator('.v-chip').filter({ hasText: record.status })).toBeVisible()
    })

    test('should show every roster member with their role', async ({ page }) => {
      // Must be authenticated: the roster list is populated by
      // teamsStore.fetchMembers (TeamDetailPage.vue:348), and anonymously that
      // request fails, leaving `members` empty and the list unrendered — the
      // page still shows the team name/description from the public endpoint, so
      // the failure is silent. Same pattern as the role test below.
      await loginAsUser(page, {
        email: roster.owner.email,
        password: roster.owner.password,
      })
      await page.goto(`/teams/${roster.teamId}?season=${roster.teamSeasonId}`)
      await page.waitForLoadState('networkidle')

      // TeamDetailPage.vue:134-203 — the roster card carries a member count
      // chip and one list item per member.
      // Pin the card by its TITLE. `filter({ hasText: 'Roster' })` matches any
      // ancestor .v-card whose subtree contains the word, which resolved to the
      // wrong element (the members render fine — confirmed from the failure's
      // accessibility snapshot).
      const rosterCard = page
        .locator('.v-card')
        .filter({ has: page.locator('.v-card-title', { hasText: 'Roster' }) })
        .first()
      await expect(rosterCard).toBeVisible({ timeout: 10_000 })
      // Assert against the display names the API actually returns rather than the
      // fixture's local copies — the roster renders `member.display_name` from
      // the members endpoint (TeamDetailPage.vue:156), and the two can differ.
      const apiMembers = await getTeamMembers(roster.teamSeasonId, roster.owner.token)
      expect(apiMembers.length, 'fixture seeds a 3-person roster').toBe(3)
      for (const member of apiMembers) {
        await expect(rosterCard.getByText(member.display_name).first()).toBeVisible()
      }
      await expect(rosterCard.locator('.v-chip').filter({ hasText: 'captain' })).toHaveCount(1)
      await expect(rosterCard.locator('.v-chip').filter({ hasText: 'player' })).toHaveCount(2)

      // Backend cross-check: same three active members.
      const members = await getTeamMembers(roster.teamSeasonId, roster.owner.token)
      expect(members.filter((m) => m.status.toLowerCase() === 'active')).toHaveLength(3)
    })

    test('should show Edit Team to the captain and Leave Team to a regular member', async ({
      page,
    }) => {
      const [member] = roster.members

      // Captain: "Edit Team" (v-if isCaptain, TeamDetailPage.vue:29-37).
      await loginAsUser(page, {
        email: roster.owner.email,
        password: roster.owner.password,
      })
      await page.goto(`/teams/${roster.teamId}?season=${roster.teamSeasonId}`)
      await page.waitForLoadState('networkidle')
      await expect(vBtn(page, 'Edit Team')).toBeVisible({ timeout: 10_000 })
      await expect(vBtn(page, 'Leave Team')).toHaveCount(0)

      // Regular member: "Leave Team" instead (v-if isMember && !isCaptain, :38-46).
      await loginAsUser(page, { email: member.email, password: member.password })
      await page.goto(`/teams/${roster.teamId}?season=${roster.teamSeasonId}`)
      await page.waitForLoadState('networkidle')
      await expect(vBtn(page, 'Leave Team')).toBeVisible({ timeout: 10_000 })
      await expect(vBtn(page, 'Edit Team')).toHaveCount(0)
    })
  })

  test.describe('League Membership', () => {
    let scenario: LeagueSeasonScenario
    let roster: TeamRosterScenario

    test.beforeAll(async () => {
      const adminToken = await getAdminToken()
      scenario = await createLeagueSeasonScenario(adminToken)
      roster = await createTeamWithMembers({
        leagueId: scenario.leagueId,
        seasonId: scenario.seasonId,
        memberCount: 0,
        teamNamePrefix: 'League Membership Team',
      })
    })

    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
    })

    test('should show the teams section with the season team count', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      // LeagueDetailPage.vue:238-242 — "Teams" heading plus a count chip.
      const teamsHeading = page.getByRole('heading', { name: /^Teams/ })
      await expect(teamsHeading).toBeVisible({ timeout: 10_000 })
      await expect(teamsHeading.locator('.v-chip')).toHaveText('1')

      // The one registered team renders below it.
      await expect(
        page.locator('.v-card').filter({ hasText: roster.teamName }).first()
      ).toBeVisible()
    })

    test('should auto-select a season when opening the league', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      const seasonSelect = page.locator('.v-select').first()
      await expect(seasonSelect).toBeVisible()
      await expect(seasonSelect).toContainText(scenario.seasonName)
    })

    test('should switch between seasons and swap the team list', async ({ page }) => {
      // Own state: a second season with a different team, so switching has a
      // visible, falsifiable effect.
      const adminToken = await getAdminToken()
      const own = await createLeagueSeasonScenario(adminToken)
      const secondSeason: CreatedSeason = await createSeason(adminToken, own.leagueId)
      await advanceSeason(adminToken, secondSeason, 'registration')

      const teamA = await createTeamWithMembers({
        leagueId: own.leagueId,
        seasonId: own.seasonId,
        memberCount: 0,
        teamNamePrefix: 'Season One Team',
      })
      const teamB = await createTeamWithMembers({
        leagueId: own.leagueId,
        seasonId: secondSeason.seasonId,
        memberCount: 0,
        teamNamePrefix: 'Season Two Team',
      })

      await page.goto(`/leagues/${own.leagueId}`)
      await page.waitForLoadState('networkidle')

      const seasonSelect = page.locator('.v-select').first()
      await expect(seasonSelect).toBeVisible()

      // Select season one explicitly, then assert only its team is listed.
      await seasonSelect.click()
      await page.getByRole('option', { name: new RegExp(own.seasonName) }).click()
      await expect(
        page.locator('.v-card').filter({ hasText: teamA.teamName }).first()
      ).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('.v-card').filter({ hasText: teamB.teamName })).toHaveCount(0)

      // Switch to season two — the grid MUST swap.
      await seasonSelect.click()
      await page.getByRole('option', { name: new RegExp(secondSeason.seasonName) }).click()
      await expect(
        page.locator('.v-card').filter({ hasText: teamB.teamName }).first()
      ).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('.v-card').filter({ hasText: teamA.teamName })).toHaveCount(0)
    })

    test('should navigate to the team detail page via View Full Details', async ({ page }) => {
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      const teamCard = page.locator('.v-card').filter({ hasText: roster.teamName }).first()
      await expect(teamCard).toBeVisible({ timeout: 10_000 })
      await teamCard.click()

      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()

      // LeagueDetailPage.vue:437-442 — a `:to` v-btn, so it renders as <a>.
      await vBtn(modal, 'View Full Details').click()
      await expect(page).toHaveURL(new RegExp(`/teams/${roster.teamId}`))
      await expect(
        page.locator('.v-card-title').filter({ hasText: roster.teamName })
      ).toBeVisible({ timeout: 10_000 })
    })
  })

  test.describe('Team Settings', () => {
    /**
     * `TeamEditPage` only renders a usable form for the team OWNER
     * (`isOwner`, TeamEditPage.vue:243 + :281-284), so each test drives it as
     * the owner of a team it built itself. The page also installs
     * `useUnsavedChanges`, which puts a `window.confirm()` in front of in-app
     * navigation while the form is dirty — tests therefore never route away
     * from a dirty form.
     */
    async function buildOwnTeam(): Promise<{
      scenario: LeagueSeasonScenario
      roster: TeamRosterScenario
    }> {
      const adminToken = await getAdminToken()
      const scenario = await createLeagueSeasonScenario(adminToken)
      const roster = await createTeamWithMembers({
        leagueId: scenario.leagueId,
        seasonId: scenario.seasonId,
        memberCount: 0,
        teamNamePrefix: 'Team Settings',
      })
      return { scenario, roster }
    }

    test('should navigate to the edit page from team detail', async ({ page }) => {
      const { roster } = await buildOwnTeam()

      await loginAsUser(page, {
        email: roster.owner.email,
        password: roster.owner.password,
      })
      await page.goto(`/teams/${roster.teamId}?season=${roster.teamSeasonId}`)
      await page.waitForLoadState('networkidle')

      await vBtn(page, 'Edit Team').click()

      await expect(page).toHaveURL(new RegExp(`/teams/${roster.teamId}/edit`))
      await expect(editSettingsTitle(page)).toBeVisible({ timeout: 10_000 })
    })

    test('should display the edit form pre-filled with current values', async ({ page }) => {
      const { roster } = await buildOwnTeam()
      const record = await fetchTeamRecord(roster.teamId)

      await loginAsUser(page, {
        email: roster.owner.email,
        password: roster.owner.password,
      })
      await page.goto(`/teams/${roster.teamId}/edit`)
      await page.waitForLoadState('networkidle')

      await expect(editSettingsTitle(page)).toBeVisible({ timeout: 10_000 })
      await expect(page.getByLabel('Team Name')).toHaveValue(roster.teamName)
      await expect(page.getByLabel('Team Tag')).toHaveValue(roster.teamTag)
      await expect(page.getByLabel('Description')).toHaveValue(record.description ?? '')

      // Nothing changed yet, so saving is a no-op and MUST be disabled
      // (TeamEditPage.vue:141 `:disabled="!hasChanges"`).
      await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
    })

    test('should show a validation error when the team name is cleared', async ({ page }) => {
      const { roster } = await buildOwnTeam()

      await loginAsUser(page, {
        email: roster.owner.email,
        password: roster.owner.password,
      })
      await page.goto(`/teams/${roster.teamId}/edit`)
      await page.waitForLoadState('networkidle')

      const nameInput = page.getByLabel('Team Name')
      await expect(nameInput).toHaveValue(roster.teamName, { timeout: 10_000 })
      await nameInput.clear()

      // `rules.required` -> "Required" (useFormRules.ts:3-4); Vuetify validates
      // on input by default, so the message appears without submitting.
      await expect(page.getByText('Required', { exact: true })).toBeVisible()

      // Restore the original value so the form is clean and the unsaved-changes
      // guard does not block teardown navigation.
      await nameInput.fill(roster.teamName)
      await expect(page.getByText('Required', { exact: true })).toHaveCount(0)
    })

    test('should save team changes and persist them', async ({ page }) => {
      const { roster } = await buildOwnTeam()
      const newDescription = `Updated by E2E ${uniqueId()}`

      await loginAsUser(page, {
        email: roster.owner.email,
        password: roster.owner.password,
      })
      await page.goto(`/teams/${roster.teamId}/edit`)
      await page.waitForLoadState('networkidle')

      await expect(page.getByLabel('Team Name')).toHaveValue(roster.teamName, { timeout: 10_000 })
      await page.getByLabel('Description').fill(newDescription)

      const save = page.getByRole('button', { name: 'Save Changes' })
      await expect(save).toBeEnabled()
      await save.click()

      // UI assertion: the success snackbar (TeamEditPage.vue:209-211, :332).
      await expect(page.locator('.v-snackbar').getByText('Team settings saved')).toBeVisible()

      // Backend assertion: the update actually landed.
      await expect
        .poll(async () => (await fetchTeamRecord(roster.teamId)).description, {
          timeout: 10_000,
        })
        .toBe(newDescription)

      // And it survives a reload — the form is re-hydrated from the API.
      await page.reload()
      await page.waitForLoadState('networkidle')
      await expect(page.getByLabel('Description')).toHaveValue(newDescription, { timeout: 10_000 })
    })
  })
})

test.describe('Team Invitation Lifecycle', () => {
  /**
   * Seeded per test rather than per describe: invitations and roster
   * membership are exactly the state these tests mutate, and `fullyParallel`
   * lets two tests in the same worker share a `beforeAll` scenario.
   *
   * NOTE on the invite UI surfaces — there are now THREE, all driving
   * `leagueTeamsStore.invitePlayer`:
   *   - admin: `components/admin/LeagueTeamDetailModal.vue:325` mounts the
   *     shared `LeagueTeamInviteModal` (now `components/team/`), reached from
   *     /admin/teams and /admin/leagues.
   *   - captain, own team page: `pages/TeamDetailPage.vue` mounts the same
   *     modal from an "Invite Player" button on the Pending Invitations card.
   *     Added for COVERAGE-PLAN §9b P-12 — this surface did not exist before.
   *   - captain, another player's profile: `PlayerDetailPage.vue:53-62 / :294-312`
   *     ("Invite to Team"), a different component with its own dialog.
   * All three are covered below.
   */

  async function buildInviteFixture(): Promise<{
    leagueName: string
    seasonName: string
    team: TeamRosterScenario
    invitee: RosterUser
    seasonId: string
    leagueId: string
  }> {
    const adminToken = await getAdminToken()
    const scenario = await createInvitationScenario(adminToken)
    // `createInvitationScenario` does not surface the league/season names, and
    // the admin UI selects them by name — read them back from the public
    // lookups (`GET /v1/leagues/{id}`, `GET /v1/league-seasons/{id}`).
    const [league, season] = await Promise.all([
      apiGet<ApiEnvelope<{ name: string }>>(`/v1/leagues/${scenario.leagueId}`),
      apiGet<ApiEnvelope<{ name: string }>>(`/v1/league-seasons/${scenario.seasonId}`),
    ])
    return {
      leagueId: scenario.leagueId,
      seasonId: scenario.seasonId,
      leagueName: league.data.name,
      seasonName: season.data.name,
      team: scenario.team,
      invitee: scenario.player2,
    }
  }

  test('admin invites a player through the league team invite modal', async ({ page }) => {
    const fixture = await buildInviteFixture()

    await loginAsAdmin(page)
    await page.goto('/admin/teams')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'All Teams' })).toBeVisible()

    // AdminTeamsPage.vue:14-42 — league then season, both plain v-selects.
    // Only leagues where the admin's membership_type is owner/admin/moderator
    // are listed (:219-221); creating a league makes the founder an Admin
    // member (LeagueService::create_league).
    const leagueSelect = page.locator('.v-select').filter({ hasText: 'Select League' })
    await leagueSelect.click()
    const leagueOption = page.getByRole('option', { name: fixture.leagueName })
    await expect(leagueOption).toBeVisible({ timeout: 10_000 })
    await leagueOption.click()

    const seasonSelect = page.locator('.v-select').filter({ hasText: 'Select Season' })
    await seasonSelect.click()
    const seasonOption = page.getByRole('option', { name: fixture.seasonName })
    await expect(seasonOption).toBeVisible({ timeout: 10_000 })
    await seasonOption.click()

    // The team row -> LeagueTeamDetailModal (eye button, AdminTeamsPage.vue:119).
    const row = page.locator('tr').filter({ hasText: fixture.team.teamName })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.getByRole('button', { name: 'View team details' }).click()

    // Roster tab is the default; "Invite Player" opens LeagueTeamInviteModal
    // (LeagueTeamDetailModal.vue:62-71).
    //
    // COVERAGE-PLAN §9b P-11: this season's roster_lock_status is `open`, so
    // the lock chip must NOT render and the button must be ENABLED. The fix
    // for P-11 made those controls actually respond to the lock value, so an
    // over-strict mapping (e.g. treating a null/open value as locked) would
    // now dead-end the admin here rather than passing unnoticed.
    await expect(page.getByText('Roster Locked')).toHaveCount(0)
    await expect(page.getByText('Roster Soft-Locked')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Invite Player' })).toBeEnabled()
    await page.getByRole('button', { name: 'Invite Player' }).click()
    await expect(page.getByText('Invite Player to Team')).toBeVisible()

    // Player search is a prefix match on the normalised display name
    // (portal-db/src/adapters/user.rs:441), so search the full display name.
    // getByLabel('Search Player') also matches the autocomplete's
    // "Clear Search Player" icon button, so pin to the combobox input.
    const search = page.getByRole('combobox', { name: /Search Player/ })
    await search.click()
    await search.fill(fixture.invitee.displayName)
    const option = page.getByRole('option').filter({ hasText: fixture.invitee.displayName })
    await expect(option).toBeVisible({ timeout: 10_000 })
    await option.click()

    const send = page.getByRole('button', { name: 'Send Invitation' })
    await expect(send).toBeEnabled()
    await send.click()

    // UI assertion 1: the snackbar raised by `onPlayerInvited`
    // (LeagueTeamDetailModal.vue:523-528).
    await expect(page.locator('.v-snackbar').getByText('Invitation sent')).toBeVisible()

    // UI assertion 2: the invitation shows on the modal's Invitations tab,
    // whose "Player ID" column renders the raw id (:389-397).
    await page.getByRole('tab', { name: /Invitations/i }).click()
    await expect(page.getByText(fixture.invitee.playerId)).toBeVisible({ timeout: 10_000 })

    // Backend assertion.
    const pending = await listPendingInvitations(
      fixture.team.owner.token,
      fixture.team.teamSeasonId,
    )
    const invite = pending.find((i) => i.player_id === fixture.invitee.playerId)
    expect(invite, 'invitation should be pending on the backend').toBeDefined()
    expect(invite!.status.toLowerCase()).toBe('pending')
  })

  test('captain invites a player from their profile page', async ({ page }) => {
    const fixture = await buildInviteFixture()

    await loginAsUser(page, {
      email: fixture.team.owner.email,
      password: fixture.team.owner.password,
    })
    await page.goto(`/players/${fixture.invitee.playerId}`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: fixture.invitee.displayName })
    ).toBeVisible({ timeout: 10_000 })

    // PlayerDetailPage.vue:53-62 -> invite dialog at :113-183.
    await page.getByRole('button', { name: 'Invite to Team' }).click()

    const teamSelect = page.locator('.v-select').filter({ hasText: 'Select Team' })
    await expect(teamSelect).toBeVisible()
    await teamSelect.click()
    // Only teams where the actor's role is `captain` are offered (:255-257).
    await page.getByRole('option', { name: fixture.team.teamName }).click()

    const send = page.getByRole('button', { name: 'Send Invite' })
    await expect(send).toBeEnabled()
    await send.click()

    // UI assertion: PlayerDetailPage's own success snackbar (:305, :186-188).
    await expect(
      page.locator('.v-snackbar').getByText(`Invitation sent to ${fixture.invitee.displayName}!`)
    ).toBeVisible()

    // Backend assertion.
    const pending = await listPendingInvitations(
      fixture.team.owner.token,
      fixture.team.teamSeasonId,
    )
    const invite = pending.find((i) => i.player_id === fixture.invitee.playerId)
    expect(invite, 'captain invitation should be pending on the backend').toBeDefined()
    expect(invite!.status.toLowerCase()).toBe('pending')
  })

  /**
   * COVERAGE-PLAN §9b P-12. Before this surface existed, a captain who wanted
   * to invite someone had to already know who they were and open that player's
   * profile page — `LeagueTeamInviteModal` was mounted only from the admin
   * `LeagueTeamDetailModal`.
   */
  test('captain invites a player from their own team page', async ({ page }) => {
    const fixture = await buildInviteFixture()

    await loginAsUser(page, {
      email: fixture.team.owner.email,
      password: fixture.team.owner.password,
    })
    await page.goto(`/teams/${fixture.team.teamId}?season=${fixture.team.teamSeasonId}`)
    await page.waitForLoadState('networkidle')

    // The invite button lives on the captain-only Pending Invitations card
    // (TeamDetailPage.vue:77-101). Pin the card by its TITLE — `filter({ hasText })`
    // on `.v-card` matches any ancestor whose subtree contains the words.
    const invitationsCard = page
      .locator('.v-card')
      .filter({ has: page.locator('.v-card-title', { hasText: 'Pending Invitations' }) })
      .first()
    await expect(invitationsCard).toBeVisible({ timeout: 10_000 })
    await expect(invitationsCard.getByText('No pending invitations')).toBeVisible()

    await page.getByRole('button', { name: 'Invite Player' }).click()

    // Same shared modal the admin flow drives (components/team/LeagueTeamInviteModal.vue).
    await expect(page.getByText('Invite Player to Team')).toBeVisible()

    // Player search is a prefix match on the normalised display name
    // (portal-db/src/adapters/user.rs:441), so search the full display name.
    // getByLabel('Search Player') also matches the autocomplete's
    // "Clear Search Player" icon button, so pin to the combobox input.
    const search = page.getByRole('combobox', { name: /Search Player/ })
    await search.click()
    await search.fill(fixture.invitee.displayName)
    const option = page.getByRole('option').filter({ hasText: fixture.invitee.displayName })
    await expect(option).toBeVisible({ timeout: 10_000 })
    await option.click()

    const send = page.getByRole('button', { name: 'Send Invitation' })
    await expect(send).toBeEnabled()
    await send.click()

    // UI assertion 1: the page's success snackbar (TeamDetailPage `handlePlayerInvited`).
    await expect(page.locator('.v-snackbar').getByText('Invitation sent')).toBeVisible()

    // UI assertion 2: the invitation now renders in the captain's Pending
    // Invitations list, with the invited player's display name and a count
    // chip (TeamDetailPage.vue:86-135). The name only appears because
    // `handlePlayerInvited` refetches — the POST response does not hydrate it.
    await expect(invitationsCard.getByText(fixture.invitee.displayName)).toBeVisible({
      timeout: 10_000,
    })
    await expect(invitationsCard.getByText('No pending invitations')).toHaveCount(0)

    // Backend assertion.
    const pending = await listPendingInvitations(
      fixture.team.owner.token,
      fixture.team.teamSeasonId,
    )
    const invite = pending.find((i) => i.player_id === fixture.invitee.playerId)
    expect(invite, 'invitation should be pending on the backend').toBeDefined()
    expect(invite!.status.toLowerCase()).toBe('pending')
    expect(invite!.role.toLowerCase()).toBe('player')
  })

  /**
   * Drive the captain's invite modal on an `active` season and return the page
   * so the caller can assert on what happened. Shared by the two tests below so
   * the ONLY difference between them is the season's roster lock.
   */
  async function inviteFromCaptainPage(
    page: Page,
    fixture: Awaited<ReturnType<typeof buildInviteFixture>>,
  ) {
    await loginAsUser(page, {
      email: fixture.team.owner.email,
      password: fixture.team.owner.password,
    })
    await page.goto(`/teams/${fixture.team.teamId}?season=${fixture.team.teamSeasonId}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Invite Player' }).click()
    await expect(page.getByText('Invite Player to Team')).toBeVisible()

    const search = page.getByRole('combobox', { name: /Search Player/ })
    await search.click()
    await search.fill(fixture.invitee.displayName)
    const option = page.getByRole('option').filter({ hasText: fixture.invitee.displayName })
    await expect(option).toBeVisible({ timeout: 10_000 })
    await option.click()

    await page.getByRole('button', { name: 'Send Invitation' }).click()
  }

  /**
   * **Spec change (P-148 — the owner's ruling: "I think the roster lock should
   * really be an 'optional' thing/thing that is a per tournament decision,
   * (again, this is a casual league, so adding team members half way through
   * may be okay)").**
   *
   * This test used to be `invite is rejected in the UI once the season no
   * longer allows roster changes` and asserted the opposite: it advanced the
   * season to `active` and expected the invite to be REFUSED, because
   * `allows_primary_roster_changes()` ANDed the lock with
   * `SeasonStatus::allows_roster_changes()` (`draft | registration`). Season
   * phase was the outer gate and the lock only had a say before the
   * competition started.
   *
   * Under the ruling the phase no longer votes: `active` and `playoffs` defer
   * to `roster_lock_status`, whose default is `open`. So the same steps must
   * now SUCCEED, and the refusal case moves to the test below, which sets the
   * lock — the control that is now doing the work.
   *
   * (The old assertion was additionally pinned to a refusal string,
   * "roster is locked for primary member invitations", that stopped existing
   * when the enforcement point was unified — see api 297a19e.)
   */
  test('a casual league invites a player mid-season while the roster lock is open', async ({
    page,
  }) => {
    const adminToken = await getAdminToken()
    const fixture = await buildInviteFixture()

    // The team registers while the season is still in `registration`; advance
    // it afterwards so the only thing under test is the mid-season rule.
    await advanceSeason(
      adminToken,
      { seasonId: fixture.seasonId, status: 'registration' },
      'active',
    )

    await inviteFromCaptainPage(page, fixture)

    // UI assertion: the page's success snackbar, and the invitation renders in
    // the captain's Pending Invitations list.
    await expect(page.locator('.v-snackbar').getByText('Invitation sent')).toBeVisible({
      timeout: 10_000,
    })
    const invitationsCard = page
      .locator('.v-card')
      .filter({ has: page.locator('.v-card-title', { hasText: 'Pending Invitations' }) })
      .first()
    await expect(invitationsCard.getByText(fixture.invitee.displayName)).toBeVisible({
      timeout: 10_000,
    })

    // Backend assertion: the invitation really exists.
    const pending = await listPendingInvitations(
      fixture.team.owner.token,
      fixture.team.teamSeasonId,
    )
    expect(
      pending.find((i) => i.player_id === fixture.invitee.playerId),
      'an open lock must let a live season take an invitation',
    ).toBeDefined()
  })

  /**
   * COVERAGE-PLAN §9b P-11 asked for "a hard-locked season blocks the invite
   * path". That test could not be written when the plan was drafted (nothing
   * could set the lock — P-14) and, once it could, the lock still did nothing
   * on a live season (P-148). Both are fixed, so this is the test P-11 asked
   * for, driven through the UI: same season phase and same steps as the test
   * above, one field different.
   */
  test('a hard lock blocks the invite in the UI on the same live season', async ({ page }) => {
    const adminToken = await getAdminToken()
    const fixture = await buildInviteFixture()

    await advanceSeason(
      adminToken,
      { seasonId: fixture.seasonId, status: 'registration' },
      'active',
    )
    // The league opts into strictness — mid-season, which is when a league
    // actually decides its rosters are final.
    await setRosterLock(adminToken, fixture.seasonId, 'hard_lock')

    await inviteFromCaptainPage(page, fixture)

    // UI assertion: the modal shows the API's reason instead of closing.
    // `DomainError::InvalidState` -> 400 "Invalid state: {msg}"
    // (portal-api/src/error.rs:287); the modal renders `ApiError.detail`
    // (LeagueTeamInviteModal.vue error alert). The message names the LOCK,
    // because the lock is what refused.
    await expect(page.getByText(/roster is locked for primary member changes/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText('Invite Player to Team')).toBeVisible()
    await expect(page.locator('.v-snackbar').getByText('Invitation sent')).toHaveCount(0)

    // Backend assertion: nothing was created.
    const pending = await listPendingInvitations(
      fixture.team.owner.token,
      fixture.team.teamSeasonId,
    )
    expect(pending.find((i) => i.player_id === fixture.invitee.playerId)).toBeUndefined()
  })

  test('invited player accepts from the invitations page and joins the roster', async ({
    page,
  }) => {
    const fixture = await buildInviteFixture()

    // Seed the invitation via API — the action under test is the ACCEPT click.
    const invitation = await invitePlayer(
      fixture.team.owner.token,
      fixture.seasonId,
      fixture.team.teamSeasonId,
      fixture.invitee.playerId,
    )
    expect(invitation, 'captain should be able to invite the player').not.toBeNull()

    await loginAsUser(page, {
      email: fixture.invitee.email,
      password: fixture.invitee.password,
    })
    await page.goto('/invitations')
    await page.waitForLoadState('networkidle')

    // InvitationsPage.vue:98-167 — one card per pending team invitation.
    const card = page.locator('.v-card').filter({ hasText: fixture.team.teamName }).first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card.getByText(fixture.leagueName)).toBeVisible()

    await card.getByRole('button', { name: 'Accept' }).click()

    // UI assertion 1: the success snackbar from `handleAccept` (:261).
    await expect(page.locator('.v-snackbar').getByText('You have joined the team!')).toBeVisible()

    // UI assertion 2: the handler redirects to /my-teams after 1.5s (:263-266)
    // and the newly joined team renders there.
    await expect(page).toHaveURL(/\/my-teams/, { timeout: 10_000 })
    const teamCard = page.locator('.v-card').filter({ hasText: fixture.team.teamName }).first()
    await expect(teamCard).toBeVisible({ timeout: 10_000 })
    await expect(teamCard.locator('.v-chip').filter({ hasText: 'Player' })).toBeVisible()

    // Backend assertion: the invitee is now an active roster member, and the
    // invitation is no longer pending.
    const members = await getTeamMembers(fixture.team.teamSeasonId, fixture.team.owner.token)
    const joined = members.find((m) => m.player_id === fixture.invitee.playerId)
    expect(joined, 'invitee should be on the roster').toBeDefined()
    expect(joined!.status.toLowerCase()).toBe('active')

    const pending = await listPendingInvitations(
      fixture.team.owner.token,
      fixture.team.teamSeasonId,
    )
    expect(pending.find((i) => i.player_id === fixture.invitee.playerId)).toBeUndefined()
  })

  test('invited player declines from the invitations page', async ({ page }) => {
    const fixture = await buildInviteFixture()

    const invitation = await invitePlayer(
      fixture.team.owner.token,
      fixture.seasonId,
      fixture.team.teamSeasonId,
      fixture.invitee.playerId,
    )
    expect(invitation, 'captain should be able to invite the player').not.toBeNull()

    await loginAsUser(page, {
      email: fixture.invitee.email,
      password: fixture.invitee.password,
    })
    await page.goto('/invitations')
    await page.waitForLoadState('networkidle')

    const card = page.locator('.v-card').filter({ hasText: fixture.team.teamName }).first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.getByRole('button', { name: 'Decline' }).click()

    // `openDeclineDialog` routes through ConfirmDialog (InvitationsPage.vue:274-290).
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Decline Invitation?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Decline' }).click()

    // UI assertion 1: the success snackbar (:284).
    await expect(page.locator('.v-snackbar').getByText('Invitation declined')).toBeVisible()

    // UI assertion 2: the invitation card is gone and the empty state renders
    // (EmptyState title, InvitationsPage.vue:169-178).
    await expect(page.locator('.v-card').filter({ hasText: fixture.team.teamName })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'No Pending Invitations' })).toBeVisible()

    // Backend assertion: no pending invitation, and the player did NOT join.
    const pending = await listPendingInvitations(
      fixture.team.owner.token,
      fixture.team.teamSeasonId,
    )
    expect(pending.find((i) => i.player_id === fixture.invitee.playerId)).toBeUndefined()

    const members = await getTeamMembers(fixture.team.teamSeasonId, fixture.team.owner.token)
    expect(members.find((m) => m.player_id === fixture.invitee.playerId)).toBeUndefined()
  })

  test('a player with no invitations sees the empty state', async ({ page }) => {
    // A brand-new player is guaranteed to have zero invitations.
    const player = await registerAsRosterUser()

    await loginAsUser(page, { email: player.email, password: player.password })
    await page.goto('/invitations')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1').filter({ hasText: 'My Invitations' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No Pending Invitations' })).toBeVisible({
      timeout: 10_000,
    })

    // Backend cross-check: the page is not merely failing to render them.
    const mine = await apiGet<ApiEnvelope<unknown[]>>(
      '/v1/league-team-invitations/me',
      player.token,
    )
    expect(mine.data).toHaveLength(0)
  })
})
