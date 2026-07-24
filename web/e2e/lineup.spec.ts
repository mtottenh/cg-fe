import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import {
  createCheckInScenario,
  checkInViaApi,
  primeAuthStorage,
  type CheckInScenario,
} from './fixtures/checkin.fixture'

const API_URL = process.env.E2E_API_URL || 'http://localhost:3000'

/** Declare a provisional lineup through the API (deterministic test setup). */
async function declareLineupViaApi(
  token: string,
  tournamentId: string,
  matchId: string,
  registrationId: string,
  playerIds: string[],
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}/lineup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ registration_id: registrationId, player_ids: playerIds, submit: true }),
    },
  )
  expect(resp.status, `declare lineup: ${await resp.text()}`).toBe(200)
}

/** The player id backing a registration (individual regs: players.id == users.id). */
function playerIdFor(scenario: CheckInScenario, side: 'p1' | 'p2'): string {
  return scenario[side].userId
}

/**
 * Phase F — the lineup feature driven through the real frontend.
 *
 * Setup (tournament, two participants, a match in `checking_in`) is done via
 * the backend API; the actions under test go through the UI. Two participants
 * use two independent auth identities (real tokens), primed into separate
 * browser contexts — the dev token is a single shared identity and cannot
 * represent an opponent.
 */
test.describe('Match lineups', () => {
  test('a captain declares a provisional lineup at check-in and it shows back', async ({
    request,
    page,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await createCheckInScenario(request, adminToken, { checkInRequired: true })

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)

    // The declaration panel renders inside the check-in card. Target it by
    // testid: `.v-card` matches every ancestor card (the panel nests inside the
    // check-in card), which is an ambiguous strict-mode match.
    const panel = page.getByTestId('lineup-declare-panel')
    await expect(panel).toBeVisible()

    // Individual registration => exactly one candidate. Select it and submit,
    // asserting the POST the UI fires.
    await panel.locator('.v-list-item').first().click()
    const declareResp = page.waitForResponse(
      (res) =>
        res.url().includes(`/matches/${scenario.matchId}/lineup`) &&
        res.request().method() === 'POST',
    )
    await panel.getByRole('button', { name: /Submit lineup/i }).click()
    const resp = await declareResp
    expect(resp.status()).toBe(200)

    // The declaration shows back: the panel's status chip flips to "submitted".
    await expect(panel.getByText('submitted', { exact: true })).toBeVisible()
  })

  test('the opponent sees the lineup only once it locks', async ({ request, browser }) => {
    const adminToken = await getAdminToken()
    const scenario = await createCheckInScenario(request, adminToken, { checkInRequired: true })

    // P1 declares a provisional lineup (via API for deterministic setup).
    await declareLineupViaApi(
      scenario.p1.token,
      scenario.tournamentId,
      scenario.matchId,
      scenario.p1.registrationId,
      [playerIdFor(scenario, 'p1')],
    )

    // The opponent (P2) opens the match in their own browser context.
    const p2Context = await browser.newContext()
    const p2Page = await p2Context.newPage()
    try {
      await primeAuthStorage(p2Page, scenario.p2.token, scenario.p2.userId)
      await p2Page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)

      const lineups = p2Page.locator('.v-card', { hasText: 'Lineups' })
      await expect(lineups).toBeVisible()
      // Unlocked: P1's lineup is withheld from the opponent.
      await expect(lineups.getByText('Hidden until the match starts')).toBeVisible()

      // Both check in -> the match starts -> the lineup locks (opponent-visible).
      await checkInViaApi(
        request,
        scenario.p1.token,
        scenario.tournamentId,
        scenario.matchId,
        scenario.p1.registrationId,
      )
      await checkInViaApi(
        request,
        scenario.p2.token,
        scenario.tournamentId,
        scenario.matchId,
        scenario.p2.registrationId,
      )

      await p2Page.reload()
      const lineupsAfter = p2Page.locator('.v-card', { hasText: 'Lineups' })
      await expect(lineupsAfter).toBeVisible()
      // Now visible: the "Hidden" notice is gone and P1's player row is shown.
      await expect(lineupsAfter.getByText('Hidden until the match starts')).toHaveCount(0)
      await expect(
        lineupsAfter.getByText(playerIdFor(scenario, 'p1'), { exact: false }),
      ).toBeVisible()
    } finally {
      await p2Context.close()
    }
  })
})
