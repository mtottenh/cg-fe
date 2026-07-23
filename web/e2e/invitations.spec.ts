import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { uniqueId } from './fixtures/test-data'
import { getCs2Game } from './fixtures/awards.fixture'
import { advanceSeason, createSeason } from './fixtures/league-season-extra.fixture'
import { invitePlayer } from './fixtures/team-member.fixture'
import { createInvitationScenario } from './fixtures/team-management-extra.fixture'
import {
  loginAsUser,
  registerAsRosterUser,
  type RosterUser,
} from './fixtures/team-roster.fixture'

/**
 * `/invitations` — LEAGUE invitations (COVERAGE-PLAN §7 Tier 1).
 *
 * `InvitationsPage.handleAcceptLeague` (:233) and `handleDeclineLeague` (:245)
 * had no coverage at all: the team-invitation half of the page is driven by
 * `team-management.spec.ts` ("Team Invitation Lifecycle"), but nothing ever
 * rendered a league invitation, let alone clicked its buttons. For an
 * `invite_only` league this page is the ONLY way in — `LeagueDetailPage`
 * shows those users a dead-end "Contact a league admin" alert
 * (LeagueDetailPage.vue:115-119).
 *
 * Ground rules (§3): the invitation is SEEDED through the admin API (that is
 * the precondition), the accept/decline is CLICKED as the invitee in their own
 * authenticated session, and the outcome is asserted on the UI *and* on the
 * backend. Sender and receiver are genuinely different identities — the
 * invitee logs in with their own password, so a test that confused the two
 * could not pass.
 */

test.describe.configure({ timeout: 60_000 })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface ApiEnvelope<T> {
  data: T
}

