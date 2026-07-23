import { test, expect, type Page } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { uniqueId } from './fixtures/test-data'
import { getCs2Game } from './fixtures/awards.fixture'
import { advanceSeason, createSeason } from './fixtures/league-season-extra.fixture'
import { loginAsUser, registerAsRosterUser, type RosterUser } from './fixtures/team-roster.fixture'

/**
 * `LeagueDetailPage` join / apply — COVERAGE-PLAN §7 Tier 3.
 *
 * `handleJoinLeague` (LeagueDetailPage.vue:545) and `handleApplyToLeague`
 * (:553) had ZERO coverage, despite being the entry point to everything
 * downstream: without a league membership there is no "Create Team" CTA
 * (:171-178), so no team, no season roster and no tournament participation.
 *
 * The page shows a DIFFERENT affordance per `league.access_type`
 * (:81-123), and the backend enforces the same split
 * (`LeagueService::join_league`, api/crates/portal-domain/src/services/league.rs:212-218
 * returns `DomainError::LeagueInviteOnly`; `apply_to_league` :403-407 rejects
 * anything that is not `access_type = application`). All three branches are
 * covered here, once each:
 *
 *   open        → "Join League" button, membership is immediate
 *   application → "Apply to Join" dialog, membership needs an admin approval
 *   invite_only → no self-service affordance at all, and the API says the same
 *
 * Ground rules (§3): joining is CLICKED in the joiner's own authenticated
 * session, and the outcome is asserted on the page (membership banner +
 * member-only CTA) AND against the backend member list. Applicant and
 * approver are separate identities in separate browser contexts, so a test
 * that collapsed them could not pass.
 */

test.describe.configure({ timeout: 90_000 })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface ApiEnvelope<T> {
  data: T
}

