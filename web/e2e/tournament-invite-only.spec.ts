import { test, expect, type Page } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { uniqueId, CS2_MAP_POOL } from './fixtures/test-data'
import { createLeagueSeasonScenario } from './fixtures/league-season-extra.fixture'
import { createTeamWithMembers, loginAsUser, type RosterUser } from './fixtures/team-roster.fixture'
import { listRegistrations } from './fixtures/team-tournament-extra.fixture'

/**
 * P-27 / P-47 — `invite_only` tournaments, end to end through the product.
 *
 * WHAT WAS BROKEN
 * ---------------
 * P-27 (API, fixed in `c3e0949`): `register_team` / `register_player` checked
 * only `is_registration_open()`, so `registration_type: 'invite_only'` behaved
 * exactly like `approval` — anybody could enter.
 *
 * P-47 (web, fixed here): that fix left the frontend unaware the feature
 * exists, which made the product *worse* than before:
 *   1. `TournamentRegistrationCard.canRegister` keyed only off
 *      `is_registration_open`, so an uninvited captain was shown the plain
 *      "Register Team" call to action and only discovered they could not
 *      enter after submitting it (the P-8 dead-end family).
 *   2. There was no organiser UI to hand out invitations at all, so a closed
 *      event could not be run through the product — only through curl.
 *
 * WHAT THESE TESTS DRIVE
 * ----------------------
 * Both surfaces, through the real UI: the organiser's invite panel
 * (`OrganizerToolbar` → `TournamentInvitationsModal`) issues and revokes, and
 * the captain-facing `TournamentRegistrationCard` / `TeamRegistrationModal`
 * consume the result. No invitation here is seeded over HTTP — every one is
 * created by clicking.
 *
 * FINDING (recorded, not worked around) — the invite state is NOT knowable by
 * the invitee. All three invitation endpoints require
 * `tournament.participants.manage`
 * (api/crates/portal-api/src/handlers/tournaments/registration.rs:118, :180,
 * :225) and no field on `TournamentResponse` carries the viewer's own
 * invitation, so the frontend cannot distinguish an invited captain from an
 * uninvited one. Leagues have the invitee-side view tournaments lack
 * (`GET /v1/users/me/league-invitations`). Consequence: the card can withhold
 * the *unconditional* "Register Team" affordance and state the precondition
 * up front, but it cannot hard-block the uninvited — the final refusal is
 * still the API's 403. The revoke test below asserts exactly that residual
 * behaviour rather than pretending it is gone.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** 5v5 — matches the team size used by the other team specs. */
const TEAM_SIZE = 5

