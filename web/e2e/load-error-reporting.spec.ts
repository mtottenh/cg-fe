import { test, expect } from '@playwright/test'
import { registerAsRosterUser, loginAsUser } from './fixtures/team-roster.fixture'

/**
 * P-124, the page-level half — an alert bound to a whole-store `error` alias
 * that the page's own loads never write.
 *
 * `InvitationsPage` bound `leagueTeamsStore.error || leaguesStore.error`.
 * Those are computed aliases over `fetchMyTeamsState` and `fetchLeaguesState`
 * (`stores/leagueTeams.ts:55`, `stores/leagues.ts:27`) — and this page calls
 * NEITHER action. So the alert was not merely generic, it was **dead**: a
 * failed invitation load rendered nothing at all, and the user was shown an
 * empty "My Invitations" page. That is worse than a vague error, because an
 * empty list is a confident wrong answer ("you have no invitations") rather
 * than a visible failure. `MyLeagueTeamsPage` had the same shape, where an
 * empty "My Leagues" reads as "you are in no leagues".
 *
 * Forcing the failure with `page.route` is deliberate. The alternative — an
 * assertion that some real backend failure surfaces — has no way to make the
 * server fail on demand, and the defect is entirely in how the FRONTEND
 * routes an error it has already received. The interception fabricates
 * nothing about the app: it returns the API's own error envelope, with the
 * status and `detail` the real endpoint would send, and the assertion is that
 * the page shows that `detail` rather than swallowing it.
 */

const LOAD_FAILURE_DETAIL = 'Invitation service is temporarily unavailable'

test.describe('Failed page loads report the reason (P-124)', () => {
  test('a failed invitation load surfaces the backend reason instead of an empty page', async ({
    page,
  }) => {
    const user = await registerAsRosterUser()
    await loginAsUser(page, { email: user.email, password: user.password })

    // Fail the team-invitation load the way the API would, envelope and all.
    await page.route('**/v1/league-team-invitations/me', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Service Unavailable',
          status: 503,
          detail: LOAD_FAILURE_DETAIL,
        }),
      })
    })

    await page.goto('/invitations')

    // The page must say what went wrong. Before the fix nothing rendered here
    // at all — the alert was bound to two action states this page never runs.
    await expect(page.getByText(LOAD_FAILURE_DETAIL)).toBeVisible({ timeout: 10000 })

    // ...and it must still be an ERROR, not a silently empty page. The empty
    // state is what the user got instead, and it asserts the opposite of the
    // truth.
    await expect(page.getByText('No Pending Invitations')).toHaveCount(0)
  })

  test('a failed my-leagues load surfaces the reason on the teams page', async ({ page }) => {
    const user = await registerAsRosterUser()
    await loginAsUser(page, { email: user.email, password: user.password })

    // `MyLeagueTeamsPage` ran three loads and reported only the first
    // (`fetchMyTeams`, which its alias happened to point at). This fails the
    // THIRD one, which drives the "My Leagues" section — the leg whose failure
    // was completely invisible.
    await page.route('**/v1/users/me/leagues', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Service Unavailable',
          status: 503,
          detail: LOAD_FAILURE_DETAIL,
        }),
      })
    })

    await page.goto('/my-teams')

    await expect(page.getByText(LOAD_FAILURE_DETAIL)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("You're Not on Any Teams Yet")).toHaveCount(0)
  })
})