async function jsonOrThrow<T>(resp: Response, context: string): Promise<T> {
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${context} failed (${resp.status}): ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

type LeagueAccessType = 'open' | 'application' | 'invite_only'

interface JoinableLeague {
  leagueId: string
  leagueName: string
  seasonId: string
}

/**
 * `createLeague` in `league-season-extra.fixture.ts` hard-codes
 * `access_type: 'open'` (:87) and shared fixtures belong to another
 * workstream, so the access-type-parameterised builder lives here. The season
 * is advanced to `registration` because the member-only "Create Team" CTA
 * (LeagueDetailPage.vue:171-178) needs a selected season to attach to — it is
 * the affordance that proves membership actually unlocked something.
 */
async function createLeagueWithAccessType(
  adminToken: string,
  accessType: LeagueAccessType,
): Promise<JoinableLeague> {
  const suffix = uniqueId()
  const leagueName = `E2E ${accessType} League ${suffix}`
  const gameId = (await getCs2Game()).id

  const resp = await fetch(`${API_URL}/v1/leagues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: leagueName,
      slug: `e2e-join-${accessType.replace('_', '-')}-${suffix}`,
      game_id: gameId,
      description: `League for the E2E join/apply flow (${accessType}, ${suffix})`,
      access_type: accessType,
    }),
  })
  const body = await jsonOrThrow<ApiEnvelope<{ id: string }>>(resp, `Create ${accessType} league`)

  const season = await createSeason(adminToken, body.data.id)
  await advanceSeason(adminToken, season, 'registration')

  return { leagueId: body.data.id, leagueName, seasonId: season.seasonId }
}

interface LeagueMemberRow {
  user_id: string
  membership_type: string
}

/** `GET /v1/leagues/{league_id}/members` — backend cross-check for membership. */
async function listLeagueMembers(
  adminToken: string,
  leagueId: string,
): Promise<LeagueMemberRow[]> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/members`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return jsonOrThrow<LeagueMemberRow[]>(resp, 'List league members')
}

interface LeagueApplicationRow {
  id: string
  user_id: string
  status: string
  message: string | null
  invitation_type: string
}

/**
 * `GET /v1/leagues/{league_id}/applications` — pending applications only, and
 * filtered to `invitation_type = application` by the handler
 * (portal-api/src/handlers/leagues.rs:684-692). Returns a bare array, not a
 * DataResponse envelope (stores/leagues.ts:200 documents the same asymmetry).
 */
async function listLeagueApplications(
  adminToken: string,
  leagueId: string,
): Promise<LeagueApplicationRow[]> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/applications`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return jsonOrThrow<LeagueApplicationRow[]>(resp, 'List league applications')
}

/** The membership banner at LeagueDetailPage.vue:57-72. */
function membershipBanner(page: Page) {
  return page.getByText(/You are a\s+member\s+of this league/)
}

async function openLeaguePage(page: Page, leagueId: string): Promise<void> {
  await page.goto(`/leagues/${leagueId}`)
  await page.waitForLoadState('networkidle')
}

test.describe('League join / apply', () => {
  test('a player joins an OPEN league from the league page and becomes a member', async ({
    browser,
  }) => {
    const adminToken = await getAdminToken()
    const league = await createLeagueWithAccessType(adminToken, 'open')
    const joiner: RosterUser = await registerAsRosterUser()

    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await loginAsUser(page, { email: joiner.email, password: joiner.password })
      await openLeaguePage(page, league.leagueId)

      // Pre-state: an outsider. The open-league CTA is offered, the
      // membership banner and the member-only CTA are not.
      await expect(page.getByText('This league is open to everyone.')).toBeVisible({
        timeout: 10_000,
      })
      await expect(membershipBanner(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Create Team' })).toHaveCount(0)

      await page.getByRole('button', { name: 'Join League' }).click()

      // UI assertion 1: the page flips to the member banner WITHOUT a reload —
      // `joinLeague` refetches `/v1/users/me/leagues` (stores/leagues.ts:130)
      // and `isLeagueMember` (useLeagueDetail.ts:48-51) recomputes.
      await expect(membershipBanner(page)).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('This league is open to everyone.')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Join League' })).toHaveCount(0)

      // UI assertion 2: membership unlocked something — the member-only
      // "Create Team" CTA for the registration-phase season.
      await expect(page.getByRole('button', { name: 'Create Team' }).first()).toBeVisible()

      // UI assertion 3: it survives a reload (the membership is server-side,
      // not just local store state).
      await openLeaguePage(page, league.leagueId)
      await expect(membershipBanner(page)).toBeVisible({ timeout: 10_000 })

      // Backend assertion: the join really landed, with the ordinary
      // `member` membership type rather than anything elevated.
      const members = await listLeagueMembers(adminToken, league.leagueId)
      const membership = members.find((m) => m.user_id === joiner.userId)
      expect(membership, 'joiner should now be a league member').toBeDefined()
      expect(membership!.membership_type).toBe('member')
    } finally {
      await context.close()
    }
  })

  test('a player applies to an APPLICATION league, waits, and an admin approval seats them', async ({
    browser,
  }) => {
    const adminToken = await getAdminToken()
    const league = await createLeagueWithAccessType(adminToken, 'application')
    const applicant: RosterUser = await registerAsRosterUser()
    const message = `Please let me into ${league.leagueName} — ${uniqueId()}`

    // Two identities in two isolated contexts: the applicant applies, a
    // different logged-in league admin approves. The dev-token style single
    // shared identity would make both sides the same user.
    const applicantContext = await browser.newContext()
    const adminContext = await browser.newContext()
    try {
      const applicantPage = await applicantContext.newPage()
      await loginAsUser(applicantPage, {
        email: applicant.email,
        password: applicant.password,
      })
      await openLeaguePage(applicantPage, league.leagueId)

      // An application league offers "Apply to Join" and NOT the direct-join
      // button (LeagueDetailPage.vue:98-117 vs :81-95).
      await expect(applicantPage.getByText('This league requires an application to join.')).toBeVisible({
        timeout: 10_000,
      })
      await expect(applicantPage.getByRole('button', { name: 'Join League' })).toHaveCount(0)
      await expect(membershipBanner(applicantPage)).toHaveCount(0)

      await applicantPage.getByRole('button', { name: 'Apply to Join' }).click()

      // The dialog names the league it is for (:362) — unlike league
      // invitations, which do not.
      const dialog = applicantPage.locator('.v-overlay--active')
      await expect(dialog.getByText(`Apply to ${league.leagueName}`)).toBeVisible()
      await dialog.getByLabel('Message (optional)').fill(message)
      await dialog.getByRole('button', { name: 'Submit Application' }).click()

      // UI assertion 1: the dialog closes, which `handleApplyToLeague`
      // (LeagueDetailPage.vue:553-561) only does once the POST resolved, and
      // no error surfaced.
      await expect(dialog).toHaveCount(0)
      await expect(applicantPage.getByText('Failed to apply to league')).toHaveCount(0)

      // UI assertion 2 (P-48 fix): the applicant now SEES their own pending
      // application. Previously dead: `list_pending_for_user`
      // (api/crates/portal-db/src/adapters/league.rs) filtered
      // `invitation_type = 'invite'`, so `myApplications` (stores/leagues.ts)
      // stayed empty and this alert (LeagueDetailPage.vue:99-102) could never
      // render. `applyToLeague` refetches applications, `hasPendingApplication`
      // recomputes, and the "Apply to Join" CTA is replaced by the pending
      // notice WITHOUT a reload.
      await expect(
        applicantPage.getByText('Your application is pending review by a league admin.'),
      ).toBeVisible({ timeout: 10_000 })
      await expect(applicantPage.getByRole('button', { name: 'Apply to Join' })).toHaveCount(0)

      // UI assertion 3 (P-48): the pending state is server-derived — it
      // survives a reload rather than being transient local store state.
      await openLeaguePage(applicantPage, league.leagueId)
      await expect(
        applicantPage.getByText('Your application is pending review by a league admin.'),
      ).toBeVisible({ timeout: 10_000 })

      // Applying is NOT joining: still no membership banner, still no CTA.
      await expect(membershipBanner(applicantPage)).toHaveCount(0)
      await expect(applicantPage.getByRole('button', { name: 'Create Team' })).toHaveCount(0)

      // Backend assertion: a pending application carrying the typed message.
      const applications = await listLeagueApplications(adminToken, league.leagueId)
      const application = applications.find((a) => a.user_id === applicant.userId)
      expect(application, 'application should be pending on the backend').toBeDefined()
      expect(application!.message).toBe(message)
      expect(application!.invitation_type).toBe('application')
      expect(application!.status).toBe('pending')

      // Nobody is a member yet.
      const beforeApproval = await listLeagueMembers(adminToken, league.leagueId)
      expect(beforeApproval.find((m) => m.user_id === applicant.userId)).toBeUndefined()

      // --- the other side: a league admin approves through the admin UI ---
      const adminPage = await adminContext.newPage()
      await loginAsAdmin(adminPage)
      await adminPage.goto('/admin/leagues')
      await adminPage.waitForLoadState('networkidle')

      // The per-game tables paginate at 10 rows, so narrow by search first
      // (same approach as league-season.spec.ts).
      await adminPage.getByRole('textbox', { name: /Search leagues/i }).fill(league.leagueName)
      const leagueRow = adminPage.locator('tr').filter({ hasText: league.leagueName })
      await expect(leagueRow).toBeVisible()
      await leagueRow.locator('button[title="Manage Members"]').click()

      const membersModal = adminPage.locator('.v-overlay--active', {
        hasText: `Manage Members: ${league.leagueName}`,
      })
      await expect(membersModal).toBeVisible()
      await membersModal.getByRole('tab', { name: /Applications/ }).click()

      // The application is listed by its message (the table shows a truncated
      // user id, not a name).
      const applicationRow = membersModal.locator('tr').filter({ hasText: message })
      await expect(applicationRow).toBeVisible({ timeout: 10_000 })
      await applicationRow.getByRole('button', { name: 'Approve application' }).click()

      await expect(
        adminPage.locator('.v-snackbar').getByText('Application approved'),
      ).toBeVisible()
      await expect(membersModal.locator('tr').filter({ hasText: message })).toHaveCount(0)

      // --- back to the applicant: they are in ---
      await openLeaguePage(applicantPage, league.leagueId)
      await expect(membershipBanner(applicantPage)).toBeVisible({ timeout: 10_000 })
      await expect(
        applicantPage.getByText('This league requires an application to join.'),
      ).toHaveCount(0)
      await expect(applicantPage.getByRole('button', { name: 'Create Team' }).first()).toBeVisible()

      // Backend: membership created, application no longer pending.
      const members = await listLeagueMembers(adminToken, league.leagueId)
      const membership = members.find((m) => m.user_id === applicant.userId)
      expect(membership, 'approved applicant should be a league member').toBeDefined()
      expect(membership!.membership_type).toBe('member')

      const stillPending = await listLeagueApplications(adminToken, league.leagueId)
      expect(stillPending.find((a) => a.user_id === applicant.userId)).toBeUndefined()
    } finally {
      await applicantContext.close()
      await adminContext.close()
    }
  })

  test('an INVITE_ONLY league offers no self-service way in, and the API refuses one', async ({
    browser,
  }) => {
    const adminToken = await getAdminToken()
    const league = await createLeagueWithAccessType(adminToken, 'invite_only')
    const outsider: RosterUser = await registerAsRosterUser()

    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await loginAsUser(page, { email: outsider.email, password: outsider.password })
      await openLeaguePage(page, league.leagueId)

      // Neither join affordance is rendered — the page is a dead end that
      // points at a human (LeagueDetailPage.vue:120-123).
      await expect(page.getByText('This league is invite-only.')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('button', { name: 'Join League' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Apply to Join' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Create Team' })).toHaveCount(0)

      // The missing button is not merely cosmetic: the backend refuses the
      // join it would have sent (`LeagueService::join_league`,
      // portal-domain/src/services/league.rs:212-218 → DomainError::LeagueInviteOnly).
      const joinResp = await fetch(`${API_URL}/v1/leagues/${league.leagueId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${outsider.token}` },
      })
      expect(joinResp.status).toBe(400)

      // And nothing was created behind the UI's back.
      const members = await listLeagueMembers(adminToken, league.leagueId)
      expect(members.find((m) => m.user_id === outsider.userId)).toBeUndefined()
    } finally {
      await context.close()
    }
  })
})