async function jsonOrThrow<T>(resp: Response, context: string): Promise<T> {
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${context} failed (${resp.status}): ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

/**
 * `createLeague` in `league-season-extra.fixture.ts` hard-codes
 * `access_type: 'open'`, and shared fixtures are owned by another workstream,
 * so the invite-only variant is built locally. Invite-only is the case that
 * matters here: it is the only access type with no self-service join.
 */
async function createInviteOnlyLeague(
  adminToken: string,
): Promise<{ leagueId: string; leagueName: string }> {
  const suffix = uniqueId()
  const leagueName = `E2E Invite-Only League ${suffix}`
  const gameId = (await getCs2Game()).id

  const resp = await fetch(`${API_URL}/v1/leagues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: leagueName,
      slug: `e2e-invite-only-${suffix}`,
      game_id: gameId,
      description: `Invite-only league for the E2E league-invitation flow (${suffix})`,
      access_type: 'invite_only',
    }),
  })
  const body = await jsonOrThrow<ApiEnvelope<{ id: string }>>(resp, 'Create invite-only league')
  return { leagueId: body.data.id, leagueName }
}

/** `POST /v1/leagues/{league_id}/invitations` — league admin invites a user. */
async function inviteUserToLeague(
  adminToken: string,
  leagueId: string,
  userId: string,
  message: string,
): Promise<{ id: string }> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ user_id: userId, message }),
  })
  const body = await jsonOrThrow<ApiEnvelope<{ id: string }>>(resp, 'Invite user to league')
  return body.data
}

interface LeagueInvitationRow {
  id: string
  user_id: string
  status: string
  invitation_type: string
}

/** `GET /v1/leagues/{league_id}/invitations` — league admin view (all statuses). */
async function listLeagueInvitations(
  adminToken: string,
  leagueId: string,
): Promise<LeagueInvitationRow[]> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/invitations`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  // This endpoint returns a bare array, not a DataResponse envelope
  // (stores/leagues.ts:229-231 documents the same asymmetry).
  return jsonOrThrow<LeagueInvitationRow[]>(resp, 'List league invitations')
}

/** `GET /v1/users/me/league-invitations` — the invitee's own pending list. */
async function myLeagueInvitations(token: string): Promise<LeagueInvitationRow[]> {
  const resp = await fetch(`${API_URL}/v1/users/me/league-invitations`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return jsonOrThrow<LeagueInvitationRow[]>(resp, 'List my league invitations')
}

interface LeagueMemberRow {
  user_id: string
  membership_type: string
}

/**
 * `GET /v1/leagues/{league_id}/members`. Sent WITH the admin token even though
 * the handler currently requires no auth at all — see the reported finding on
 * that endpoint exposing member email addresses anonymously; when it is locked
 * down these cross-checks should keep working.
 */
async function listLeagueMembers(
  adminToken: string,
  leagueId: string,
): Promise<LeagueMemberRow[]> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/members`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return jsonOrThrow<LeagueMemberRow[]>(resp, 'List league members')
}

/**
 * A fresh invite-only league (with a season open for registration, so the
 * member-only "Create Team" CTA has something to attach to) plus a brand-new
 * player holding a pending invitation to it.
 */
async function seedLeagueInvitation(): Promise<{
  adminToken: string
  leagueId: string
  leagueName: string
  invitee: RosterUser
  message: string
}> {
  const adminToken = await getAdminToken()
  const { leagueId, leagueName } = await createInviteOnlyLeague(adminToken)
  const season = await createSeason(adminToken, leagueId)
  await advanceSeason(adminToken, season, 'registration')

  const invitee = await registerAsRosterUser()
  const message = `Join ${leagueName} — we saved you a slot`
  await inviteUserToLeague(adminToken, leagueId, invitee.userId, message)

  return { adminToken, leagueId, leagueName, invitee, message }
}

test.describe('League Invitations', () => {
  test('invited player accepts a league invitation and becomes a league member', async ({
    page,
  }) => {
    const { adminToken, leagueId, invitee, message } = await seedLeagueInvitation()

    await loginAsUser(page, { email: invitee.email, password: invitee.password })
    await page.goto('/invitations')
    await page.waitForLoadState('networkidle')

    // InvitationsPage.vue:28-89 — the league section only renders when the
    // store holds a pending `invite`-type invitation.
    const leagueHeading = page.getByRole('heading', { name: /League Invitations/ })
    await expect(leagueHeading).toBeVisible({ timeout: 10_000 })
    await expect(leagueHeading.locator('.v-chip')).toHaveText('1')

    // The card carries the inviter's message (:49-53). It is also the only
    // text that identifies WHICH league this is — see the report note on the
    // missing league name.
    const card = page.locator('.v-card').filter({ hasText: message }).first()
    await expect(card).toBeVisible()
    await expect(card.getByText('League Invitation')).toBeVisible()

    await card.getByRole('button', { name: 'Accept' }).click()

    // UI assertion 1: the snackbar raised by `handleAcceptLeague` (:237).
    await expect(page.locator('.v-snackbar').getByText('You have joined the league!')).toBeVisible()

    // UI assertion 2: the card is removed from the list (the store drops it,
    // stores/leagues.ts:182) and the page falls back to its empty state.
    await expect(page.locator('.v-card').filter({ hasText: message })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'No Pending Invitations' })).toBeVisible()

    // UI assertion 3 — the point of accepting: the league page now treats this
    // user as a member instead of showing the invite-only dead end
    // (LeagueDetailPage.vue:57-70 vs :115-119), and the member-only "Create
    // Team" CTA (:171-178) is offered.
    await page.goto(`/leagues/${leagueId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/You are a\s+member\s+of this league/)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText('This league is invite-only.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create Team' }).first()).toBeVisible()

    // Backend assertions: membership created, invitation no longer pending.
    const members = await listLeagueMembers(adminToken, leagueId)
    const membership = members.find((m) => m.user_id === invitee.userId)
    expect(membership, 'invitee should now be a league member').toBeDefined()
    expect(membership!.membership_type).toBe('member')

    expect(await myLeagueInvitations(invitee.token)).toHaveLength(0)
    // The admin listing is PENDING-only (`get_pending_by_league_authorized`,
    // portal-api/src/handlers/leagues.rs:613-616), so an answered invitation
    // simply disappears — there is no endpoint that reports its terminal
    // status. Membership above is what distinguishes accept from decline.
    const invitations = await listLeagueInvitations(adminToken, leagueId)
    expect(invitations.find((i) => i.user_id === invitee.userId)).toBeUndefined()
  })

  test('invited player declines a league invitation and stays outside the league', async ({
    page,
  }) => {
    const { adminToken, leagueId, invitee, message } = await seedLeagueInvitation()

    await loginAsUser(page, { email: invitee.email, password: invitee.password })
    await page.goto('/invitations')
    await page.waitForLoadState('networkidle')

    const card = page.locator('.v-card').filter({ hasText: message }).first()
    await expect(card).toBeVisible({ timeout: 10_000 })

    // NOTE: unlike the team-invitation decline (which routes through
    // ConfirmDialog, InvitationsPage.vue:274-290), `handleDeclineLeague` fires
    // immediately on click — there is no confirmation step to drive.
    await card.getByRole('button', { name: 'Decline' }).click()

    // UI assertion 1: the snackbar raised by `handleDeclineLeague` (:249).
    await expect(page.locator('.v-snackbar').getByText('League invitation declined')).toBeVisible()

    // UI assertion 2: card gone, empty state back.
    await expect(page.locator('.v-card').filter({ hasText: message })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /League Invitations/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'No Pending Invitations' })).toBeVisible()

    // UI assertion 3: the league still refuses them — the invite-only dead-end
    // alert, no membership banner, no member-only CTA.
    await page.goto(`/leagues/${leagueId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('This league is invite-only.')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/You are a\s+member\s+of this league/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create Team' })).toHaveCount(0)

    // Backend assertions: no membership, invitation marked declined.
    const members = await listLeagueMembers(adminToken, leagueId)
    expect(members.find((m) => m.user_id === invitee.userId)).toBeUndefined()

    expect(await myLeagueInvitations(invitee.token)).toHaveLength(0)
    // Pending-only listing (see the accept test) — the declined row is gone
    // from it. The absence of a membership above is what proves the decline
    // was honoured rather than silently accepted.
    const invitations = await listLeagueInvitations(adminToken, leagueId)
    expect(invitations.find((i) => i.user_id === invitee.userId)).toBeUndefined()
  })

  test('league and team invitations render as separate sections and accepting one leaves the other', async ({
    page,
  }) => {
    // The two sections have interdependent render conditions
    // (InvitationsPage.vue:92 shows the "Team Invitations" heading when EITHER
    // list is non-empty, and the empty state at :169-178 is gated on BOTH), so
    // the mixed state is worth driving explicitly.
    const adminToken = await getAdminToken()

    // Team invitation: a captain in an open league invites the player.
    const teamScenario = await createInvitationScenario(adminToken)
    const player = teamScenario.player2
    const teamInvite = await invitePlayer(
      teamScenario.team.owner.token,
      teamScenario.seasonId,
      teamScenario.team.teamSeasonId,
      player.playerId,
    )
    expect(teamInvite, 'captain should be able to invite the player').not.toBeNull()

    // League invitation: an unrelated invite-only league invites the same player.
    const { leagueId, leagueName } = await createInviteOnlyLeague(adminToken)
    const message = `Join ${leagueName} — we saved you a slot`
    await inviteUserToLeague(adminToken, leagueId, player.userId, message)

    await loginAsUser(page, { email: player.email, password: player.password })
    await page.goto('/invitations')
    await page.waitForLoadState('networkidle')

    const leagueHeading = page.getByRole('heading', { name: /League Invitations/ })
    const teamHeading = page.getByRole('heading', { name: /Team Invitations/ })
    await expect(leagueHeading).toBeVisible({ timeout: 10_000 })
    await expect(leagueHeading.locator('.v-chip')).toHaveText('1')
    await expect(teamHeading).toBeVisible()
    await expect(teamHeading.locator('.v-chip')).toHaveText('1')

    const leagueCard = page.locator('.v-card').filter({ hasText: message }).first()
    const teamCard = page.locator('.v-card').filter({ hasText: teamScenario.team.teamName }).first()
    await expect(leagueCard).toBeVisible()
    await expect(teamCard).toBeVisible()

    await leagueCard.getByRole('button', { name: 'Accept' }).click()
    await expect(page.locator('.v-snackbar').getByText('You have joined the league!')).toBeVisible()

    // Only the league card goes; the team invitation is untouched and still
    // actionable, and the empty state must NOT appear.
    await expect(page.locator('.v-card').filter({ hasText: message })).toHaveCount(0)
    await expect(leagueHeading).toHaveCount(0)
    await expect(teamCard).toBeVisible()
    await expect(teamCard.getByRole('button', { name: 'Accept' })).toBeEnabled()
    await expect(page.getByRole('heading', { name: 'No Pending Invitations' })).toHaveCount(0)

    // Backend: the league membership landed and the team invitation is still pending.
    const members = await listLeagueMembers(adminToken, leagueId)
    expect(members.find((m) => m.user_id === player.userId)).toBeDefined()

    const stillPending = await fetch(
      `${API_URL}/v1/league-team-seasons/${teamScenario.team.teamSeasonId}/invitations`,
      { headers: { Authorization: `Bearer ${teamScenario.team.owner.token}` } },
    ).then((r) => jsonOrThrow<ApiEnvelope<{ player_id: string; status: string }[]>>(r, 'List team invitations'))
    const pendingRow = stillPending.data.find((i) => i.player_id === player.playerId)
    expect(pendingRow, 'team invitation should still be pending').toBeDefined()
    expect(pendingRow!.status.toLowerCase()).toBe('pending')
  })
})
