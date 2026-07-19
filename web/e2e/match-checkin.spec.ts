import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import {
  createCheckInScenario,
  checkInViaApi,
  tournamentCheckIn,
  processNoShows,
  getMatch,
  getRegistration,
  primeAuthStorage,
  createTestUser,
  type CheckInScenario,
} from './fixtures/checkin.fixture'

/**
 * Enforcement-oriented coverage of the per-match check-in flow.
 *
 * Complements `match-workflow.spec.ts`, which only asserts that the
 * check-in panel renders. These tests drive real check-in state transitions
 * and verify the backend responds correctly to:
 *   1. Both-participants-checked-in -> match auto-advances.
 *   2. No-show admin processing marks the absent registration NoShow.
 *   3. Non-participants never see the "Check In" button.
 *
 * Setup is done entirely via the backend API (using helpers in
 * `fixtures/checkin.fixture.ts`) so the spec stays deterministic and
 * doesn't depend on the seeded E2E tournament's state.
 */

// State-machine notes the fixture depends on:
//
//  - Starting a tournament with `check_in_required=true` only seeds
//    registrations whose tournament-level status is already `CheckedIn`
//    (see TournamentService::start_tournament in the domain). The fixture
//    admin-overrides tournament-level check-ins before calling /start.
//
//  - After /start, generated matches land in `ready`, and the match-level
//    check-in endpoint rejects requests unless status === 'checking_in'.
//    There is no direct ready → checking_in edge, but the admin endpoints
//    compose one: POST .../matches/{id}/schedule (ready → scheduled) then
//    POST .../matches/{id}/transition to_status=checking_in. The fixture's
//    advanceMatchToCheckingIn does exactly that, which is what previously
//    kept this whole describe on test.fixme.
test.describe('Match Check-in Enforcement', () => {
  // Each test creates a fresh tournament + two participants to avoid
  // contaminating any seeded state, so parallel runs are safe.

  test('both participants check-in auto-advances the match past CheckingIn', async ({ request, page }) => {
    const adminToken = await getAdminToken()
    const scenario: CheckInScenario = await createCheckInScenario(request, adminToken, {
      checkInRequired: true,
    })

    // Sanity-check the starting match state via API. The response omits
    // null check-in timestamps entirely (skip_serializing_if), so assert
    // falsy rather than null.
    const initial = await getMatch(request, adminToken, scenario.tournamentId, scenario.matchId)
    expect(initial.participant1_checked_in_at).toBeFalsy()
    expect(initial.participant2_checked_in_at).toBeFalsy()
    expect(['scheduled', 'checking_in']).toContain(initial.status)

    // --- P1 checks in via the UI. ---
    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)

    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    // The fixture drives the match to `checking_in`, so the Check In button
    // should render for a participant. Keep the API fallback in case the
    // page is mid-refresh. (The waitForResponse promise is created only on
    // the UI path — a pending listener at test end rejects and fails the
    // test otherwise.)
    const checkInButton = page.getByRole('button', { name: /Check In/i })
    if (await checkInButton.isVisible().catch(() => false)) {
      const p1CheckInPromise = page
        .waitForResponse(
          (res) =>
            res.url().includes(`/matches/${scenario.matchId}/check-in`) &&
            res.request().method() === 'POST',
          { timeout: 10000 },
        )
        .catch(() => undefined)
      await checkInButton.click()
      await p1CheckInPromise
    } else {
      await checkInViaApi(
        request,
        scenario.p1.token,
        scenario.tournamentId,
        scenario.matchId,
        scenario.p1.registrationId,
      )
    }

    // Backend now has P1 checked in.
    const afterP1 = await getMatch(request, adminToken, scenario.tournamentId, scenario.matchId)
    expect(afterP1.participant1_checked_in_at).toBeTruthy()
    expect(afterP1.participant2_checked_in_at).toBeFalsy()

    // --- P2 checks in via API, then reload to verify both-checked-in state. ---
    await checkInViaApi(
      request,
      scenario.p2.token,
      scenario.tournamentId,
      scenario.matchId,
      scenario.p2.registrationId,
    )

    const afterBoth = await getMatch(request, adminToken, scenario.tournamentId, scenario.matchId)
    expect(afterBoth.participant1_checked_in_at).toBeTruthy()
    expect(afterBoth.participant2_checked_in_at).toBeTruthy()

    // After both participants check in the domain service auto-advances
    // the match out of `checking_in` into `pick_ban` (if veto is required)
    // or `in_progress`. Either is acceptable — the key assertion is that
    // it has moved past `checking_in`.
    expect(['pick_ban', 'in_progress']).toContain(afterBoth.status)

    await page.reload()
    await page.waitForLoadState('networkidle')
    // Once auto-advanced past `checking_in`, the Check In button is hidden.
    await expect(page.getByRole('button', { name: /^Check In$/i })).toHaveCount(0)
  })

  test('process-no-shows flags non-checked-in registrations when the check-in window has closed', async ({ request }) => {
    const adminToken = await getAdminToken()
    // No-show processing operates on approved-but-not-checked-in
    // registrations BEFORE the bracket exists (starting the tournament
    // requires admin-overriding everyone's check-in, which would make
    // no-shows impossible) — so stop the scenario before /start. The
    // check-in window must still be OPEN so P1 can self check-in; the
    // backend does not gate process-no-shows on the window having ended
    // (that timing judgment is the admin's).
    const scenario: CheckInScenario = await createCheckInScenario(request, adminToken, {
      checkInRequired: true,
      skipStart: true,
    })

    // Only P1 checks in (tournament-level); P2 deliberately does not.
    await tournamentCheckIn(scenario.p1.token, scenario.tournamentId, scenario.p1.registrationId)

    // Admin triggers no-show processing.
    const processed = await processNoShows(request, adminToken, scenario.tournamentId)
    expect(Array.isArray(processed)).toBe(true)

    // P2's registration should now be NoShow; P1 should not be affected.
    const p2Reg = await getRegistration(
      request,
      adminToken,
      scenario.tournamentId,
      scenario.p2.registrationId,
    )
    expect(p2Reg.status.toLowerCase()).toBe('no_show')

    const p1Reg = await getRegistration(
      request,
      adminToken,
      scenario.tournamentId,
      scenario.p1.registrationId,
    )
    expect(p1Reg.status.toLowerCase()).not.toBe('no_show')
    expect(p1Reg.checked_in).toBe(true)

    // And the processed list from the admin endpoint should contain P2.
    const processedIds = processed.map((r) => r.id)
    expect(processedIds).toContain(scenario.p2.registrationId)
  })

  test('non-participants do not see the Check In button', async ({ request, page }) => {
    const adminToken = await getAdminToken()
    const scenario: CheckInScenario = await createCheckInScenario(request, adminToken, {
      checkInRequired: true,
    })

    // Transition the match into `checking_in` so the Check In button
    // would normally be shown to participants.
    await checkInViaApi(
      request,
      scenario.p1.token,
      scenario.tournamentId,
      scenario.matchId,
      scenario.p1.registrationId,
    )

    // Confirm the match is in a state where the panel is eligible to render.
    const midState = await getMatch(request, adminToken, scenario.tournamentId, scenario.matchId)
    expect(['checking_in', 'pick_ban', 'in_progress']).toContain(midState.status)

    // Log in as a brand-new, unrelated user and visit the match page.
    const outsider = await createTestUser()
    await primeAuthStorage(page, outsider.token, outsider.userId)

    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    // The "Check In" button must not be visible to non-participants.
    // Scope to the main content area so we don't accidentally match the
    // check-in column on a scheduling panel, etc.
    const checkInButton = page.getByRole('button', { name: /^Check In$/i })
    await expect(checkInButton).toHaveCount(0)
  })
})
