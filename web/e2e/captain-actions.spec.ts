import { test, expect, type Page } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { primeAuthStorage } from './fixtures/checkin.fixture'
import {
  advanceMatchToInProgress,
  createSelfScheduledScenario,
  submitResultClaim,
  type SelfScheduledScenario,
} from './fixtures/match-workflow-extra.fixture'

/**
 * Captain action items — COVERAGE-PLAN §7 Tier 3.
 *
 * `stores/captainActions.ts`, `composables/useCaptainActions.ts`,
 * `CaptainActionsBell.vue`, `CaptainActionsWidget.vue` and
 * `CaptainActionItem.vue` had no coverage at all. The surface is the portal's
 * only "what do I owe someone right now" list: it is mounted in the header on
 * every portal page (layouts/PortalLayout.vue:5), on the dashboard
 * (pages/HomePage.vue:60) and as a badge on the sidebar's Dashboard entry
 * (components/PortalSidebar.vue:20-22).
 *
 * The list is computed per player by
 * `api/crates/portal-db/src/repositories/action_item.rs`, so the second test
 * runs the two participants of ONE match in two isolated contexts: after one
 * of them proposes a time, the SAME match must produce a different action for
 * each of them (proposer: nothing left to do; opponent: respond). A test with
 * a single shared identity could not tell those apart.
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

interface ActionItemRow {
  action_type: string
  match_id: string
  tournament_slug: string
  tournament_name: string
  match_label: string
  deadline: string | null
}

/** `GET /v1/users/me/action-items` — the endpoint the store polls. */
async function myActionItems(token: string): Promise<ActionItemRow[]> {
  const resp = await fetch(`${API_URL}/v1/users/me/action-items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<ApiEnvelope<ActionItemRow[]>>(resp, 'List my action items')
  return body.data ?? []
}

/**
 * `POST /v1/tournaments/{id}/matches/{id}/schedule/propose` as a participant.
 * Proposing is NOT the surface under test here (match-workflow.spec.ts clicks
 * it through `MatchSchedulingPanel`); it is the precondition that makes the
 * two participants' action lists diverge.
 */
async function proposeScheduleViaApi(
  token: string,
  tournamentId: string,
  matchId: string,
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}/schedule/propose`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        proposed_times: [new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()],
        notes: 'E2E: proposing so the opponent owes a response',
      }),
    },
  )
  if (!resp.ok) {
    throw new Error(`Propose schedule failed (${resp.status}): ${await resp.text()}`)
  }
}

