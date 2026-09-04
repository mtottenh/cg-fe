import { test, expect, type Page } from '@playwright/test'
import { getAdminToken, clearAuthState } from './fixtures/auth.fixture'
import { uniqueId } from './fixtures/test-data'
import {
  createDraftTournament,
  createOpenRegistrationTournament,
  registerPlayer,
  approveRegistration,
  fetchTournament,
  transitionTournament,
  waitForTournamentStatus,
} from './fixtures/tournament-lifecycle.fixture'
import { listRegistrations } from './fixtures/team-tournament-extra.fixture'
import { createCheckInScenario, getRegistration } from './fixtures/checkin.fixture'
import { createLeagueSeasonScenario } from './fixtures/league-season-extra.fixture'
import {
  registerAsRosterUser,
  loginAsUser,
  createTeamWithMembers,
} from './fixtures/team-roster.fixture'

/**
 * Tournament Public Flows E2E Tests
 *
 * Covers public tournament browsing plus the whole self-service registration
 * surface: register → registered/pending status → withdraw → check-in.
 *
 * WHY EVERY TEST BUILDS ITS OWN TOURNAMENT
 * ----------------------------------------
 * These tests used to point at the globally seeded tournament
 * (`testTournaments.standard.slug`). `global-setup.ts` *starts* that
 * tournament (`startTournamentAndGetMatches`), so `Register Now` /
 * `Withdraw` / `Check In` never render on it, and every registration test
 * was wrapped in a visibility guard — i.e. the bodies silently skipped and
 * reported green (COVERAGE-PLAN.md §2 / §5.2).
 *
 * Each test now seeds its own tournament through
 * `createOpenRegistrationTournament()` (draft → publish → open-registration),
 * so the control under test is *guaranteed* to render and the assertions are
 * unconditional. No visibility guards remain in this file.
 *
 * Backend facts these tests rely on (verified in the API repo):
 *  - `tournament_registrations.status` is set from the tournament's
 *    `registration_type` on insert (P-2): `open` AUTO-APPROVES, while
 *    `approval` / `invite_only` / `qualification` land `pending`.
 *    ⚠️ This comment previously claimed a fresh self-registration is ALWAYS
 *    `pending` "regardless of registration_type" — that was true of the DB
 *    default alone, and stopped being true when P-2 made the insert set the
 *    status explicitly. Tests that need a pending row must therefore ask for
 *    `registrationType: 'approval'`.
 *  - `Tournament::is_check_in_open()` needs `check_in_required` **and** a
 *    `check_in_start`/`check_in_end` window around now
 *    (portal-domain/src/entities/tournament.rs:140) — `createCheckInScenario`
 *    sets both.
 */

/**
 * The `TournamentRegistrationCard` root card, located by the copy only it
 * renders (title computed — TournamentRegistrationCard.vue:197-205). Scoping
 * chip/button assertions to this card keeps them away from the header card
 * and the tabs card.
 */
function registrationCard(page: Page) {
  return page
    .locator('.v-card')
    .filter({
      hasText:
        /Join This Tournament|Registration Pending|You're Registered|Check-in Now Open|You're All Set!|Registration Opens Soon|Registration Closed/,
    })
    .first()
}

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/**
 * Every real value of `TournamentStatus`
 * (api/crates/portal-core/src/types/status.rs:118, mirrored by the
 * `tournaments_check_status` CHECK in
 * api/migrations/0053_fix_tournament_status_constraint.sql).
 *
 * A card badge whose text is EXACTLY one of these is a raw enum leaking to
 * users — the P-4/P-21 defect. Every one of these maps to human copy in
 * `src/utils/statusMaps.ts`, so none of them may ever be the rendered label.
 */
const RAW_TOURNAMENT_STATUSES = [
  'draft',
  'published',
  'registration',
  'scheduled',
  'in_progress',
  'completed',
  'finalized',
  'cancelled',
]

/**
 * `/tournaments` fetches ONE page of 20 and filters client-side
 * (TournamentsPage.vue `fetchData` sends only page/per_page), while the API
 * orders by `starts_at DESC NULLS LAST, created_at DESC`
 * (portal-db/src/adapters/tournament/tournament.rs:344).
 *
 * Fixture tournaments have no `starts_at`, so they land in the NULL bucket
 * behind every dated tournament and can be pushed off page 1 by whatever else
 * the suite created. Giving ours a far-future `starts_at` puts it at position 1
 * deterministically, so "the card is not on screen" can only mean the filter
 * dropped it — which is exactly what P-19 is about.
 */
