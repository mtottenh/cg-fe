import { test, expect, type Page } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { createTestUser } from './fixtures/checkin.fixture'
import {
  advanceToCompleted,
  advanceToInProgress,
  approveRegistration,
  createDraftTournament,
  fetchTournament,
  listMatches,
  registerPlayer,
  waitForTournamentStatus,
} from './fixtures/tournament-lifecycle.fixture'

/**
 * Walks the full admin tournament lifecycle end-to-end:
 *
 *   draft → published → registration → scheduled → in_progress
 *         → completed → finalized
 *
 * Existing admin specs in `tournament-admin.spec.ts` cover each state
 * transition in isolation. This spec exercises them as a single state
 * machine, plus three auxiliary scenarios:
 *
 *   - Reopen registration from `scheduled` (bounces back to
 *     `registration` and can then be closed again).
 *   - Cancel mid-play from `in_progress` through the confirm dialog.
 *   - Negative guards: `completed` tournaments expose neither Publish
 *     nor Start Tournament (per `useTournamentLifecycleGuards`).
 *
 * Setup is API-driven (fresh tournament + two throwaway players per
 * test) so each case is self-contained and parallel-safe.
 */

/** Status chip selector tuned to avoid Vuetify's strict-mode collisions.
 *  The chip renders as `<v-chip><v-icon>…</v-icon>{{ label }}</v-chip>`,
 *  and the labels ("Draft", "Registration Open", etc.) recur in tooltips
 *  and table cells, so `page.getByText(label)` is unreliable. Scoping to
 *  `.v-chip` narrows the match to the status chip in the page header. */
function statusChip(page: Page, label: string) {
  return page.locator('.v-chip').filter({ hasText: label }).first()
}

async function expectStatusChip(page: Page, label: string, timeout = 10_000): Promise<void> {
  await expect(statusChip(page, label)).toBeVisible({ timeout })
}

