import { test, expect, type APIRequestContext } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import {
  createCheckInScenario,
  getMatch,
  primeAuthStorage,
  type CheckInScenario,
} from './fixtures/checkin.fixture'

/**
 * `MatchStatusTimeline` — the "Match Status" card on the match detail page.
 *
 * Its step list ran `pending → … → completed` and knew nothing about `forfeit`
 * or `disputed`, both of which are real backend statuses
 * (`TournamentMatchStatus`, api/crates/portal-core/src/types/tournament.rs:231;
 * `tournament_matches_check_status`, api/migrations/0030_create_tournaments.sql:369).
 * A forfeited or disputed match therefore matched NO step: nothing was marked
 * current and nothing was marked complete, so the whole timeline rendered as a
 * greyed-out list of things that apparently never happened.
 * See COVERAGE-PLAN.md §9c.
 *
 * This spec lives on its own because the surface it covers (the match-detail
 * status card) is not owned by any existing spec file.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

async function transitionMatch(
  adminToken: string,
  tournamentId: string,
  matchId: string,
  toStatus: string,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/v1/admin/tournaments/${tournamentId}/matches/${matchId}/transition`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        to_status: toStatus,
        override_reason: `E2E: drive the match to ${toStatus}`,
      }),
    },
  )
  if (!response.ok) {
    throw new Error(
      `Admin transition to ${toStatus} failed (${response.status}): ${await response.text()}`,
    )
  }
}

/** A fresh match (status `checking_in`) with two real participants. */
async function freshMatch(
  request: APIRequestContext,
  adminToken: string,
): Promise<CheckInScenario> {
  return createCheckInScenario(request, adminToken, { checkInRequired: true })
}

test.describe('Match status timeline', () => {
  test('a forfeited match highlights Forfeit as its current step', async ({ request, page }) => {
    const adminToken = await getAdminToken()
    const scenario = await freshMatch(request, adminToken)

    await transitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'forfeit')
    const match = await getMatch(request, adminToken, scenario.tournamentId, scenario.matchId)
    expect(match.status, 'the match must really be forfeited before the UI is asked').toBe('forfeit')

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    const timeline = page.getByTestId('match-stepper')
    await expect(timeline).toBeVisible({ timeout: 10000 })

    // The terminal outcome is the step the match is ON …
    await expect(timeline.locator('.step.current .step-title')).toHaveText('Forfeit')
    // … and everything that led up to it is behind the match, not pending.
    expect(await timeline.locator('.step.complete').count()).toBeGreaterThan(0)
  })

  test('a disputed match highlights Disputed as its current step', async ({ request, page }) => {
    const adminToken = await getAdminToken()
    const scenario = await freshMatch(request, adminToken)

    await transitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'in_progress')
    await transitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'awaiting_result')
    await transitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'disputed')
    const match = await getMatch(request, adminToken, scenario.tournamentId, scenario.matchId)
    expect(match.status, 'the match must really be disputed before the UI is asked').toBe('disputed')

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    const timeline = page.getByTestId('match-stepper')
    await expect(timeline).toBeVisible({ timeout: 10000 })

    await expect(timeline.locator('.step.current .step-title')).toHaveText('Disputed')
    expect(await timeline.locator('.step.complete').count()).toBeGreaterThan(0)
  })
})
