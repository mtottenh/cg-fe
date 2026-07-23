import { test, expect, type Page } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { uniqueId } from './fixtures/test-data'
import { createLeagueSeasonScenario } from './fixtures/league-season-extra.fixture'
import { invitePlayer } from './fixtures/team-member.fixture'
import {
  createTeamWithMembers,
  joinLeague,
  loginAsUser,
  registerAsRosterUser,
  type RosterUser,
  type TeamRosterScenario,
} from './fixtures/team-roster.fixture'

/**
 * `TeamDetailPage` apply / cancel-invitation — COVERAGE-PLAN §7 Tier 3.
 *
 * `handleApplyToTeam` (TeamDetailPage.vue:489) and `handleCancelInvitation`
 * (:476) were both untouched. Between them they are the second half of
 * "getting onto a roster": `team-management.spec.ts` covers a captain SENDING
 * an invite and `invitations.spec.ts` covers an invitee ANSWERING one, but
 * nothing covered a player asking to join, nor a captain withdrawing an
 * invitation they had already sent.
 *
 * Ground rules (§3): the action is clicked in the actor's own authenticated
 * session and both sides of it are checked. The applicant / captain and the
 * captain / invitee pairs are genuinely different identities in separate
 * browser contexts — a single shared identity would make the "the other side
 * sees it" assertions vacuous.
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

interface TeamInvitationRow {
  id: string
  player_id: string
  player_display_name?: string
  invitation_type: string
  status: string
  message?: string
  role: string
}

/** `GET /v1/league-team-seasons/{id}/invitations` — captain-only listing. */
async function listTeamInvitations(
  captainToken: string,
  teamSeasonId: string,
): Promise<TeamInvitationRow[]> {
  const resp = await fetch(`${API_URL}/v1/league-team-seasons/${teamSeasonId}/invitations`, {
    headers: { Authorization: `Bearer ${captainToken}` },
  })
  const body = await jsonOrThrow<ApiEnvelope<TeamInvitationRow[]>>(resp, 'List team invitations')
  return body.data ?? []
}