interface ApiResult<T> {
  data: T
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

interface InviteOnlyScenario {
  tournamentId: string
  tournamentSlug: string
  tournamentName: string
  captain: RosterUser
  teamName: string
  teamSeasonId: string
}

/**
 * League (open) + season in `registration` + a one-person team whose owner is
 * its captain + a league/season-scoped TEAM tournament with
 * `registration_type: 'invite_only'`, published and open for registration.
 *
 * Built here rather than in a fixture because `e2e/fixtures/**` is owned by
 * another workstream.
 */
async function createInviteOnlyScenario(adminToken: string): Promise<InviteOnlyScenario> {
  const ls = await createLeagueSeasonScenario(adminToken)
  const roster = await createTeamWithMembers({
    leagueId: ls.leagueId,
    seasonId: ls.seasonId,
    memberCount: 0,
    teamNamePrefix: 'E2E Invite Team',
  })

  const suffix = uniqueId()
  const tournamentName = `E2E Invite Only ${suffix}`
  const tournamentSlug = `e2e-invite-only-${suffix}`

  const createResp = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: tournamentName,
      slug: tournamentSlug,
      game_id: ls.gameId,
      format: 'single_elimination',
      map_pool: CS2_MAP_POOL,
      participant_type: 'team',
      team_size: TEAM_SIZE,
      min_participants: 2,
      max_participants: 8,
      registration_type: 'invite_only',
      scheduling_mode: 'live',
      default_match_format: 'bo1',
      league_id: ls.leagueId,
      season_id: ls.seasonId,
      description: 'Invite-only enforcement coverage for E2E (P-27/P-47)',
    }),
  })
  const created = await jsonOrThrow<ApiResult<{ id: string; slug: string }>>(
    createResp,
    'Create invite-only tournament',
  )

  for (const action of ['publish', 'open-registration']) {
    const resp = await fetch(`${API_URL}/v1/tournaments/${created.data.id}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (!resp.ok) {
      throw new Error(`Tournament ${action} failed (${resp.status}): ${await resp.text()}`)
    }
  }

  return {
    tournamentId: created.data.id,
    tournamentSlug: created.data.slug,
    tournamentName,
    captain: roster.owner,
    teamName: roster.teamName,
    teamSeasonId: roster.teamSeasonId,
  }
}

/** The `TournamentRegistrationCard` root — same locator as tournament-team.spec.ts. */
function registrationCard(page: Page) {
  return page
    .locator('.v-card')
    .filter({
      hasText:
        /Join This Tournament|Invitation Required|Registration Pending|You're Registered|Check-in Now Open|You're All Set!|Registration Opens Soon|Registration Closed/,
    })
    .first()
}

async function openTournament(page: Page, scenario: InviteOnlyScenario): Promise<void> {
  await page.goto(`/tournaments/${scenario.tournamentSlug}`)
  await expect(page.getByRole('heading', { name: scenario.tournamentName })).toBeVisible({
    timeout: 15_000,
  })
}

/** The invite panel's row for `scenario`'s team. */
function invitationRow(page: Page, scenario: InviteOnlyScenario) {
  return page
    .getByTestId('invitations-table')
    .locator('tr')
    .filter({ hasText: scenario.teamName })
}

/**
 * Organiser path: open the invite panel from the organiser toolbar and invite
 * `scenario`'s team by picking it out of the season's team list.
 */
async function inviteTeamThroughUi(page: Page, scenario: InviteOnlyScenario): Promise<void> {
  await page.getByTestId('manage-invitations').click()

  const modal = page.getByTestId('invitations-modal')
  await expect(modal).toBeVisible()
  await expect(modal.getByTestId('invitations-empty')).toBeVisible()

  await modal.getByTestId('invite-team-select').click()
  await page.getByRole('option', { name: new RegExp(scenario.teamName) }).click()
  await modal.getByTestId('send-invitation').click()

  // The new invitation shows in the panel's list, pending.
  const row = invitationRow(page, scenario)
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(row.locator('.v-chip')).toHaveText('pending')
}

/** Captain path: take the invite-only affordance through to a submitted registration. */
async function submitTeamRegistration(
  page: Page,
  scenario: InviteOnlyScenario,
  participantName: string,
): Promise<void> {
  await registrationCard(page).getByTestId('register-with-invitation').click()

  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  await modal
    .locator('.v-card--variant-outlined')
    .filter({ hasText: scenario.teamName })
    .first()
    .click()

  const displayName = modal.getByLabel('Display Name')
  await expect(displayName).toHaveValue(scenario.teamName)
  await displayName.fill(participantName)

  await modal.getByRole('button', { name: 'Register Team' }).click()
}

test.describe('Invite-only tournament registration', () => {
  test('warns an uninvited captain before they submit, instead of after', async ({ page }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    const scenario = await createInviteOnlyScenario(adminToken)
    await loginAsUser(page, scenario.captain)
    await openTournament(page, scenario)

    const card = registrationCard(page)

    // The card names the gate up front...
    await expect(card.getByText('Invitation Required')).toBeVisible({ timeout: 15_000 })
    await expect(
      card.getByText('This tournament is invite only. Only teams the organiser has invited'),
    ).toBeVisible()

    // ...and the unconditional call to action — the one that used to promise
    // entry it could not deliver — is gone. What remains states its own
    // precondition.
    await expect(card.getByRole('button', { name: 'Register Team' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Register Now' })).toHaveCount(0)
    await expect(card.getByTestId('register-with-invitation')).toBeVisible()

    // Nothing was written: the captain was told, not submitted.
    expect(await listRegistrations(adminToken, scenario.tournamentId)).toHaveLength(0)
  })

  test('an organiser invites through the UI and the invited captain gets in', async ({ page }) => {
    test.setTimeout(180_000)

    const adminToken = await getAdminToken()
    const scenario = await createInviteOnlyScenario(adminToken)

    // 1. Organiser hands out the invitation by clicking, not by curl.
    await loginAsAdmin(page)
    await openTournament(page, scenario)
    await inviteTeamThroughUi(page, scenario)

    // 2. The invited captain registers through the normal captain flow.
    await loginAsUser(page, scenario.captain)
    await openTournament(page, scenario)

    const participantName = `Invited ${uniqueId()}`
    await submitTeamRegistration(page, scenario, participantName)

    await expect(
      page.locator('.v-snackbar').getByText('Team registered successfully!'),
    ).toBeVisible({ timeout: 15_000 })

    // An invitation is permission to enter, not the organiser's approval, so
    // the card shows the pending state exactly as `approval` does.
    const card = registrationCard(page)
    await expect(card.getByText('Registration Pending')).toBeVisible({ timeout: 15_000 })
    await expect(card.locator('.v-chip').filter({ hasText: 'Awaiting Approval' })).toBeVisible()

    const registrations = await listRegistrations(adminToken, scenario.tournamentId)
    expect(registrations).toHaveLength(1)
    expect(registrations[0].participant_name).toBe(participantName)
    expect(registrations[0].status).toBe('pending')
  })

  test('revoking through the UI closes the door again', async ({ page }) => {
    test.setTimeout(180_000)

    const adminToken = await getAdminToken()
    const scenario = await createInviteOnlyScenario(adminToken)

    // 1. Invite, then revoke — both through the organiser panel.
    await loginAsAdmin(page)
    await openTournament(page, scenario)
    await inviteTeamThroughUi(page, scenario)

    const row = invitationRow(page, scenario)
    await row.getByRole('button', { name: 'Revoke' }).click()

    const confirm = page.getByRole('dialog').filter({ hasText: 'Revoke Invitation' })
    await confirm.getByRole('button', { name: 'Revoke' }).click()

    await expect(row.locator('.v-chip')).toHaveText('revoked', { timeout: 15_000 })
    await expect(row.getByRole('button', { name: 'Revoke' })).toHaveCount(0)

    // 2. The revoked team is refused. The captain cannot be told before
    //    submitting (see the FINDING at the top of this file) — they meet the
    //    refusal where the API raises it, on the failure snackbar.
    await loginAsUser(page, scenario.captain)
    await openTournament(page, scenario)
    await submitTeamRegistration(page, scenario, `Revoked ${uniqueId()}`)

    await expect(
      page.locator('.v-snackbar').getByText('Failed to register team: Tournament is invite-only'),
    ).toBeVisible({ timeout: 15_000 })

    // And nothing was persisted — the door really is shut, not merely styled shut.
    expect(await listRegistrations(adminToken, scenario.tournamentId)).toHaveLength(0)
  })
})