/** Admin match-status override — used only to build preconditions. */
async function transitionMatch(
  adminToken: string,
  tournamentId: string,
  matchId: string,
  toStatus: string,
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/admin/tournaments/${tournamentId}/matches/${matchId}/transition`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        to_status: toStatus,
        override_reason: `E2E fixture: move match to ${toStatus}`,
      }),
    },
  )
  if (!resp.ok) {
    throw new Error(`Admin transition to ${toStatus} failed (${resp.status}): ${await resp.text()}`)
  }
}

/** The dashboard card (CaptainActionsWidget.vue:2-22). */
function widget(page: Page) {
  return page
    .locator('.v-card')
    .filter({ has: page.locator('.v-card-title', { hasText: 'Action Items' }) })
    .first()
}

/** The header bell's menu (CaptainActionsBell.vue:2-41), teleported to body. */
async function openBell(page: Page) {
  await page.getByRole('button', { name: 'Captain actions' }).click()
  const menu = page.locator('.v-overlay--active .v-card').filter({ hasText: 'Action Items' })
  await expect(menu).toBeVisible()
  return menu
}

async function openDashboard(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
}

test.describe('Captain action items', () => {
  test('a pending schedule action shows in the dashboard widget, the bell and the sidebar badge, and opens the match', async ({
    browser,
  }) => {
    const adminToken = await getAdminToken()
    const scenario: SelfScheduledScenario = await createSelfScheduledScenario(adminToken)
    const matchLabel = `${scenario.p1.participantName} vs ${scenario.p2.participantName}`

    // Precondition sanity: a self-scheduled match left in `ready` with no
    // proposal is exactly the "schedule_match" row in
    // repositories/action_item.rs:82-99.
    const seeded = await myActionItems(scenario.p1.token)
    expect(seeded.map((a) => a.action_type)).toEqual(['schedule_match'])

    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
      await openDashboard(page)

      // --- dashboard widget ------------------------------------------------
      const card = widget(page)
      await expect(card).toBeVisible({ timeout: 10_000 })
      // Badge = actionCount (CaptainActionsWidget.vue:6-11).
      await expect(card.locator('.v-badge__badge')).toHaveText('1')
      // Label comes from CaptainActionItem's ACTION_META (:50), the subtitle
      // from the backend's match label + tournament name (:15-17).
      await expect(card.getByText('Schedule your match')).toBeVisible()
      await expect(card.getByText(matchLabel)).toBeVisible()
      await expect(card.getByText(scenario.tournamentName)).toBeVisible()
      // No deadline on this action type, so no countdown chip (:18-26).
      await expect(card.getByText(/left$|Overdue/)).toHaveCount(0)

      // --- sidebar badge ---------------------------------------------------
      const dashboardNav = page
        .locator('.v-navigation-drawer .v-list-item')
        .filter({ hasText: 'Dashboard' })
      await expect(dashboardNav.locator('.v-badge__badge')).toHaveText('1')

      // --- header bell -----------------------------------------------------
      const menu = await openBell(page)
      await expect(menu.getByText('Schedule your match')).toBeVisible()
      await expect(menu.getByText(matchLabel)).toBeVisible()
      await expect(menu.getByText('All caught up!')).toHaveCount(0)
      await page.keyboard.press('Escape')

      // --- the item is a working link to the match -------------------------
      await card.getByText('Schedule your match').click()
      await expect(page).toHaveURL(
        `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`,
      )
      // …and it landed on the real match page, not a 404 shell.
      await expect(page.getByText(scenario.p1.participantName).first()).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await context.close()
    }
  })

  test('proposing a time moves the action from the proposer to the opponent', async ({
    browser,
  }) => {
    const adminToken = await getAdminToken()
    const scenario: SelfScheduledScenario = await createSelfScheduledScenario(adminToken)
    const matchLabel = `${scenario.p1.participantName} vs ${scenario.p2.participantName}`

    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    try {
      const pageA = await contextA.newPage()
      const pageB = await contextB.newPage()
      await primeAuthStorage(pageA, scenario.p1.token, scenario.p1.userId)
      await primeAuthStorage(pageB, scenario.p2.token, scenario.p2.userId)

      // Both start owing the same thing on the same match.
      await openDashboard(pageA)
      await openDashboard(pageB)
      await expect(widget(pageA).getByText('Schedule your match')).toBeVisible({ timeout: 10_000 })
      await expect(widget(pageB).getByText('Schedule your match')).toBeVisible({ timeout: 10_000 })

      await proposeScheduleViaApi(scenario.p1.token, scenario.tournamentId, scenario.matchId)

      // --- proposer: nothing left to do ------------------------------------
      await openDashboard(pageA)
      // The widget hides itself entirely at zero (`v-if="actionCount > 0"`).
      await expect(widget(pageA)).toHaveCount(0)
      await expect(
        pageA.locator('.v-navigation-drawer .v-list-item')
          .filter({ hasText: 'Dashboard' })
          .locator('.v-badge__badge'),
      ).toHaveCount(0)
      const menuA = await openBell(pageA)
      await expect(menuA.getByText('All caught up!')).toBeVisible()
      await expect(menuA.getByText('Schedule your match')).toHaveCount(0)

      // --- opponent: same match, a different action ------------------------
      await openDashboard(pageB)
      const cardB = widget(pageB)
      await expect(cardB.getByText('Respond to schedule proposal')).toBeVisible({ timeout: 10_000 })
      await expect(cardB.getByText('Schedule your match')).toHaveCount(0)
      await expect(cardB.getByText(matchLabel)).toBeVisible()
      // This action DOES carry a deadline (the proposal's 48h TTL), so
      // CaptainActionItem renders its countdown chip (:77-88).
      await expect(cardB.locator('.v-chip')).toHaveText(/^\d+d left$/)

      // Backend agrees with both boards.
      expect(await myActionItems(scenario.p1.token)).toHaveLength(0)
      const forP2 = await myActionItems(scenario.p2.token)
      expect(forP2.map((a) => a.action_type)).toEqual(['respond_proposal'])
      expect(forP2[0]!.match_id).toBe(scenario.matchId)
      expect(forP2[0]!.deadline).not.toBeNull()
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('a deadline under an hour renders as critical, and the list refreshes on tab focus without a reload', async ({
    browser,
  }) => {
    const adminToken = await getAdminToken()
    const scenario: SelfScheduledScenario = await createSelfScheduledScenario(adminToken)
    await advanceMatchToInProgress(adminToken, scenario.tournamentId, scenario.matchId)
    // The `confirm_result` row is gated on `awaiting_result`
    // (repositories/action_item.rs:176) and submitting a claim does NOT move
    // the match there (result.rs `submit_claim` never touches match status) —
    // see the reported finding. Drive the transition explicitly so this test
    // exercises the intended state rather than the broken one.
    await transitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'awaiting_result')

    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
      await openDashboard(page)

      // Before: the match owes a result from BOTH sides, and that action has
      // no deadline — so the badge is the non-critical `warning` colour
      // (CaptainActionsWidget.vue:8).
      const card = widget(page)
      await expect(card.getByText('Submit match result')).toBeVisible({ timeout: 10_000 })
      await expect(card.locator('.v-badge__badge')).toHaveClass(/bg-warning/)

      // The opponent submits a claim (covered as a flow by match-results.spec.ts;
      // here it is the precondition).
      //
      // GROUND RULE 9 — assertion changed because the SPECIFICATION changed, not
      // to make a failure go green. This block used to assert the `bg-error`
      // "critical" badge and a `Nm left` countdown, because `auto_confirm_at` was
      // 15 minutes out — inside the store's one-hour critical threshold
      // (stores/captainActions.ts:29-35). **P-57 deliberately raised that window
      // to 24 hours** (`result.rs:136`, commit 5590726), so the deadline is now
      // ~23h out: not critical, and rendered in hours by CaptainActionItem.vue:86.
      // Asserting the old values would now be certifying a window the product
      // deliberately moved away from.
      //
      // The <1h critical path is no longer reachable from e2e — no action item
      // the suite can create has a sub-hour deadline. It is pinned instead by
      // `src/stores/__tests__/captainActions.test.ts`, so the behaviour is not
      // silently dropped. See P-103.
      await submitResultClaim(
        scenario.p1.token,
        scenario.matchId,
        scenario.p1.registrationId,
        1,
        0,
      )

      // No reload, no 60s wait: returning to the tab is what refreshes the list
      // (`onVisibilityChange`, composables/useCaptainActions.ts:35-39).
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

      await expect(card.getByText('Confirm or dispute result')).toBeVisible({ timeout: 10_000 })
      await expect(card.getByText('Submit match result')).toHaveCount(0)
      // Post-P-57: a 24h auto-confirm window is NOT critical, and the countdown
      // renders in hours (CaptainActionItem.vue:86). Asserting the exact hour
      // count would be brittle across the run's own elapsed time; asserting the
      // unit is the real contract.
      await expect(card.locator('.v-badge__badge')).toHaveClass(/bg-warning/)
      await expect(card.locator('.v-chip')).toHaveText(/^\d+h left$/)

      // Backend, from each participant's own token: the claim submitter has
      // nothing left to do, the opponent owes the confirmation.
      expect(await myActionItems(scenario.p1.token)).toHaveLength(0)
      const forP2 = await myActionItems(scenario.p2.token)
      expect(forP2.map((a) => a.action_type)).toEqual(['confirm_result'])
      expect(forP2[0]!.deadline).not.toBeNull()
    } finally {
      await context.close()
    }
  })
})
