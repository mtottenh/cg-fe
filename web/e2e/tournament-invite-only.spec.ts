import { test, expect, type Page } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { uniqueId, CS2_MAP_POOL } from './fixtures/test-data'
import { createLeagueSeasonScenario } from './fixtures/league-season-extra.fixture'
import { createTeamWithMembers, loginAsUser, type RosterUser } from './fixtures/team-roster.fixture'
import { listRegistrations } from './fixtures/team-tournament-extra.fixture'

/**
 * P-27 — `invite_only` tournaments must not accept anyone.
 *
 * WHAT WAS BROKEN
 * ---------------
 * `register_team` / `register_player`
 * (api/crates/portal-domain/src/services/tournament/service.rs) checked only
 * `is_registration_open()`. No invite concept existed for tournaments at all
 * — no table, no endpoint — so `registration_type: 'invite_only'` behaved
 * exactly like `approval`: anybody could register and an organiser had to
 * reject the ones they had not invited. Leagues have enforced the same
 * concept since migration 0022 (`league_invitations` →
 * `DomainError::LeagueInviteOnly`).
 *
 * WHAT THESE TESTS DRIVE
 * ----------------------
 * The captain-facing registration flow on `TournamentDetailPage`, through
 * `TeamRegistrationModal` — the same surface `tournament-team.spec.ts`
 * covers for open tournaments. The refusal is asserted where a user meets
 * it: the failure snackbar, whose copy is
 * `handleTeamRegister`'s fallback plus the backend detail
 * (TournamentDetailPage.vue:535, useActionFeedback.ts:42-49).
 *
 * FINDING (recorded, not worked around): the frontend has NO invite-only
 * awareness. `TournamentRegistrationCard.canRegister`
 * (src/components/tournament/TournamentRegistrationCard.vue:143-148) keys
 * only off `is_registration_open`, so an uninvited captain is still shown
 * "Register Team" and only learns they cannot enter after submitting. There
 * is also no organiser UI for handing out invitations — the invite list is
 * API-only (`POST /v1/tournaments/{id}/invitations`), which is why the
 * invited case below seeds the invitation over HTTP.
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
      description: 'Invite-only enforcement coverage for E2E (P-27)',
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

/** `POST /v1/tournaments/{id}/invitations` — organiser-only, API-only today. */
async function inviteTeamSeason(
  adminToken: string,
  tournamentId: string,
  teamSeasonId: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ team_season_id: teamSeasonId }),
  })
  await jsonOrThrow<ApiResult<{ id: string }>>(resp, 'Invite team season')
}

/** The `TournamentRegistrationCard` root — same locator as tournament-team.spec.ts. */
function registrationCard(page: Page) {
  return page
    .locator('.v-card')
    .filter({
      hasText:
        /Join This Tournament|Registration Pending|You're Registered|Check-in Now Open|You're All Set!|Registration Opens Soon|Registration Closed/,
    })
    .first()
}

/** Open the detail page as the captain and submit the team registration modal. */
async function submitTeamRegistration(
  page: Page,
  scenario: InviteOnlyScenario,
  participantName: string,
): Promise<void> {
  await page.goto(`/tournaments/${scenario.tournamentSlug}`)
  await expect(page.getByRole('heading', { name: scenario.tournamentName })).toBeVisible({
    timeout: 15_000,
  })

  await registrationCard(page).getByRole('button', { name: 'Register Team' }).click()

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
  test('refuses an uninvited captain in the UI and writes no registration', async ({ page }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    const scenario = await createInviteOnlyScenario(adminToken)
    await loginAsUser(page, scenario.captain)

    const participantName = `Uninvited ${uniqueId()}`
    await submitTeamRegistration(page, scenario, participantName)

    // The refusal reaches the user: the failure snackbar carries the curated
    // prefix plus the API detail ("Tournament is invite-only and you have no
    // invitation" — portal-api/src/error.rs, DomainError::TournamentInviteOnly
    // → 403).
    await expect(
      page.locator('.v-snackbar').getByText('Failed to register team: Tournament is invite-only'),
    ).toBeVisible({ timeout: 15_000 })

    // The card did NOT flip to a registered state — the captain is still
    // being offered the (futile) call to action.
    const card = registrationCard(page)
    await expect(card.getByText('Registration Pending')).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Register Team' })).toBeVisible()

    // And nothing was persisted: before P-27 this call returned one `pending`
    // row that an organiser had to notice and reject.
    expect(await listRegistrations(adminToken, scenario.tournamentId)).toHaveLength(0)
  })

  test('admits an invited team through the same UI flow', async ({ page }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    const scenario = await createInviteOnlyScenario(adminToken)
    await inviteTeamSeason(adminToken, scenario.tournamentId, scenario.teamSeasonId)
    await loginAsUser(page, scenario.captain)

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
})
