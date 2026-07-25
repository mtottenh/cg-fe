import { test, expect, type Page } from '@playwright/test'
import type { components } from '@/api/types'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { uniqueEmail, uniqueId, uniqueUsername } from './fixtures/test-data'

/**
 * Admin modal SAVE paths — COVERAGE-PLAN §4-F, "Admin — tournament & league →
 * Modal saves".
 *
 * Every modal driven here already *rendered* in some existing test; none of
 * them was ever submitted. `admin-management.spec.ts` is the clearest case:
 * five of its ban tests open `BanCreateModal` and cancel, and its season tests
 * open `LeagueSeasonEditModal` — but `LeagueCreateModal.save`,
 * `LeagueEditModal.save`, `LeagueSeasonCreateModal.save`,
 * `InviteUserModal.sendInvitation` and the whole of `BanDetailModal` had zero
 * executions. Opening a modal proves the button is wired to a `ref`; it proves
 * nothing about the handler behind the primary action.
 *
 * Deliberately NOT duplicated from `admin-management.spec.ts` (which owns
 * them): ban create-through-the-modal, ban lift from the TABLE row, season
 * status + roster-lock option lists. The ban test below drives the OTHER lift
 * surface — `BanDetailModal`'s in-modal lift form, which is the only one that
 * can send a `lift_reason` — and asserts the detail rendering the table row
 * cannot show.
 *
 * Ground rules: seeded over the API, acted through the UI, asserted on the UI
 * and re-read from the backend.
 */

test.describe.configure({ timeout: 120_000 })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

type Schemas = components['schemas']

/** Wire shapes come from the generated client, so a DTO change breaks this spec. */
type LeagueRecord = Schemas['LeagueResponse']
type SeasonRecord = Schemas['LeagueSeasonResponse']
type InvitationRecord = Schemas['LeagueInvitationResponse']
type BanRecord = Schemas['BanResponse']
type GameRecord = Schemas['GameSummaryResponse']

interface ApiEnvelope<T> {
  data: T
}

async function jsonOrThrow<T>(resp: Response, context: string): Promise<T> {
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${context} failed (${resp.status}): ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

/**
 * `LeagueResponse.access_type` is a bare `string` in the generated client —
 * the backend never declared the enum (the P-31 remnant batch, §4-G), so
 * unlike a status there is no union to import from `fixtures/api-status.ts`.
 * This local union is the spec's own guard, not a generated one.
 */
type LeagueAccessType = 'open' | 'application' | 'invite_only'

interface SeededLeague {
  leagueId: string
  leagueName: string
  leagueSlug: string
}

/**
 * GET /v1/games — spec-local rather than imported from `awards.fixture.ts`,
 * which another lane owns. The create modal filters its Game select to
 * `status === 'active'` (LeagueCreateModal.vue:241-243), so the option this
 * test clicks must come from the same filtered set.
 */
async function getActiveCs2Game(): Promise<GameRecord> {
  const resp = await fetch(`${API_URL}/v1/games`)
  const body = await jsonOrThrow<ApiEnvelope<GameRecord[]>>(resp, 'GET /v1/games')
  const active = (body.data ?? []).filter((g) => g.status === 'active')
  const cs2 = active.find((g) => g.slug.toLowerCase() === 'cs2')
  if (!cs2) throw new Error(`No active CS2 game; active games: ${active.map((g) => g.slug).join(', ')}`)
  return cs2
}

/**
 * `createLeague` in `league-season-extra.fixture.ts` hard-codes
 * `access_type: 'open'` (:87), and the invite test needs `invite_only`, so the
 * parameterised builder is spec-local — same precedent as
 * `league-join.spec.ts:66`.
 */
async function seedLeague(
  adminToken: string,
  accessType: LeagueAccessType,
  namePrefix: string,
): Promise<SeededLeague> {
  const suffix = uniqueId()
  const leagueName = `${namePrefix} ${suffix}`
  const leagueSlug = `e2e-modal-saves-${suffix}`
  const gameId = (await getActiveCs2Game()).id

  const resp = await fetch(`${API_URL}/v1/leagues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: leagueName,
      slug: leagueSlug,
      game_id: gameId,
      description: `Seeded precondition for the admin modal-save specs (${suffix})`,
      access_type: accessType,
    }),
  })
  const body = await jsonOrThrow<ApiEnvelope<LeagueRecord>>(resp, `Create ${accessType} league`)
  return { leagueId: body.data.id, leagueName, leagueSlug }
}

/** GET /v1/leagues/{league_id} — backend handler `leagues::get_league`. */
async function getLeague(adminToken: string, leagueId: string): Promise<LeagueRecord> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiEnvelope<LeagueRecord>>(resp, `GET /v1/leagues/${leagueId}`)
  return body.data
}

/** GET /v1/league-seasons?league_id=… — backend handler `league_teams::list_seasons`. */
async function listSeasons(adminToken: string, leagueId: string): Promise<SeasonRecord[]> {
  const resp = await fetch(`${API_URL}/v1/league-seasons?league_id=${leagueId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiEnvelope<SeasonRecord[]>>(resp, 'GET /v1/league-seasons')
  return body.data
}

/**
 * GET /v1/leagues/{league_id}/invitations — the endpoint returns a bare array,
 * not a `DataResponse` envelope (mirrored by `leagues.ts:227-236`).
 * `?status=all` is the P-39 filter: the default is pending-only.
 */
async function listInvitations(adminToken: string, leagueId: string): Promise<InvitationRecord[]> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/invitations?status=all`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return jsonOrThrow<InvitationRecord[]>(resp, 'GET /v1/leagues/{id}/invitations')
}

interface RegisteredUser {
  userId: string
  displayName: string
}

/** Register a throwaway account and return its user id. */
async function registerUser(namePrefix: string): Promise<RegisteredUser> {
  const displayName = `${namePrefix}${uniqueId()}`
  const resp = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: uniqueUsername(),
      email: uniqueEmail(),
      password: 'TestPassword123!',
      display_name: displayName,
    }),
  })
  const body = await jsonOrThrow<{ data: { user: { id: string } } }>(resp, 'Register user')
  return { userId: body.data.user.id, displayName }
}

/** POST /v1/admin/bans — seeds the precondition for the detail/lift test. */
async function seedBan(adminToken: string, userId: string, reason: string): Promise<BanRecord> {
  const resp = await fetch(`${API_URL}/v1/admin/bans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ user_id: userId, ban_type: 'chat', reason }),
  })
  const body = await jsonOrThrow<ApiEnvelope<BanRecord>>(resp, 'POST /v1/admin/bans')
  return body.data
}