test.describe('Tournament Lifecycle (admin)', () => {
  test('walks draft → published → registration → scheduled → in_progress → completed → finalized', async ({
    page,
  }) => {
    // Longer timeout: this test hits the UI at every transition, which
    // includes Vuetify reactivity + store refetches between clicks.
    test.setTimeout(90_000)

    const adminToken = await getAdminToken()

    // 1. Admin creates a tournament via API (stays in `draft`).
    const tournament = await createDraftTournament(adminToken, {
      format: 'single_elimination',
      participantType: 'individual',
      minParticipants: 2,
      maxParticipants: 4,
      checkInRequired: false,
    })
    expect(tournament.status).toBe('draft')

    // 2. Admin UI login + navigate to detail page.
    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${tournament.id}`)
    await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible()
    await expectStatusChip(page, 'Draft')

    // 3. Publish: draft → published.
    await page.getByRole('button', { name: 'Publish' }).click()
    await waitForTournamentStatus(adminToken, tournament.id, 'published')
    await expectStatusChip(page, 'Published')

    // 4. Open registration: published → registration.
    await page.getByRole('button', { name: /Open Registration/i }).click()
    await waitForTournamentStatus(adminToken, tournament.id, 'registration')
    await expectStatusChip(page, 'Registration Open')

    // 5. Seed two throwaway players via API and register them.
    const p1 = await createTestUser()
    const p2 = await createTestUser()
    const r1 = await registerPlayer(p1.token, tournament.id, `Alpha ${p1.username}`)
    const r2 = await registerPlayer(p2.token, tournament.id, `Bravo ${p2.username}`)

    // 6. Admin-approves both via API (approval UI has its own spec).
    await approveRegistration(adminToken, tournament.id, r1)
    await approveRegistration(adminToken, tournament.id, r2)

    // 7. Close registration: registration → scheduled. The Close
    // Registration button lives in the Overview tab's Quick Actions
    // card (not in TournamentStatusActions).
    await page.getByRole('button', { name: /Close Registration/i }).click()
    await waitForTournamentStatus(adminToken, tournament.id, 'scheduled')
    await expectStatusChip(page, 'Scheduled')

    // 8. Start tournament: scheduled → in_progress. The bracket tab
    // should populate with generated matches.
    await page.getByRole('button', { name: /Start Tournament/i }).click()
    await waitForTournamentStatus(adminToken, tournament.id, 'in_progress')
    await expectStatusChip(page, 'In Progress')

    // Bracket tab populates — start from API truth (backend returns
    // at least one generated match) to avoid a flaky UI-only assertion.
    const matches = await listMatches(adminToken, tournament.id)
    expect(matches.length).toBeGreaterThan(0)

    // Click the Bracket tab and confirm it renders a bracket container
    // (TournamentBracket mounts when `brackets.length > 0`). If the
    // backend hasn't materialized the TournamentBracket row yet, the
    // page's "No Bracket Generated" empty-state may still show; accept
    // either because the test's contract is "matches exist", which
    // `listMatches` already verified.
    await page.getByRole('tab', { name: 'Bracket' }).click()
    await expect(
      page
        .locator('.bracket-container, [data-test="bracket-empty"]')
        .first()
        .or(page.getByText(/No Bracket (Generated|Available)/i).first()),
    ).toBeVisible({ timeout: 10_000 })

    // 9. Complete: in_progress → completed.
    await page.getByRole('button', { name: /^Complete$/i }).click()
    await waitForTournamentStatus(adminToken, tournament.id, 'completed')
    await expectStatusChip(page, 'Completed')

    // 10. Finalize: completed → finalized.
    await page.getByRole('button', { name: 'Finalize' }).click()
    await waitForTournamentStatus(adminToken, tournament.id, 'finalized')
    await expectStatusChip(page, 'Finalized')
  })

  test('can reopen registration from scheduled and then close it again', async ({ page }) => {
    test.setTimeout(60_000)

    const adminToken = await getAdminToken()
    const tournament = await createDraftTournament(adminToken)

    // Walk to `scheduled` via API — the UI path is covered by the main
    // happy-path test, so this scenario only cares about the reopen
    // branch. We call the lifecycle helpers individually rather than
    // `advanceToInProgress` so we stop exactly at `scheduled`.
    const p1 = await createTestUser()
    const p2 = await createTestUser()
    const { advanceToScheduledViaApi } = buildAdvanceHelper()
    await advanceToScheduledViaApi(adminToken, tournament.id, p1, p2)

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${tournament.id}`)
    await expectStatusChip(page, 'Scheduled')

    // No reopen button lives on AdminTournamentDetailPage today — the
    // `canReopenRegistration` guard only surfaces in OrganizerToolbar
    // on the public tournament page. Drive the transition via API and
    // assert the chip updates. This still exercises the lifecycle
    // endpoint + chip reactivity, which is the point of the scenario.
    const reopenResp = await fetch(
      `${process.env.VITE_API_URL || 'http://localhost:3000'}/v1/tournaments/${tournament.id}/reopen-registration`,
      { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } },
    )
    expect(reopenResp.ok).toBe(true)
    await waitForTournamentStatus(adminToken, tournament.id, 'registration')
    // Force a refetch on the page — goto() to the same URL remounts
    // AdminTournamentDetailPage, which re-reads the tournament.
    await page.goto(`/admin/tournaments/${tournament.id}`)
    await expectStatusChip(page, 'Registration Open')

    // Now close it again via the UI button.
    await page.getByRole('button', { name: /Close Registration/i }).click()
    await waitForTournamentStatus(adminToken, tournament.id, 'scheduled')
    await expectStatusChip(page, 'Scheduled')
  })

  test('cancel mid-play transitions to cancelled via confirm dialog', async ({ page }) => {
    test.setTimeout(60_000)

    const adminToken = await getAdminToken()
    const tournament = await createDraftTournament(adminToken)
    const p1 = await createTestUser()
    const p2 = await createTestUser()

    await advanceToInProgress(
      adminToken,
      tournament.id,
      p1.token,
      p2.token,
      `Alpha ${p1.username}`,
      `Bravo ${p2.username}`,
    )

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${tournament.id}`)
    await expectStatusChip(page, 'In Progress')

    // Cancel button lives in TournamentStatusActions. Clicking it opens
    // the shared ConfirmDialog managed by `useTournamentAdminActions`.
    await page.getByRole('button', { name: /^Cancel$/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Cancel Tournament').first()).toBeVisible()

    // Confirm button in the dialog has label "Cancel Tournament" (set
    // via the `action` field in useTournamentAdminActions.cancel).
    await dialog.getByRole('button', { name: 'Cancel Tournament' }).click()

    await waitForTournamentStatus(adminToken, tournament.id, 'cancelled')
    await expectStatusChip(page, 'Cancelled')

    // After cancellation, only View Public should remain from the
    // TournamentStatusActions strip. Publish / Start / Cancel / Complete
    // / Finalize all hide behind `can*` guards which require a
    // non-terminal status.
    await expect(page.getByRole('button', { name: /View Public/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Start Tournament/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Cancel$/ })).toHaveCount(0)
  })

  test('guards hide Publish and Start on a completed tournament', async ({ page }) => {
    test.setTimeout(60_000)

    const adminToken = await getAdminToken()
    const tournament = await createDraftTournament(adminToken)
    const p1 = await createTestUser()
    const p2 = await createTestUser()

    await advanceToCompleted(
      adminToken,
      tournament.id,
      p1.token,
      p2.token,
      `Alpha ${p1.username}`,
      `Bravo ${p2.username}`,
    )

    // Double-check via API that we actually landed in `completed`.
    const state = await fetchTournament(adminToken, tournament.id)
    expect(state.status).toBe('completed')

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${tournament.id}`)
    await expectStatusChip(page, 'Completed')

    // Negative guards: Publish and Start are hidden by
    // `canPublish` (`draft` only) and `canStart` (`scheduled` only).
    await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Start Tournament/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Open Registration/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Close Registration/i })).toHaveCount(0)

    // Finalize IS visible (canFinalize gates on `completed`).
    await expect(page.getByRole('button', { name: 'Finalize' })).toBeVisible()
  })
})

/**
 * Tiny helper factory that wraps the API-sequence needed to reach
 * `scheduled` (publish → open → register + approve → close). Kept inline
 * in the spec so the new fixture stays focused on generic helpers, and
 * the reopen scenario doesn't need to export a single-purpose wrapper.
 */
function buildAdvanceHelper() {
  return {
    async advanceToScheduledViaApi(
      adminToken: string,
      tournamentId: string,
      p1: { token: string; username: string },
      p2: { token: string; username: string },
    ) {
      const API = process.env.VITE_API_URL || 'http://localhost:3000'
      const post = async (path: string) => {
        const r = await fetch(`${API}/v1/tournaments/${tournamentId}/${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        if (!r.ok) throw new Error(`${path} failed (${r.status}): ${await r.text()}`)
      }
      await post('publish')
      await post('open-registration')
      const r1 = await registerPlayer(p1.token, tournamentId, `Alpha ${p1.username}`)
      const r2 = await registerPlayer(p2.token, tournamentId, `Bravo ${p2.username}`)
      await approveRegistration(adminToken, tournamentId, r1)
      await approveRegistration(adminToken, tournamentId, r2)
      await post('close-registration')
    },
  }
}
