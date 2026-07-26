import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import {
  createDraftTournament,
  createOpenRegistrationTournament,
  registerPlayer,
} from './fixtures/tournament-lifecycle.fixture'
import {
  advanceMatchToCheckingIn,
  createCheckInScenario,
  createTestUser,
  getMatch,
  tournamentCheckIn,
} from './fixtures/checkin.fixture'
import { adminTransitionMatch } from './fixtures/match-results-extra.fixture'

/**
 * COVERAGE-PLAN **P-3** — two test-infrastructure defects that make a spec pass
 * or fail for reasons unrelated to what it claims to test.
 *
 * 1. `CreateTournamentOptions.checkInRequired` was inert. `is_check_in_open()`
 *    (api/crates/portal-domain/src/entities/tournament.rs:140-152) returns
 *    false unless the flag is set AND both window bounds exist AND now is
 *    inside them — and the builder exposed no way to set either bound. So
 *    `{ checkInRequired: true }` produced a tournament whose check-in could
 *    never open, and `TournamentCheckInService::check_in`
 *    (services/tournament/checkin.rs:73) rejected every attempt.
 *
 * 2. `checkin.fixture.advanceMatchToCheckingIn` treated any HTTP 400 from
 *    either of its two steps as success. "Already done" and "could not be
 *    done" are exactly the two outcomes a fixture must distinguish, and it
 *    reported both as done.
 *
 * These are API-level assertions on purpose: the subject is the fixture layer
 * every other spec is built on, and there is no UI for "did the builder set the
 * window". A broken builder makes every downstream UI assertion untrustworthy,
 * which is the whole reason the finding is worth a test.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface TournamentCheckInState {
  check_in_required: boolean
  is_check_in_open: boolean
  check_in_start: string | null
  check_in_end: string | null
}

async function fetchCheckInState(
  adminToken: string,
  tournamentId: string,
): Promise<TournamentCheckInState> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!resp.ok) {
    throw new Error(`Fetch tournament failed (${resp.status}): ${await resp.text()}`)
  }
  const body = (await resp.json()) as { data: TournamentCheckInState }
  return body.data
}

test.describe('P-3 — checkInRequired opens a real check-in window', () => {
  test('a tournament built with checkInRequired: true has check-in OPEN', async () => {
    const adminToken = await getAdminToken()
    const tournament = await createDraftTournament(adminToken, { checkInRequired: true })

    const state = await fetchCheckInState(adminToken, tournament.id)
    expect(state.check_in_required, 'the flag must reach the tournament').toBe(true)
    expect(
      state.check_in_start,
      'checkInRequired must imply a window start — the flag is inert without one',
    ).not.toBeNull()
    expect(state.check_in_end, 'checkInRequired must imply a window end').not.toBeNull()
    expect(
      state.is_check_in_open,
      'is_check_in_open() must be true, or the flag has enabled nothing',
    ).toBe(true)
  })

  test('an explicit past window leaves check-in CLOSED', async () => {
    const adminToken = await getAdminToken()
    const now = Date.now()
    const tournament = await createDraftTournament(adminToken, {
      checkInRequired: true,
      checkInStart: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      checkInEnd: new Date(now - 60 * 60 * 1000).toISOString(),
    })

    const state = await fetchCheckInState(adminToken, tournament.id)
    expect(state.check_in_required).toBe(true)
    // The counterpart to the test above: a builder that always reported "open"
    // would satisfy that one and fail this one. No-show processing needs
    // exactly this shape, which is why the override exists at all.
    expect(
      state.is_check_in_open,
      'an explicit past window must NOT be reported as open',
    ).toBe(false)
  })

  test('a registered player can actually check in', async () => {
    const adminToken = await getAdminToken()
    const tournament = await createOpenRegistrationTournament(adminToken, {
      checkInRequired: true,
    })

    const player = await createTestUser()
    const registrationId = await registerPlayer(
      player.token,
      tournament.id,
      `P3 Check-in ${player.username}`,
    )

    // The behaviour the flag exists for. Against the old builder this threw
    // "Tournament check-in failed (400)" because the window was never set.
    await tournamentCheckIn(player.token, tournament.id, registrationId)

    const resp = await fetch(`${API_URL}/v1/tournaments/${tournament.id}/registrations`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const body = (await resp.json()) as { data: Array<{ id: string; checked_in: boolean }> }
    const row = body.data.find((r) => r.id === registrationId)
    expect(row, 'the registration must exist').toBeDefined()
    expect(row!.checked_in, 'the backend must record the check-in').toBe(true)
  })
})

test.describe('P-3 — advanceMatchToCheckingIn fails loudly', () => {
  test('throws when the match cannot reach checking_in', async ({ request }) => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const scenario = await createCheckInScenario(request, adminToken, { checkInRequired: true })

    // Put the match somewhere the fixture provably cannot drive it out of:
    // `forfeit` has no outgoing transitions, and `can_schedule()`
    // (portal-core/src/types/tournament.rs:387) excludes it — so BOTH of the
    // fixture's steps return 400.
    await adminTransitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'forfeit')
    const forfeited = await getMatch(undefined, adminToken, scenario.tournamentId, scenario.matchId)
    expect(forfeited.status, 'precondition: the match is forfeited').toBe('forfeit')

    // Old behaviour: both 400s were swallowed and this RESOLVED, handing the
    // caller a "checking_in" match that is nothing of the sort.
    //
    // try/catch rather than `expect(...).rejects`: Playwright's expect reports
    // a non-rejecting promise as an internal TypeError rather than as the
    // assertion that failed, which makes the red run unreadable.
    let thrown: unknown = null
    try {
      await advanceMatchToCheckingIn(adminToken, scenario.tournamentId, scenario.matchId)
    } catch (err) {
      thrown = err
    }
    expect(
      thrown,
      'advanceMatchToCheckingIn must THROW when the match cannot reach checking_in',
    ).not.toBeNull()
    expect(
      String(thrown),
      'and the message must name the status it actually observed',
    ).toContain('forfeit')

    // And it must still be a no-op — not a throw — when the match genuinely is
    // already at checking_in, which is the rerun-safety the swallow was there
    // for. Without this, "fail loudly" could be implemented as "always fail".
    const second = await createCheckInScenario(request, adminToken, { checkInRequired: true })
    const already = await getMatch(undefined, adminToken, second.tournamentId, second.matchId)
    expect(already.status, 'precondition: the scenario left the match checking in').toBe(
      'checking_in',
    )
    await advanceMatchToCheckingIn(adminToken, second.tournamentId, second.matchId)
    const unchanged = await getMatch(undefined, adminToken, second.tournamentId, second.matchId)
    expect(unchanged.status).toBe('checking_in')
  })
})