/** GET /v1/admin/bans/{id} — the same read `BanDetailModal` performs. */
async function getBan(adminToken: string, banId: string): Promise<BanRecord> {
  const resp = await fetch(`${API_URL}/v1/admin/bans/${banId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiEnvelope<BanRecord>>(resp, `GET /v1/admin/bans/${banId}`)
  return body.data
}

/**
 * Open /admin/leagues and reveal one league's row.
 *
 * The page groups leagues into per-game expansion panels and expands them all
 * once the fetch settles (`AdminLeaguesPage.vue:316`), so the row is reachable
 * without touching the panel; searching is what makes it unambiguous, since
 * the admin owns dozens of leagues and each panel's table pages at 10 rows
 * (:88).
 */
async function openLeagueRow(page: Page, leagueName: string) {
  await page.goto('/admin/leagues')
  // `exact: true` because Playwright's accessible-name matching is SUBSTRING
  // based (§2): without it this also matched the "No Leagues Found" empty-state
  // heading, and the page renders that for a moment while the list loads. The
  // result was a strict-mode violation that only appeared under full-suite
  // load — green in isolation, red in CI, which is the worst failure shape.
  await expect(page.getByRole('heading', { name: 'Leagues', exact: true })).toBeVisible()
  await page.getByLabel('Search leagues...').fill(leagueName)
  const row = page.locator('tr').filter({ hasText: leagueName })
  await expect(row).toBeVisible({ timeout: 20_000 })
  return row
}

test.describe('Admin modal saves', () => {
  test('admin creates an invite-only league with entry requirements via LeagueCreateModal', async ({
    page,
  }) => {
    // Drives LeagueCreateModal.save (src/components/admin/LeagueCreateModal.vue:283-312)
    // → leaguesStore.createLeague → POST /v1/leagues, and
    // AdminLeaguesPage.onLeagueCreated (:338-341).
    //
    // Access type and the entry-requirement panel are both exercised on their
    // NON-default values: `access_type` defaults to 'open' (:231) and the
    // eligibility fields default to null (:232-235), so a test that left them
    // alone would pass with `buildEligibilitySettings` returning `{}` and
    // `settings` dropped from the body entirely (:293).
    const adminToken = await getAdminToken()
    const game = await getActiveCs2Game()

    const suffix = uniqueId()
    const leagueName = `E2E Modal Create League ${suffix}`
    // `generateSlug` (:248-257) lowercases, strips punctuation and hyphenates.
    const expectedSlug = `e2e-modal-create-league-${suffix}`
    const description = `Created through LeagueCreateModal by the e2e suite (${suffix})`

    await loginAsAdmin(page)
    await page.goto('/admin/leagues')
    await expect(page.getByRole('heading', { name: 'Leagues', exact: true })).toBeVisible()

    // Two "Create League" buttons exist in the template — the header (:5-11)
    // and the empty-state card (:56-58) — and only one renders at a time.
    await page.getByRole('button', { name: 'Create League' }).first().click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Create New League' })
    await expect(dialog).toBeVisible()

    // Game select is filtered to `status === 'active'` games (:241-243).
    // `getByLabel` does not resolve a Vuetify `v-select` (its label is not
    // `for`-associated with the readonly input), so selects are addressed by
    // class + label text — the same shape as `admin-management.spec.ts:372`.
    await dialog.locator('.v-select').filter({ hasText: 'Game' }).click()
    await page.getByRole('option', { name: game.display_name, exact: true }).click()

    await dialog.getByLabel('League Name').fill(leagueName)
    // The slug is derived from the name as it is typed; assert it rather than
    // overwriting it, because the derivation is part of what save sends.
    await expect(dialog.getByLabel('URL Slug')).toHaveValue(expectedSlug)

    await dialog.getByLabel('Description (Optional)').fill(description)

    // Access-type options render the access type's description as a subtitle
    // (:98-102), so the accessible name is "Invite Only Members can only join
    // via invitation" — matched on the label substring, not exactly.
    await dialog.locator('.v-select').filter({ hasText: 'Access Type' }).click()
    await page.getByRole('option', { name: 'Invite Only' }).click()

    // Entry requirements live behind a collapsed expansion panel (:107-164).
    await dialog.getByRole('button', { name: /Entry Requirements/ }).click()
    // The rating fields are `clearable`, and the clear affordance carries
    // `aria-label="Clear Minimum Rating"` — so `getByLabel` matches two nodes.
    // The role narrows it to the number input.
    await dialog.getByRole('spinbutton', { name: 'Minimum Rating' }).fill('12000')

    const submit = dialog.getByRole('button', { name: 'Create League' })
    await expect(submit).toBeEnabled()

    const createPromise = page.waitForResponse(
      (resp) => resp.url().endsWith('/v1/leagues') && resp.request().method() === 'POST',
    )
    await submit.click()
    const createResponse = await createPromise
    expect(createResponse.status(), 'POST /v1/leagues must return 201').toBe(201)
    const createdId = ((await createResponse.json()) as ApiEnvelope<LeagueRecord>).data.id

    // UI: toast, modal closed, and the league now belongs to the admin's own
    // league list (the create handler seats the creator as a league admin).
    await expect(page.locator('.v-snackbar').getByText('League created successfully')).toBeVisible()
    await expect(dialog).toBeHidden()

    await page.getByLabel('Search leagues...').fill(leagueName)
    const row = page.locator('tr').filter({ hasText: leagueName })
    await expect(row).toBeVisible({ timeout: 20_000 })
    await expect(row.getByText(expectedSlug)).toBeVisible()

    // Backend.
    const league = await getLeague(adminToken, createdId)
    expect(league.name).toBe(leagueName)
    expect(league.slug).toBe(expectedSlug)
    expect(league.game_id).toBe(game.id)
    expect(league.description).toBe(description)
    expect(league.access_type).toBe('invite_only')
    const settings = league.settings as { eligibility?: Record<string, number> }
    expect(settings.eligibility?.min_rating_per_player).toBe(12000)
  })

  test('admin renames a league and tightens its access via LeagueEditModal', async ({ page }) => {
    // Drives LeagueEditModal.save (src/components/admin/LeagueEditModal.vue:271-320)
    // → leaguesStore.updateLeague → PATCH /v1/leagues/{league_id}, and
    // AdminLeaguesPage.onLeagueSaved (:343-346).
    //
    // The modal sends only CHANGED fields (:279-303), so the test changes three
    // different kinds of field — a plain column (name), an enum (access_type)
    // and the JSONB settings blob — and leaves the slug and description alone.
    const adminToken = await getAdminToken()
    const league = await seedLeague(adminToken, 'open', 'E2E Modal Edit League')
    const seeded = await getLeague(adminToken, league.leagueId)
    expect(seeded.access_type, 'seeded league starts open').toBe('open')

    const renamed = `${league.leagueName} Renamed`

    await loginAsAdmin(page)
    const row = await openLeagueRow(page, league.leagueName)
    await row.getByRole('button', { name: 'Edit settings' }).click()

    const dialog = page.getByRole('dialog').filter({ hasText: `Edit League: ${league.leagueName}` })
    await expect(dialog).toBeVisible()
    // The form only renders once GET /v1/leagues/{id} resolves (:20-25); the
    // populated name proves the fetch landed, not just that the dialog opened.
    await expect(dialog.getByLabel('League Name')).toHaveValue(league.leagueName, {
      timeout: 15_000,
    })

    await dialog.getByLabel('League Name').fill(renamed)

    await dialog.locator('.v-select').filter({ hasText: 'Access Type' }).click()
    await page.getByRole('option', { name: 'Application' }).click()

    await dialog.getByRole('button', { name: /Entry Requirements/ }).click()
    await dialog.getByRole('spinbutton', { name: 'Minimum Rating' }).fill('15000')

    const saveButton = dialog.getByRole('button', { name: 'Save Changes' })
    await expect(saveButton).toBeEnabled()

    const patchPromise = page.waitForResponse(
      (resp) => /\/v1\/leagues\/[^/]+$/.test(resp.url()) && resp.request().method() === 'PATCH',
    )
    await saveButton.click()
    const patchResponse = await patchPromise
    expect(patchResponse.status(), 'PATCH /v1/leagues/{id} must return 200').toBe(200)

    // UI: toast, modal closed, and the table re-read the league under its new
    // name — the old name no longer matches the search filter.
    await expect(page.locator('.v-snackbar').getByText('League updated successfully')).toBeVisible()
    await expect(dialog).toBeHidden()

    await page.getByLabel('Search leagues...').fill(renamed)
    await expect(page.locator('tr').filter({ hasText: renamed })).toBeVisible({ timeout: 20_000 })

    // Backend.
    const updated = await getLeague(adminToken, league.leagueId)
    expect(updated.name).toBe(renamed)
    expect(updated.access_type).toBe('application')
    // Untouched fields must survive a partial update.
    expect(updated.slug).toBe(league.leagueSlug)
    expect(updated.description).toBe(seeded.description)
    const settings = updated.settings as { eligibility?: Record<string, number> }
    expect(settings.eligibility?.min_rating_per_player).toBe(15000)
  })

  test('admin creates a season with roster limits via LeagueSeasonCreateModal', async ({
    page,
  }) => {
    // Drives LeagueSeasonCreateModal.save
    // (src/components/admin/LeagueSeasonCreateModal.vue:209-234) →
    // leagueSeasonsStore.createSeason → POST /v1/league-seasons, and
    // LeagueDetailModal.onSeasonCreated (:223-227).
    //
    // `admin-management.spec.ts` covers the season EDIT modal (status +
    // roster-lock option lists) on a season seeded over the API; the create
    // modal — and the four roster-limit fields only it collects — was never
    // submitted.
    const adminToken = await getAdminToken()
    const league = await seedLeague(adminToken, 'open', 'E2E Modal Season League')
    // A new league is never season-less: `trg_leagues_create_default_season`
    // (api/migrations/0028_fix_league_season_trigger.sql:49-53) inserts a
    // "Season 1" on every `leagues` INSERT. Pinned here so the post-create
    // count below means "the modal added one", not "one exists".
    const seasonsBefore = await listSeasons(adminToken, league.leagueId)
    expect(seasonsBefore, 'the DB trigger seeds exactly one season').toHaveLength(1)
    expect(seasonsBefore[0]!.slug).toBe('season-1')

    const suffix = uniqueId()
    const seasonName = `E2E Modal Season ${suffix}`
    const expectedSlug = `e2e-modal-season-${suffix}`
    const seasonDescription = `Created through LeagueSeasonCreateModal (${suffix})`

    await loginAsAdmin(page)
    const row = await openLeagueRow(page, league.leagueName)
    await row.getByRole('button', { name: 'Manage seasons and teams' }).click()

    const detailDialog = page.getByRole('dialog').filter({ hasText: league.leagueName })
    await expect(detailDialog).toBeVisible()
    // The trigger-seeded row proves GET /v1/league-seasons resolved before the
    // modal is opened — otherwise the table below could be asserted while the
    // panel is still in its loading state.
    await expect(detailDialog.locator('tbody tr').filter({ hasText: 'Season 1' })).toBeVisible({
      timeout: 20_000,
    })
    // The header button is "Create Season" and the empty-state one is "Create
    // First Season" (LeagueSeasonsPanel.vue:6-13, :96-104); the exact name
    // disambiguates them regardless of which is rendered.
    await detailDialog.getByRole('button', { name: 'Create Season', exact: true }).click()

    const createDialog = page.getByRole('dialog').filter({ hasText: 'Create New Season' })
    await expect(createDialog).toBeVisible()

    await createDialog.getByLabel('Season Name').fill(seasonName)
    await expect(createDialog.getByLabel('URL Slug')).toHaveValue(expectedSlug)
    await createDialog.getByLabel('Description (Optional)').fill(seasonDescription)

    // Defaults are 5 / 5 / 2 / null (:156-164). Every one is changed so the
    // assertions below cannot be satisfied by the defaults.
    await createDialog.getByLabel('Min Team Size').fill('4')
    await createDialog.getByLabel('Max Team Size').fill('6')
    await createDialog.getByLabel('Max Substitutes').fill('3')
    await createDialog.getByLabel('Max Teams').fill('8')

    const submit = createDialog.getByRole('button', { name: 'Create Season', exact: true })
    await expect(submit).toBeEnabled()

    const createPromise = page.waitForResponse(
      (resp) => resp.url().endsWith('/v1/league-seasons') && resp.request().method() === 'POST',
    )
    await submit.click()
    const createResponse = await createPromise
    expect(createResponse.status(), 'POST /v1/league-seasons must return 201').toBe(201)

    // UI: toast, modal closed, and the seasons table now holds the row with the
    // team-size range the modal collected (LeagueSeasonsPanel.vue:49-56).
    await expect(page.locator('.v-snackbar').getByText('Season created successfully')).toBeVisible()
    await expect(createDialog).toBeHidden()

    const seasonRow = detailDialog.locator('tbody tr').filter({ hasText: seasonName })
    await expect(seasonRow).toBeVisible({ timeout: 20_000 })
    await expect(seasonRow.getByText(expectedSlug)).toBeVisible()
    await expect(seasonRow.getByText('Draft', { exact: true })).toBeVisible()
    await expect(seasonRow.getByText('4 - 6')).toBeVisible()

    // Backend.
    const seasons = await listSeasons(adminToken, league.leagueId)
    expect(seasons, 'the modal added one season to the trigger-seeded one').toHaveLength(2)
    const season = seasons.find((s) => s.slug === expectedSlug)!
    expect(season, 'the created season is readable by its derived slug').toBeDefined()
    expect(season.name).toBe(seasonName)
    expect(season.slug).toBe(expectedSlug)
    expect(season.description).toBe(seasonDescription)
    expect(season.team_size_min).toBe(4)
    expect(season.team_size_max).toBe(6)
    expect(season.max_substitutes).toBe(3)
    expect(season.max_teams).toBe(8)
    expect(season.status).toBe('draft')
  })

  test('admin invites a user to an invite-only league via InviteUserModal', async ({ page }) => {
    // Drives InviteUserModal.sendInvitation
    // (src/components/admin/InviteUserModal.vue:110-125) →
    // leaguesStore.sendInvitation → POST /v1/leagues/{league_id}/invitations,
    // and LeagueMembersModal.onUserInvited (:440-445).
    const adminToken = await getAdminToken()
    const league = await seedLeague(adminToken, 'invite_only', 'E2E Modal Invite League')
    const invitee = await registerUser('InviteTarget')
    expect(
      await listInvitations(adminToken, league.leagueId),
      'a freshly created league has no invitations',
    ).toHaveLength(0)

    await loginAsAdmin(page)
    const row = await openLeagueRow(page, league.leagueName)
    await row.getByRole('button', { name: 'Manage members' }).click()

    const membersDialog = page
      .getByRole('dialog')
      .filter({ hasText: `Manage Members: ${league.leagueName}` })
    await expect(membersDialog).toBeVisible()
    await membersDialog.getByRole('tab', { name: /Invitations/ }).click()
    await expect(membersDialog.getByText('No pending invitations')).toBeVisible({ timeout: 15_000 })

    // All three tabs share the dialog once visited, and every v-data-table
    // renders a `tbody tr` even when empty (the `no-data` slot), so the
    // invitations table is picked out by the one column header only it has.
    const invitationsTable = membersDialog.locator('.v-data-table').filter({ hasText: 'Expires' })

    await membersDialog.getByRole('button', { name: 'Invite User' }).click()

    const inviteDialog = page.getByRole('dialog').filter({ hasText: 'Invite User to League' })
    await expect(inviteDialog).toBeVisible()

    // GROUND RULE 9 — both changes below are SPECIFICATION changes, and both
    // were findings this spec originally documented as unfixable.
    //
    // P-95 (fixed 4dd4f60): the modal demanded a raw UUID typed by hand, which
    // nothing in the product displays. It now uses UserSearchAutocomplete, so
    // the test searches by NAME — the same way a human can now do it. Driving
    // the old control would be testing a control that no longer exists.
    const inviteeInput = inviteDialog.getByPlaceholder(/search by display name/i)
    await inviteeInput.click()
    await inviteeInput.fill(invitee.displayName)
    const inviteeOption = page.getByRole('option', { name: invitee.displayName })
    await expect(inviteeOption).toBeVisible({ timeout: 15_000 })
    await inviteeOption.click()

    // P-94 (fixed c49380d): the message used to be collected, validated, and
    // dropped — so this spec deliberately asserted nothing about it, because an
    // assertion either way would have certified the defect. It is forwarded
    // now, so it IS asserted, over the API, below.
    const inviteMessage = 'Welcome to the league'
    await inviteDialog.getByLabel('Message (Optional)').fill(inviteMessage)

    const sendButton = inviteDialog.getByRole('button', { name: 'Send Invitation' })
    await expect(sendButton).toBeEnabled()

    const invitePromise = page.waitForResponse(
      (resp) =>
        /\/v1\/leagues\/[^/]+\/invitations$/.test(resp.url()) &&
        resp.request().method() === 'POST',
    )
    await sendButton.click()
    const inviteResponse = await invitePromise
    expect(inviteResponse.status(), 'POST /v1/leagues/{id}/invitations must return 201').toBe(201)

    // UI: toast, modal closed, and the invitations table reloaded with the row.
    await expect(page.locator('.v-snackbar').getByText('Invitation sent')).toBeVisible()
    await expect(inviteDialog).toBeHidden()

    await expect(membersDialog.getByText('No pending invitations')).toBeHidden({ timeout: 20_000 })
    // GROUND RULE 9 again — a SPECIFICATION change, and again one this spec
    // had documented as a defect it could not fix. This locator used to read
    // `invitee.userId.substring(0, 8)`, because the table rendered nothing but
    // a truncated id (P-115), and the comment here said so: UUID v7 prefixes
    // are timestamps, so the prefix was ambiguous and only the count assertion
    // pinned the row. The row now carries the invitee's name, so it is located
    // the way a human would — and the prefix is asserted GONE below, which is
    // the half that would fail if P-115 regressed.
    const invitationRow = invitationsTable
      .locator('tbody tr')
      .filter({ hasText: invitee.displayName })
    await expect(invitationRow).toHaveCount(1)
    await expect(
      invitationsTable.getByText(`${invitee.userId.substring(0, 8)}...`),
      'the truncated user id must not be what identifies the row',
    ).toHaveCount(0)
    // The status chip renders `{{ item.status }}` raw (:150-154) — asserted on
    // the Cancel action instead, which is what the row actually offers.
    await expect(invitationRow.getByRole('button', { name: 'Cancel invitation' })).toBeVisible()

    // Backend.
    const invitations = await listInvitations(adminToken, league.leagueId)
    expect(invitations).toHaveLength(1)
    expect(invitations[0]!.user_id).toBe(invitee.userId)
    // P-94: the message now reaches the API instead of being discarded.
    expect(invitations[0]!.message).toBe(inviteMessage)
    expect(invitations[0]!.status).toBe('pending')
    expect(invitations[0]!.invitation_type).toBe('invite')
  })

  test('admin lifts a ban with a recorded reason from BanDetailModal', async ({ page }) => {
    // Drives BanDetailModal.loadBan (src/components/admin/BanDetailModal.vue:266-290)
    // and .liftBan (:292-305) → bansStore.liftBan(banId, reason) →
    // POST /v1/admin/bans/{id}/lift, plus AdminBansPage.onBanUpdated (:399-402).
    //
    // `admin-management.spec.ts` covers the table-row lift, which goes through
    // `confirmLiftBan` and can only send `reason: null`. This modal's expanding
    // lift form is the ONLY surface in the product that can write
    // `bans.lift_reason`, and nothing had ever opened it.
    const adminToken = await getAdminToken()
    const target = await registerUser('DetailBanTarget')
    // Words rendered by other columns/chips ("Chat", "Active", "Lifted",
    // "Permanent") are kept out of both strings: getByText is a
    // case-insensitive substring match.
    const reason = `E2E seeded detail ban ${Date.now()}`
    const liftReason = `Appeal upheld by the e2e suite ${Date.now()}`
    const seeded = await seedBan(adminToken, target.userId, reason)
    expect(seeded.is_active, 'seeded ban must start active').toBe(true)
    expect(seeded.lift_reason, 'seeded ban carries no lift reason').toBeNull()

    await loginAsAdmin(page)
    await page.goto('/admin/bans')
    await expect(page.getByRole('heading', { name: 'Bans Management' })).toBeVisible()

    const row = page.locator('.v-data-table tbody tr').filter({ hasText: reason })
    await expect(row).toBeVisible({ timeout: 20_000 })
    await row.getByRole('button', { name: 'View ban details' }).click()

    const detail = page.getByRole('dialog').filter({ hasText: 'Ban Details' })
    await expect(detail).toBeVisible()

    // Detail rendering the table row cannot show: the full user id, the
    // untruncated reason, and the ban-history panel.
    await expect(detail.getByText(target.userId)).toBeVisible({ timeout: 15_000 })
    await expect(detail.getByText(reason)).toBeVisible()
    await expect(detail.locator('.v-alert').getByText('Active', { exact: true })).toBeVisible()
    await expect(detail.locator('.v-alert').getByText('Chat', { exact: true })).toBeVisible()
    await expect(detail.getByText('Permanent', { exact: true })).toBeVisible()

    await detail.getByRole('button', { name: /User Ban History/ }).click()
    await expect(detail.getByText('Current', { exact: true })).toBeVisible()

    // The lift form is collapsed until the action button reveals it (:174-200).
    await expect(detail.getByPlaceholder('Explain why this ban is being lifted...')).toBeHidden()
    await detail.getByRole('button', { name: 'Lift Ban', exact: true }).click()
    await expect(detail.getByText('Lift This Ban')).toBeVisible()
    await detail.getByPlaceholder('Explain why this ban is being lifted...').fill(liftReason)

    const liftPromise = page.waitForResponse(
      (resp) =>
        /\/v1\/admin\/bans\/[^/]+\/lift$/.test(resp.url()) && resp.request().method() === 'POST',
    )
    await detail.getByRole('button', { name: 'Confirm Lift' }).click()
    const liftResponse = await liftPromise
    expect(liftResponse.status(), 'POST /v1/admin/bans/{id}/lift must return 200').toBe(200)

    // UI: modal closed, toast from the page's `updated` handler, and the table
    // row flipped to Lifted with its lift action retired.
    await expect(detail).toBeHidden()
    await expect(page.locator('.v-snackbar').getByText('Ban updated successfully')).toBeVisible()
    const liftedRow = page.locator('.v-data-table tbody tr').filter({ hasText: reason })
    await expect(liftedRow.getByText('Lifted')).toBeVisible({ timeout: 20_000 })
    await expect(liftedRow.getByRole('button', { name: 'Lift ban' })).toBeHidden()

    // Backend — the reason typed into the modal is what distinguishes this
    // path from the table-row lift.
    const lifted = await getBan(adminToken, seeded.id)
    expect(lifted.id).toBe(seeded.id)
    expect(lifted.is_active).toBe(false)
    expect(lifted.lifted_at).not.toBeNull()
    expect(lifted.lift_reason).toBe(liftReason)
  })
})
