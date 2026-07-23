import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { createTestUser, primeAuthStorage } from './fixtures/checkin.fixture'
import { createResultScenario, submitResultClaim } from './fixtures/match-results-extra.fixture'
import {
  createDraftTournament,
  registerPlayer,
  approveRegistration,
} from './fixtures/tournament-lifecycle.fixture'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

// ---------------------------------------------------------------------------
// P-50: submitting a result must NOTIFY the opponent.
//
// Before the fix, `submit_claim` left the match `in_progress`. The action-item
// query keys the confirm/dispute item off `awaiting_result` specifically, so
// the opponent was never told a result had been submitted — while the claim's
// `auto_confirm_at` (now+15min) made the score official regardless. This test
// drives the OPPONENT's real UI and asserts the confirm-result action item
// surfaces once a claim is submitted.
// ---------------------------------------------------------------------------
test.describe('Result submission notifies the opponent (P-50)', () => {
  test('opponent sees a confirm-result action item after a claim is submitted', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()
    const scenario = await createResultScenario(adminToken)

    // P1 submits a 16-10 claim (via the same helper the confirm/dispute specs
    // use). Nothing else happens — the opponent is not touched.
    await submitResultClaim(
      scenario.p1.token,
      scenario.matchId,
      scenario.p1.registrationId,
      16,
      10,
    )

    // P2 opens the app in their own browser context. The home page's action
    // widget renders the pending action items fetched by the layout poller.
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
      await page.goto('/')

      await expect(page.getByText('Confirm or dispute result')).toBeVisible({
        timeout: 15_000,
      })
    } finally {
      await context.close()
    }
  })
})

// ---------------------------------------------------------------------------
// P-53: a participant seeded past registration-list position 20 must still be
// able to reach the submit-result affordance.
//
// The match page resolves the caller's registration by SCANNING the paginated
// registrations list. With the default page size of 20, a participant whose
// registration sorts past row 20 (registrations are ordered seed-first, so
// this is the seed-21+ players) could not be resolved and the submit panel was
// never shown. `max_participants` defaults to 64, so this is routine.
// ---------------------------------------------------------------------------

interface Player {
  userId: string
  token: string
  registrationId: string
}

interface MatchRow {
  id: string
  status: string
  participant1_registration_id: string | null
  participant2_registration_id: string | null
  participant1_seed: number | null
  participant2_seed: number | null
}

async function postAdmin(adminToken: string, path: string, body?: unknown): Promise<void> {
  const resp = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!resp.ok) {
    throw new Error(`POST ${path} failed (${resp.status}): ${await resp.text()}`)
  }
}

async function fetchMatches(adminToken: string, tournamentId: string): Promise<MatchRow[]> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!resp.ok) {
    throw new Error(`List matches failed (${resp.status}): ${await resp.text()}`)
  }
  return (await resp.json()).data as MatchRow[]
}

/**
 * Build a single-elimination tournament with 22 approved participants, seed
 * and start it, then find a first-round match where one participant is seeded
 * past position 20. Returns that participant (the "deep" registrant) plus the
 * match, driven to `in_progress`.
 */
async function createDeepSeededScenario(adminToken: string): Promise<{
  tournamentSlug: string
  matchId: string
  target: Player
}> {
  const PLAYER_COUNT = 22 // > 20, so seeds 21/22 fall on page 2 of the list
  const tournament = await createDraftTournament(adminToken, {
    format: 'single_elimination',
    minParticipants: 2,
    maxParticipants: 32,
  })

  await postAdmin(adminToken, `/v1/tournaments/${tournament.id}/publish`)
  await postAdmin(adminToken, `/v1/tournaments/${tournament.id}/open-registration`)

  const users = await Promise.all(
    Array.from({ length: PLAYER_COUNT }, () => createTestUser()),
  )
  const players: Player[] = await Promise.all(
    users.map(async (u, i) => {
      const registrationId = await registerPlayer(u.token, tournament.id, `Deep Seed ${i}`)
      await approveRegistration(adminToken, tournament.id, registrationId)
      return { userId: u.userId, token: u.token, registrationId }
    }),
  )
  const byRegistration = new Map(players.map((p) => [p.registrationId, p]))

  await postAdmin(adminToken, `/v1/tournaments/${tournament.id}/seeding/auto`, {
    algorithm: 'random',
  })
  await postAdmin(adminToken, `/v1/tournaments/${tournament.id}/start`)

  // Find a real (both participants set) match with a participant seeded > 20.
  const matches = await fetchMatches(adminToken, tournament.id)
  const deep = matches.find(
    (m) =>
      m.participant1_registration_id !== null &&
      m.participant2_registration_id !== null &&
      ((m.participant1_seed ?? 0) > 20 || (m.participant2_seed ?? 0) > 20),
  )
  if (!deep) {
    throw new Error('No first-round match had a participant seeded past position 20')
  }

  const deepReg =
    (deep.participant1_seed ?? 0) > 20
      ? deep.participant1_registration_id!
      : deep.participant2_registration_id!
  const target = byRegistration.get(deepReg)
  if (!target) {
    throw new Error(`Seeded-deep registration ${deepReg} is not one of the created players`)
  }

  // Drive the match Ready -> Scheduled -> InProgress so the submit affordance
  // is live. Scheduling needs a future time; the admin transition then starts
  // the match.
  const scheduledAt = new Date(Date.now() + 5 * 60_000).toISOString()
  await postAdmin(
    adminToken,
    `/v1/admin/tournaments/${tournament.id}/matches/${deep.id}/schedule`,
    { scheduled_at: scheduledAt, reason: 'E2E P-53: schedule for result submission' },
  )
  await postAdmin(
    adminToken,
    `/v1/admin/tournaments/${tournament.id}/matches/${deep.id}/transition`,
    { to_status: 'in_progress', override_reason: 'E2E P-53: drive match in_progress' },
  )

  return { tournamentSlug: tournament.slug, matchId: deep.id, target }
}

test.describe('Deep-seeded participant can submit a result (P-53)', () => {
  test('participant seeded past list position 20 reaches the submit-result panel', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const { tournamentSlug, matchId, target } = await createDeepSeededScenario(adminToken)

    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await primeAuthStorage(page, target.token, target.userId)
      await page.goto(`/tournaments/${tournamentSlug}/matches/${matchId}`)
      await page.waitForLoadState('networkidle')

      // The submit panel only renders when the page resolved THIS user's
      // registration out of the (now fully fetched) registrations list.
      await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15_000 })
    } finally {
      await context.close()
    }
  })
})