async function pinToTopOfTournamentList(
  adminToken: string,
  tournamentId: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ starts_at: '2099-01-01T12:00:00Z' }),
  })
  if (!resp.ok) {
    throw new Error(`Pin tournament failed (${resp.status}): ${await resp.text()}`)
  }
}

/** The `TournamentCard` for a given tournament name (TournamentCard.vue:2). */
function tournamentCard(page: Page, name: string) {
  return page.locator('.tournament-card').filter({ hasText: name })
}

test.describe('Tournament Public Flows', () => {
  // Browse routes are members-only now (Steam-only auth change): every
  // test runs signed in as a shared throwaway member. Tests needing a
  // SPECIFIC identity call loginAsUser themselves — it swaps sessions.
  let browsingUser: { email: string; password: string }

  test.beforeAll(async () => {
    browsingUser = await registerAsRosterUser()
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, browsingUser)
  })

  test.describe('Browse Tournaments', () => {
    test('should display tournaments list page', async ({ page }) => {
      await page.goto('/tournaments')

      // Page elements MUST be visible
      await expect(page.getByRole('heading', { name: 'Tournaments' })).toBeVisible()
      await expect(page.getByText('Find and join competitive tournaments')).toBeVisible()

      // Filter controls MUST be present
      await expect(page.getByRole('textbox', { name: 'Search tournaments...' })).toBeVisible()
      await expect(page.locator('.v-select').filter({ hasText: 'Game' })).toBeVisible()
      await expect(page.locator('.v-select').filter({ hasText: 'Status' })).toBeVisible()
    })

    test('should display status tabs', async ({ page }) => {
      await page.goto('/tournaments')

      // All tabs MUST be visible
      await expect(page.getByRole('tab', { name: 'All' })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Open Registration/i })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Live/i })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Upcoming/i })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Completed/i })).toBeVisible()
    })

    test('should filter tournaments by tab', async ({ page }) => {
      await page.goto('/tournaments')
      await page.waitForLoadState('networkidle')

      // Click Open Registration tab
      await page.getByRole('tab', { name: /Open Registration/i }).click()

      // Filtering is client-side but the active tab is mirrored into the URL
      // so a filtered view can be shared and survives a refresh.
      await expect(page).toHaveURL(/\/tournaments\?.*tab=registration_open/)
    })

    test('should narrow the grid to matching tournaments when searching by name', async ({ page }) => {
      await page.goto('/tournaments')

      // Search is a server-side `?search=` since the P-28 fix. This test is
      // about the grid NARROWING, so it drives the query off a name that is
      // already on screen; the "can it reach past page 1" half is the dedicated
      // test below.
      const cardTitles = page.locator('.tournament-card h3')
      await expect(cardTitles.first()).toBeVisible()
      const targetName = ((await cardTitles.first().textContent()) ?? '').trim()
      expect(targetName.length).toBeGreaterThan(0)

      await page.getByRole('textbox', { name: 'Search tournaments...' }).fill(targetName)

      // The searched-for tournament survives the filter...
      await expect(cardTitles.filter({ hasText: targetName }).first()).toBeVisible()

      // ...and nothing that fails the filter is left on screen. Polled
      // because the filter is a computed that re-renders on the next tick.
      const nonMatching = async () =>
        (await cardTitles.allTextContents()).filter(
          (name) => !name.trim().toLowerCase().includes(targetName.toLowerCase()),
        ).length
      await expect.poll(nonMatching).toBe(0)
      expect((await cardTitles.allTextContents()).length).toBeGreaterThan(0)
    })

    /**
     * COVERAGE-PLAN.md §9b **P-28** — the pagination-blindness defect class.
     *
     * `fetchData` used to send only `page`/`per_page`, and search, game, status
     * and every tab filtered the twenty rows that request happened to return.
     * Typing a tournament's EXACT name therefore returned "No Tournaments
     * Found" whenever that tournament sat past row 20 — which, on a list
     * ordered `starts_at DESC NULLS LAST`, is where every undated tournament
     * lives. The fix pushes `search` (and `game_id`/`status`) into the query
     * the API already accepts.
     *
     * The test seeds its own hay so it does not depend on how full the database
     * happens to be, and asserts the precondition through the API: if the
     * target were on page 1, the search would prove nothing.
     */
    test('should find a tournament by exact name when it is past the first page', async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const adminToken = await getAdminToken()
      const suffix = uniqueId()
      const targetName = `E2E Deep Search Target ${suffix}`

      // The needle: no `starts_at`, so the API's ORDER BY puts it in the NULLS
      // LAST bucket, behind every dated tournament.
      const target = await createDraftTournament(adminToken, {
        name: targetName,
        slug: `e2e-deep-search-${suffix}`,
      })
      await transitionTournament(adminToken, target.id, 'publish')

      // The haystack: a full page and a bit of dated tournaments, all of which
      // sort ahead of the needle. 25 > the API's default page size of 20.
      for (let i = 0; i < 25; i++) {
        const decoy = await createDraftTournament(adminToken, {
          name: `E2E Deep Search Filler ${suffix} ${i}`,
          slug: `e2e-deep-search-filler-${suffix}-${i}`,
        })
        await pinToTopOfTournamentList(adminToken, decoy.id)
      }

      // Precondition: the needle really is unreachable on page 1.
      const firstPage = await fetch(`${API_URL}/v1/tournaments?page=1&per_page=20`)
      const firstPageIds = (
        (await firstPage.json()) as { data: Array<{ id: string }> }
      ).data.map((t) => t.id)
      expect(firstPageIds).toHaveLength(20)
      expect(
        firstPageIds,
        'the target must be off the first page or this test proves nothing',
      ).not.toContain(target.id)

      await page.goto('/tournaments')
      await expect(page.locator('.tournament-card').first()).toBeVisible()
      await expect(tournamentCard(page, targetName)).toHaveCount(0)

      // Armed before typing so the request can be inspected afterwards; the
      // user-visible assertion is the one immediately below it.
      const searchRequest = page.waitForRequest(
        (req) => req.url().includes('/v1/tournaments?') && req.url().includes('search='),
      )
      await page.getByRole('textbox', { name: 'Search tournaments...' }).fill(targetName)

      const card = tournamentCard(page, targetName)
      await expect(card).toHaveCount(1)
      await expect(card).toBeVisible()

      // ...and it got there by asking the API, not by sieving a page already in
      // memory, which is precisely what the bug was.
      const sent = new URL((await searchRequest).url()).searchParams
      expect(sent.get('search')).toBe(targetName)
    })

    test('should show empty state when no tournaments match filter', async ({ page }) => {
      await page.goto('/tournaments')

      // Search for something that won't exist
      await page.getByRole('textbox', { name: 'Search tournaments...' }).fill('xyznonexistent12345')

      // MUST show empty state message and drop every card
      await expect(page.getByText(/No Tournaments Found/i)).toBeVisible()
      await expect(page.locator('.tournament-card')).toHaveCount(0)
    })

    test('should clear filters when clicking clear button', async ({ page }) => {
      await page.goto('/tournaments')

      const searchInput = page.getByRole('textbox', { name: 'Search tournaments...' })

      // The Clear Filters button only renders inside the empty state, and
      // only when the unfiltered list is non-empty (TournamentsPage.vue:95-105)
      // — so filter everything out to guarantee it is on screen.
      await searchInput.fill('xyznonexistent12345')

      const clearButton = page.getByRole('button', { name: 'Clear Filters' })
      await expect(clearButton).toBeVisible()
      await clearButton.click()

      // Search input MUST be cleared and the grid MUST come back
      await expect(searchInput).toHaveValue('')
      await expect(page.locator('.tournament-card').first()).toBeVisible()
    })

    /**
     * COVERAGE-PLAN.md §9b P-19.
     *
     * The Upcoming tab used to filter on
     * `['draft','published','registration_open','registration_closed','ready']`
     * — three of which are not tournament statuses at all — so it rendered as a
     * permanent empty state and users could not discover tournaments that had
     * not started. This test seeds a genuinely upcoming tournament and demands
     * to see it on that tab.
     */
    test('should list an open-registration tournament under the Upcoming tab', async ({ page }) => {
      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)
      await pinToTopOfTournamentList(adminToken, tournament.id)

      await page.goto('/tournaments?tab=upcoming')

      // The tab really is the one under test...
      await expect(page.getByRole('tab', { name: /Upcoming/i })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      // ...and the tournament is on it.
      const card = tournamentCard(page, tournament.name)
      await expect(card).toHaveCount(1)
      await expect(card).toBeVisible()
      await expect(page.getByText('No Tournaments Found')).toHaveCount(0)

      // Backend cross-check: the status the tab had to cope with is
      // `registration` — not the `registration_open` the filter used to look
      // for.
      expect((await fetchTournament(adminToken, tournament.id)).status).toBe('registration')
    })

    /**
     * The other half of P-19: `scheduled` (what `close-registration` produces)
     * is also an upcoming status, and the Open Registration tab must be precise
     * enough to let go of a tournament once registration closes.
     */
    test('should move a tournament out of Open Registration into Upcoming when registration closes', async ({
      page,
    }) => {
      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)
      await pinToTopOfTournamentList(adminToken, tournament.id)

      await page.goto('/tournaments?tab=registration_open')
      await expect(tournamentCard(page, tournament.name)).toHaveCount(1)

      // Registration closes -> status becomes `scheduled`
      // (TournamentService::close_registration, service.rs:302-317).
      await transitionTournament(adminToken, tournament.id, 'close-registration')
      await waitForTournamentStatus(adminToken, tournament.id, 'scheduled')

      await page.goto('/tournaments?tab=registration_open')
      await expect(page.locator('.tournament-card').first()).toBeVisible()
      await expect(tournamentCard(page, tournament.name)).toHaveCount(0)

      // But it is still upcoming, and says so in public voice.
      await page.goto('/tournaments?tab=upcoming')
      const card = tournamentCard(page, tournament.name)
      await expect(card).toHaveCount(1)
      await expect(card.locator('.status-badge')).toHaveText('Starting Soon')
    })

    /**
     * COVERAGE-PLAN.md §9b P-21 — the list card used to run its own `switch`
     * over `registration_open` / `check_in_open` / `ready` with
     * `default: return props.tournament.status`, so a tournament in
     * `registration`, `scheduled` or `finalized` printed the raw enum onto the
     * badge.
     */
    test('should label tournament cards with human copy, never the raw status enum', async ({
      page,
    }) => {
      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)
      await pinToTopOfTournamentList(adminToken, tournament.id)

      await page.goto('/tournaments')

      // The seeded tournament is in `registration` — the status that used to
      // fall through to `default` — and MUST read as public copy.
      await expect(tournamentCard(page, tournament.name).locator('.status-badge')).toHaveText(
        'Registration Open',
      )

      // And no card anywhere on the page may be showing a raw enum.
      const badges = page.locator('.tournament-card .status-badge')
      await expect(badges.first()).toBeVisible()
      const labels = (await badges.allTextContents()).map((t) => t.trim())
      expect(labels.length).toBeGreaterThan(0)
      expect(labels.filter((l) => RAW_TOURNAMENT_STATUSES.includes(l))).toEqual([])
    })
  })

  test.describe('View Tournament Details', () => {
    test('should display tournament detail page', async ({ page }) => {
      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)

      await page.goto(`/tournaments/${tournament.slug}`)

      // Header renders the tournament name as the page h1
      // (TournamentHeader.vue:49).
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).toHaveCount(0)

      // Status chip mirrors the backend status.
      await expect(page.locator('.v-chip').filter({ hasText: 'Registration Open' }).first()).toBeVisible()
      expect((await fetchTournament(adminToken, tournament.id)).status).toBe('registration')
    })

    test('should display tournament not found for invalid slug', async ({ page }) => {
      await page.goto('/tournaments/definitely-not-a-real-tournament-12345')
      await page.waitForLoadState('networkidle')

      // MUST show not found
      await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Browse Tournaments' })).toBeVisible()
    })

    test('should display tournament details tabs', async ({ page }) => {
      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)

      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()

      // Tabs MUST be visible (TournamentDetailPage.vue:41-51)
      await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Players|Teams/ })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Bracket' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Matches' })).toBeVisible()
    })

    test('should switch to the participants tab and list registered participants', async ({ page }) => {
      test.setTimeout(60_000)

      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)
      const player = await registerAsRosterUser()
      const participantName = `Participant ${uniqueId()}`
      await registerPlayer(player.token, tournament.id, participantName)

      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()

      await page.getByRole('tab', { name: /Players|Teams/ }).click()

      // The seeded registration MUST be listed in the participants table.
      await expect(page.locator('table')).toBeVisible()
      await expect(page.getByText(participantName)).toBeVisible()
      await expect(page.getByText('No participants registered yet')).toHaveCount(0)
    })
  })

  test.describe('Tournament Registration - Individual', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)

      // Anonymous visitor: the ROUTE bounces before any content renders —
      // tournament pages are members-only (router meta.requiresAuth).
      await clearAuthState(page)
      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page).toHaveURL(new RegExp(`/login\\?redirect=.*${tournament.slug}`))
      await expect(page.getByTestId('steam-login-button')).toBeVisible()

      // ...and nothing was registered on the way out.
      expect(await listRegistrations(adminToken, tournament.id)).toHaveLength(0)
    })

    test('should show the register call-to-action when authenticated and not registered', async ({ page }) => {
      test.setTimeout(60_000)

      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)
      const player = await registerAsRosterUser()
      await loginAsUser(page, player)

      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()

      const card = registrationCard(page)
      await expect(card.getByText('Join This Tournament')).toBeVisible()
      await expect(card.getByText('Sign up now to compete')).toBeVisible()
      await expect(card.getByRole('button', { name: 'Register Now' })).toBeVisible()

      // No registered/pending state is claimed while the user has no row.
      await expect(card.locator('.v-chip')).toHaveCount(0)
      expect(await listRegistrations(adminToken, tournament.id)).toHaveLength(0)
    })

    test('should open player registration modal for individual tournaments', async ({ page }) => {
      test.setTimeout(60_000)

      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)
      const player = await registerAsRosterUser()
      await loginAsUser(page, player)

      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()

      await registrationCard(page).getByRole('button', { name: 'Register Now' }).click()

      // PlayerRegistrationModal MUST open with its name field
      // (PlayerRegistrationModal.vue:4-25).
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()
      await expect(modal.getByText('Register for Tournament')).toBeVisible()
      await expect(modal.getByLabel('Display Name')).toBeVisible()
      await expect(modal.getByRole('button', { name: 'Register', exact: true })).toBeVisible()

      // Opening the modal MUST NOT have registered anything yet.
      expect(await listRegistrations(adminToken, tournament.id)).toHaveLength(0)
    })

    test('should register player successfully', async ({ page }) => {
      test.setTimeout(60_000)

      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken, {
        registrationType: 'approval',
      })
      const player = await registerAsRosterUser()
      await loginAsUser(page, player)

      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()

      await registrationCard(page).getByRole('button', { name: 'Register Now' }).click()

      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()

      const participantName = `TestPlayer_${uniqueId()}`
      await modal.getByLabel('Display Name').fill(participantName)
      await modal.getByRole('button', { name: 'Register', exact: true }).click()

      // UI: the card flips to the pending state. This tournament is
      // `registrationType: 'approval'` so the row genuinely lands `pending` —
      // on an `open` tournament P-2 auto-approves and the card would instead
      // read "You're Registered".
      const card = registrationCard(page)
      await expect(card.locator('.v-chip').filter({ hasText: 'Awaiting Approval' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(card.getByText('Registration Pending')).toBeVisible()
      await expect(card.getByRole('button', { name: 'Cancel Registration' })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Register Now' })).toHaveCount(0)

      // UI: and the participant shows up in the participants table.
      await page.getByRole('tab', { name: /Players|Teams/ }).click()
      await expect(page.getByText(participantName)).toBeVisible()

      // Backend: the row really exists, owned by this player, in `pending`.
      const registrations = await listRegistrations(adminToken, tournament.id)
      expect(registrations).toHaveLength(1)
      expect(registrations[0].participant_name).toBe(participantName)
      expect(registrations[0].status).toBe('pending')
    })

    test('should show registration status after registration', async ({ page }) => {
      test.setTimeout(60_000)

      const adminToken = await getAdminToken()
      // `approval`, not `open`: since P-2 an open tournament auto-approves, so
      // there would be no pending state to render.
      const tournament = await createOpenRegistrationTournament(adminToken, {
        registrationType: 'approval',
      })
      const player = await registerAsRosterUser()
      const participantName = `Pending ${uniqueId()}`
      // Seed the registration through the API — the UI submit path has its
      // own test above; this one is about how an existing row is rendered.
      const registrationId = await registerPlayer(player.token, tournament.id, participantName)
      await loginAsUser(page, player)

      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()

      const card = registrationCard(page)
      await expect(card.getByText('Registration Pending')).toBeVisible()
      await expect(card.locator('.v-chip').filter({ hasText: 'Awaiting Approval' })).toBeVisible()
      await expect(card.getByText('Your registration is awaiting admin approval')).toBeVisible()
      await expect(card.getByRole('button', { name: 'Register Now' })).toHaveCount(0)

      // Backend agrees with what the card is claiming.
      const row = await getRegistration(undefined, adminToken, tournament.id, registrationId)
      expect(row.status).toBe('pending')
      expect(row.checked_in).toBe(false)
    })
  })

  test.describe('Tournament Registration - Team', () => {
    test('should open the team registration modal for a captain of an eligible team', async ({ page }) => {
      test.setTimeout(90_000)

      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken, {
        participantType: 'team',
      })
      // A team the actor captains makes them eligible: the tournament is not
      // league/season scoped, so `hasEligibleTeams` only needs captain role +
      // active membership (useTournamentContext.ts:46-60).
      const scenario = await createLeagueSeasonScenario(adminToken)
      const roster = await createTeamWithMembers({
        leagueId: scenario.leagueId,
        seasonId: scenario.seasonId,
        memberCount: 0,
        teamNamePrefix: 'E2E Tournament Team',
      })
      await loginAsUser(page, roster.owner)

      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()

      // Team tournaments swap the CTA label (TournamentRegistrationCard.vue:23).
      const registerTeam = registrationCard(page).getByRole('button', { name: 'Register Team' })
      await expect(registerTeam).toBeVisible()
      await registerTeam.click()

      // TeamRegistrationModal lists the captain's eligible teams
      // (TeamRegistrationModal.vue:39-71).
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()
      await expect(modal.getByText(/Select a team to register for/)).toBeVisible()
      await expect(modal.getByText(roster.teamName)).toBeVisible()
      await expect(modal.getByText('No Eligible Teams')).toHaveCount(0)

      // Opening the modal registers nothing — the submit path is covered by
      // tournament-team.spec.ts (COVERAGE-PLAN.md §6.4).
      expect(await listRegistrations(adminToken, tournament.id)).toHaveLength(0)
    })

    test('should show no eligible teams and hide the register button for a user without teams', async ({ page }) => {
      test.setTimeout(60_000)

      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken, {
        participantType: 'team',
      })
      const player = await registerAsRosterUser()
      await loginAsUser(page, player)

      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()

      // `hasEligibleTeams === false` swaps the CTA for an info chip
      // (TournamentRegistrationCard.vue:91-96) — the button MUST be gone.
      const card = registrationCard(page)
      await expect(card.locator('.v-chip').filter({ hasText: 'No Eligible Teams' })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Register Team' })).toHaveCount(0)
      await expect(card.getByRole('button', { name: 'Register Now' })).toHaveCount(0)

      // Backend: registration really is open — the chip is about eligibility,
      // not about a closed tournament.
      const state = await fetchTournament(adminToken, tournament.id)
      expect(state.status).toBe('registration')
    })
  })

  test.describe('Tournament Withdrawal', () => {
    test('should show withdraw option when registered', async ({ page }) => {
      test.setTimeout(60_000)

      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)
      const player = await registerAsRosterUser()
      const registrationId = await registerPlayer(
        player.token,
        tournament.id,
        `Approved ${uniqueId()}`,
      )
      // Approved (not pending) is what surfaces the "Withdraw" affordance.
      await approveRegistration(adminToken, tournament.id, registrationId)
      await loginAsUser(page, player)

      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()

      const card = registrationCard(page)
      await expect(card.locator('.v-chip').filter({ hasText: 'Registered' })).toBeVisible()
      // `canWithdraw` is true while the tournament is in `registration`
      // (TournamentRegistrationCard.vue:163-167).
      await expect(card.getByRole('button', { name: 'Withdraw' })).toBeVisible()

      expect(
        (await getRegistration(undefined, adminToken, tournament.id, registrationId)).status,
      ).toBe('approved')
    })

    test('should withdraw from tournament when registered', async ({ page }) => {
      test.setTimeout(60_000)

      const adminToken = await getAdminToken()
      const tournament = await createOpenRegistrationTournament(adminToken)
      const player = await registerAsRosterUser()
      const registrationId = await registerPlayer(
        player.token,
        tournament.id,
        `Quitter ${uniqueId()}`,
      )
      await approveRegistration(adminToken, tournament.id, registrationId)
      await loginAsUser(page, player)

      await page.goto(`/tournaments/${tournament.slug}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()

      await registrationCard(page).getByRole('button', { name: 'Withdraw' }).click()

      // handleWithdraw() is confirm-gated; the dialog's action button is
      // labelled "Withdraw" (TournamentDetailPage.vue:558-578).
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Withdraw from Tournament')).toBeVisible()
      await dialog.getByRole('button', { name: 'Withdraw' }).click()

      // UI: the card falls back to the join CTA.
      const card = registrationCard(page)
      await expect(card.getByRole('button', { name: 'Register Now' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(card.locator('.v-chip').filter({ hasText: 'Registered' })).toHaveCount(0)

      // Backend: the registration is really withdrawn.
      await expect
        .poll(
          async () =>
            (await getRegistration(undefined, adminToken, tournament.id, registrationId)).status,
          { timeout: 10_000 },
        )
        .toBe('withdrawn')
    })
  })

  test.describe('Tournament Check-in', () => {
    test('should show check-in button when check-in is open', async ({ page }) => {
      test.setTimeout(90_000)

      const adminToken = await getAdminToken()
      // check_in_required + an open check-in window + approved registrations,
      // stopped before /start so the tournament stays on the public page's
      // registration card (checkin.fixture.ts:153-206, 357-365).
      const scenario = await createCheckInScenario(undefined, adminToken, {
        checkInRequired: true,
        skipStart: true,
      })
      await loginAsUser(page, scenario.p1)

      await page.goto(`/tournaments/${scenario.tournamentSlug}`)

      const card = registrationCard(page)
      await expect(card.getByText('Check-in Now Open')).toBeVisible()
      await expect(card.getByText('Check in now to confirm your participation')).toBeVisible()
      await expect(card.getByRole('button', { name: 'Check In' })).toBeVisible()

      // Backend precondition the button is claiming: approved, not yet in.
      const row = await getRegistration(
        undefined,
        adminToken,
        scenario.tournamentId,
        scenario.p1.registrationId,
      )
      expect(row.status).toBe('approved')
      expect(row.checked_in).toBe(false)
    })

    test('should show checked-in status after check-in', async ({ page }) => {
      test.setTimeout(90_000)

      const adminToken = await getAdminToken()
      const scenario = await createCheckInScenario(undefined, adminToken, {
        checkInRequired: true,
        skipStart: true,
      })
      await loginAsUser(page, scenario.p1)

      await page.goto(`/tournaments/${scenario.tournamentSlug}`)

      const card = registrationCard(page)
      await card.getByRole('button', { name: 'Check In' }).click()

      // UI: the card flips to the checked-in state
      // (TournamentRegistrationCard.vue:62-67, 198).
      await expect(card.locator('.v-chip').filter({ hasText: 'Checked In' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(card.getByText("You're All Set!")).toBeVisible()
      await expect(card.getByRole('button', { name: 'Check In' })).toHaveCount(0)

      // Backend: check-in was actually persisted.
      await expect
        .poll(
          async () =>
            (
              await getRegistration(
                undefined,
                adminToken,
                scenario.tournamentId,
                scenario.p1.registrationId,
              )
            ).checked_in,
          { timeout: 10_000 },
        )
        .toBe(true)
    })
  })
})
