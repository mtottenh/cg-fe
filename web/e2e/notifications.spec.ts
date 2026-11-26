import { test, expect, type Page } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { primeAuthStorage } from './fixtures/checkin.fixture'
import {
  createSelfScheduledScenario,
  type SelfScheduledScenario,
} from './fixtures/match-workflow-extra.fixture'

/**
 * Player notifications (S-7): a schedule proposal notifies the opposing side.
 *
 * The proposer acts through the API (proposing itself is covered by
 * match-workflow.spec.ts); the opponent's browser is the surface under test:
 * the header bell shows an unread badge and the notification, and clicking it
 * opens the match and clears the unread state — in the bell and in the API.
 */

test.describe.configure({ timeout: 90_000 })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

async function proposeViaApi(token: string, tournamentId: string, matchId: string): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}/schedule/propose`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        proposed_times: [new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()],
        notes: 'E2E: proposing so the opponent is notified',
      }),
    },
  )
  if (!resp.ok) throw new Error(`Propose schedule failed (${resp.status}): ${await resp.text()}`)
}

async function unreadCount(token: string): Promise<number> {
  const resp = await fetch(`${API_URL}/v1/me/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`Unread count failed (${resp.status}): ${await resp.text()}`)
  const body = (await resp.json()) as { data: { unread_count: number } }
  return body.data.unread_count
}

function bellButton(page: Page) {
  return page.getByRole('button', { name: /^Notifications and action items/ })
}

async function openBell(page: Page) {
  await bellButton(page).click()
  const menu = page.locator('.v-overlay--active .v-card').filter({ hasText: 'Notifications' })
  await expect(menu).toBeVisible()
  return menu
}

test.describe('Notifications', () => {
  test('a schedule proposal notifies the opponent, and opening it reads it', async ({ browser }) => {
    const adminToken = await getAdminToken()
    const scenario: SelfScheduledScenario = await createSelfScheduledScenario(adminToken)

    await proposeViaApi(scenario.p1.token, scenario.tournamentId, scenario.matchId)
    await expect.poll(() => unreadCount(scenario.p2.token), { timeout: 10_000 }).toBe(1)
    // The proposer is not notified about their own proposal.
    expect(await unreadCount(scenario.p1.token)).toBe(0)

    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Badge: one unread notification (plus the "respond" action item).
      await expect(bellButton(page)).toHaveAccessibleName(/\(\d+ new\)/, { timeout: 15_000 })

      const menu = await openBell(page)
      const item = menu.locator('[data-testid="notification-item"]')
      await expect(item).toHaveCount(1)
      await expect(item).toContainText(scenario.p1.participantName)
      await expect(item.locator('[data-testid="notification-unread-dot"]')).toHaveCount(1)

      await item.click()
      await expect(page).toHaveURL(
        `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`,
      )

      // Read in the API…
      await expect.poll(() => unreadCount(scenario.p2.token), { timeout: 10_000 }).toBe(0)
      // …and in the bell.
      const again = await openBell(page)
      await expect(again.locator('[data-testid="notification-item"]')).toHaveCount(1)
      await expect(again.locator('[data-testid="notification-unread-dot"]')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})