/** `GET /v1/league-team-invitations/me` — the invitee's own pending list. */
async function myTeamInvitations(token: string): Promise<TeamInvitationRow[]> {
  const resp = await fetch(`${API_URL}/v1/league-team-invitations/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<ApiEnvelope<TeamInvitationRow[]>>(resp, 'List my team invitations')
  return body.data ?? []
}

interface TeamMemberRow {
  player_id: string
  role: string
}

async function listTeamMembers(teamSeasonId: string): Promise<TeamMemberRow[]> {
  const resp = await fetch(`${API_URL}/v1/league-team-seasons/${teamSeasonId}/members`)
  const body = await jsonOrThrow<ApiEnvelope<TeamMemberRow[]>>(resp, 'List team members')
  return body.data ?? []
}

interface TeamScenario {
  adminToken: string
  leagueId: string
  seasonId: string
  team: TeamRosterScenario
}

/** Fresh open league + season in `registration` + a team owned by a fresh captain. */
async function buildTeamScenario(): Promise<TeamScenario> {
  const adminToken = await getAdminToken()
  const league = await createLeagueSeasonScenario(adminToken)
  const team = await createTeamWithMembers({
    leagueId: league.leagueId,
    seasonId: league.seasonId,
    memberCount: 0,
    teamNamePrefix: 'Join Target Team',
  })
  return { adminToken, leagueId: league.leagueId, seasonId: league.seasonId, team }
}

/** The captain-only "Pending Invitations" card (captain-sent invites). */
function invitationsCard(page: Page) {
  return page
    .locator('.v-card')
    .filter({ has: page.locator('.v-card-title', { hasText: 'Pending Invitations' }) })
    .first()
}

/**
 * P-49: the captain-only "Join Requests" card — player-sent requests, rendered
 * separately from invites with accept/decline affordances.
 */
function joinRequestsCard(page: Page) {
  return page.locator('[data-testid="join-requests-card"]')
}

test.describe('Team join requests', () => {
  test('a player applies to a team from the team page and the captain sees the request', async ({
    browser,
  }) => {
    const scenario = await buildTeamScenario()
    const applicant: RosterUser = await registerAsRosterUser()
    // Coming from the league page is the realistic route in; the join itself
    // is proven by league-join.spec.ts, so it is a precondition here.
    await joinLeague(applicant.token, scenario.leagueId)
    const message = `Let me in — ${uniqueId()}`

    const applicantContext = await browser.newContext()
    const captainContext = await browser.newContext()
    try {
      const applicantPage = await applicantContext.newPage()
      await loginAsUser(applicantPage, {
        email: applicant.email,
        password: applicant.password,
      })

      // Deep link WITHOUT ?season= — TeamDetailPage resolves the team's season
      // from its league (`resolveSeasonFromLeague`, :332-355), which is what
      // makes `canApplyToTeam` (:321-325) true for a non-member.
      await applicantPage.goto(`/teams/${scenario.team.teamId}`)
      await applicantPage.waitForLoadState('networkidle')

      // v-card-title renders a plain div, so this is a text match, not a heading.
      await expect(applicantPage.getByText(scenario.team.teamName)).toBeVisible({
        timeout: 10_000,
      })
      // A non-member gets the apply CTA and none of the member/captain ones.
      const applyButton = applicantPage.getByRole('button', { name: 'Apply to Join' })
      await expect(applyButton).toBeVisible()
      await expect(applicantPage.getByRole('button', { name: 'Leave Team' })).toHaveCount(0)
      await expect(applicantPage.getByRole('button', { name: 'Edit Team' })).toHaveCount(0)
      await expect(invitationsCard(applicantPage)).toHaveCount(0)

      await applyButton.click()

      const dialog = applicantPage.locator('.v-overlay--active')
      await expect(dialog.getByText(`Apply to Join ${scenario.team.teamName}`)).toBeVisible()
      await dialog.getByLabel('Message (optional)').fill(message)
      await dialog.getByRole('button', { name: 'Submit Application' }).click()

      // UI: the success snackbar and the closed dialog, both of which
      // `handleApplyToTeam` (:489-503) only reaches when the POST resolved.
      await expect(
        applicantPage.locator('.v-snackbar').getByText('Application submitted!'),
      ).toBeVisible()
      await expect(dialog).toHaveCount(0)

      // Backend: a pending REQUEST (not an invite) carrying the typed message.
      const pending = await listTeamInvitations(
        scenario.team.owner.token,
        scenario.team.teamSeasonId,
      )
      const request = pending.find((i) => i.player_id === applicant.playerId)
      expect(request, 'join request should be pending on the backend').toBeDefined()
      expect(request!.invitation_type).toBe('request')
      expect(request!.status.toLowerCase()).toBe('pending')
      expect(request!.message).toBe(message)

      // Applying is not joining — the roster is unchanged.
      const roster = await listTeamMembers(scenario.team.teamSeasonId)
      expect(roster.find((m) => m.player_id === applicant.playerId)).toBeUndefined()

      // The other side, in its own session: the captain's team page surfaces
      // the request in the dedicated "Join Requests" card with accept/decline —
      // NOT mislabelled as a "Pending Invitation" the captain can only cancel.
      const captainPage = await captainContext.newPage()
      await loginAsUser(captainPage, {
        email: scenario.team.owner.email,
        password: scenario.team.owner.password,
      })
      await captainPage.goto(
        `/teams/${scenario.team.teamId}?season=${scenario.team.teamSeasonId}`,
      )
      await captainPage.waitForLoadState('networkidle')

      // P-49: the request lands in the Join Requests card, and the captain-sent
      // "Pending Invitations" card does NOT claim it as one of theirs.
      const requestsCard = joinRequestsCard(captainPage)
      await expect(requestsCard).toBeVisible({ timeout: 10_000 })
      const requestRow = requestsCard
        .locator('.v-list-item')
        .filter({ hasText: applicant.displayName })
      await expect(requestRow).toBeVisible()
      await expect(invitationsCard(captainPage).getByText(applicant.displayName)).toHaveCount(0)

      // The captain's affordances are Accept / Decline (a request is answered,
      // not cancelled). Accept it.
      await expect(requestRow.getByRole('button', { name: 'Accept join request' })).toBeVisible()
      await expect(requestRow.getByRole('button', { name: 'Decline join request' })).toBeVisible()
      await requestRow.getByRole('button', { name: 'Accept join request' }).click()

      // UI: the snackbar from `handleAcceptRequest`, and the request drops out
      // of the card (which then disappears, having no more requests).
      await expect(
        captainPage.locator('.v-snackbar').getByText('Join request accepted'),
      ).toBeVisible()
      await expect(joinRequestsCard(captainPage)).toHaveCount(0)

      // UI: the applicant now appears on the roster the captain sees.
      const rosterCard = captainPage
        .locator('.v-card')
        .filter({ has: captainPage.locator('.v-card-title', { hasText: 'Roster' }) })
        .first()
      await expect(rosterCard.getByText(applicant.displayName)).toBeVisible({ timeout: 10_000 })

      // Backend: the applicant is really on the roster, and the request is no
      // longer pending.
      const rosterAfter = await listTeamMembers(scenario.team.teamSeasonId)
      expect(
        rosterAfter.find((m) => m.player_id === applicant.playerId),
        'accepted applicant is now a roster member',
      ).toBeDefined()
      const afterAccept = await listTeamInvitations(
        scenario.team.owner.token,
        scenario.team.teamSeasonId,
      )
      expect(afterAccept.find((i) => i.player_id === applicant.playerId)).toBeUndefined()
    } finally {
      await applicantContext.close()
      await captainContext.close()
    }
  })

  test('a captain cancels a pending invitation and it disappears from the invitee', async ({
    browser,
  }) => {
    const scenario = await buildTeamScenario()
    const invitee: RosterUser = await registerAsRosterUser()
    await joinLeague(invitee.token, scenario.leagueId)

    // Sending the invite is covered by team-management.spec.ts, so it is a
    // precondition — cancelling it is the action under test.
    const invitation = await invitePlayer(
      scenario.team.owner.token,
      scenario.seasonId,
      scenario.team.teamSeasonId,
      invitee.playerId,
    )
    expect(invitation, 'captain should be able to invite the player').not.toBeNull()

    const captainContext = await browser.newContext()
    const inviteeContext = await browser.newContext()
    try {
      // The invitee can see it before the cancellation — otherwise "it is gone
      // afterwards" would prove nothing.
      const inviteePage = await inviteeContext.newPage()
      await loginAsUser(inviteePage, { email: invitee.email, password: invitee.password })
      await inviteePage.goto('/invitations')
      await inviteePage.waitForLoadState('networkidle')
      const inviteeCard = inviteePage
        .locator('.v-card')
        .filter({ hasText: scenario.team.teamName })
        .first()
      await expect(inviteeCard).toBeVisible({ timeout: 10_000 })
      await expect(inviteeCard.getByRole('button', { name: 'Accept' })).toBeEnabled()

      // Captain cancels from their own team page.
      const captainPage = await captainContext.newPage()
      await loginAsUser(captainPage, {
        email: scenario.team.owner.email,
        password: scenario.team.owner.password,
      })
      await captainPage.goto(
        `/teams/${scenario.team.teamId}?season=${scenario.team.teamSeasonId}`,
      )
      await captainPage.waitForLoadState('networkidle')

      const card = invitationsCard(captainPage)
      await expect(card).toBeVisible({ timeout: 10_000 })
      const row = card.locator('.v-list-item').filter({ hasText: invitee.displayName })
      await expect(row).toBeVisible()
      await row.getByRole('button', { name: 'Cancel invitation' }).click()

      // UI assertion 1: the snackbar raised by `handleCancelInvitation` (:481).
      await expect(
        captainPage.locator('.v-snackbar').getByText('Invitation cancelled'),
      ).toBeVisible()

      // UI assertion 2: the row is dropped from the list without a reload
      // (stores/leagueTeams.ts:231) and the card falls back to its empty state.
      await expect(card.getByText(invitee.displayName)).toHaveCount(0)
      await expect(card.getByText('No pending invitations')).toBeVisible()

      // UI assertion 3: it stays gone after a reload — the DELETE really landed.
      await captainPage.reload()
      await captainPage.waitForLoadState('networkidle')
      await expect(invitationsCard(captainPage).getByText('No pending invitations')).toBeVisible({
        timeout: 10_000,
      })

      // The point of cancelling: the invitee can no longer accept. Their own
      // session, their own token.
      await inviteePage.reload()
      await inviteePage.waitForLoadState('networkidle')
      await expect(
        inviteePage.locator('.v-card').filter({ hasText: scenario.team.teamName }),
      ).toHaveCount(0)
      await expect(
        inviteePage.getByRole('heading', { name: 'No Pending Invitations' }),
      ).toBeVisible()

      expect(await myTeamInvitations(invitee.token)).toHaveLength(0)
      const stillPending = await listTeamInvitations(
        scenario.team.owner.token,
        scenario.team.teamSeasonId,
      )
      expect(stillPending.find((i) => i.player_id === invitee.playerId)).toBeUndefined()

      // And the cancellation did not sneak them onto the roster.
      const roster = await listTeamMembers(scenario.team.teamSeasonId)
      expect(roster.find((m) => m.player_id === invitee.playerId)).toBeUndefined()
    } finally {
      await captainContext.close()
      await inviteeContext.close()
    }
  })
})
