import { test, expect } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { createDraftTournament } from './fixtures/tournament-lifecycle.fixture'
import {
  driveIndividualTournamentToInProgress,
  completeMatchP1Wins,
  generateNextRound,
  getBrackets,
  getMatches,
  getStandings,
  type FormatBracket,
  type FormatMatch,
  type FormatParticipant,
} from './fixtures/tournament-formats.fixture'

/**
 * End-to-end coverage for ALL FOUR tournament formats.
 *
 * Every other tournament fixture/spec hard-codes `single_elimination`; this
 * spec takes each of `single_elimination`, `double_elimination`, `round_robin`
 * and `swiss` through its full individual-participant lifecycle and asserts:
 *
 *   1. the correct bracket shape is generated (via the matches/brackets API),
 *   2. the format + bracket render on the public tournament detail UI, and
 *   3. progression works for that format (next round appears / loser drops /
 *      standings update).
 *
 * Expected bracket shapes are derived from the backend generators
 * (`crates/portal-domain/src/services/tournament/service.rs`) and mirror the
 * assertions in `crates/portal-api/tests/integration/tournaments/brackets.rs`:
 *
 *   - single_elimination: n-1 matches, rounds = log2(n).      (n=4 → 3 matches, 2 rounds)
 *   - double_elimination: WB + LB + GF brackets; 4-team → 6 matches (WB3/LB2/GF1).
 *   - round_robin:        C(n,2) matches, one bracket.         (n=4 → 6 matches)
 *   - swiss:              R1 = floor(n/2) matches, one bracket.(n=4 → 2 matches)
 *
 * Scope is INDIVIDUAL participants only.
 */

interface FormatCase {
  format: 'single_elimination' | 'double_elimination' | 'round_robin' | 'swiss'
  label: string
  participants: number
}

const FORMATS: FormatCase[] = [
  { format: 'single_elimination', label: 'Single Elimination', participants: 4 },
  { format: 'double_elimination', label: 'Double Elimination', participants: 4 },
  { format: 'round_robin', label: 'Round Robin', participants: 4 },
  { format: 'swiss', label: 'Swiss', participants: 4 },
]

function log2(n: number): number {
  return Math.log2(n)
}

for (const fmt of FORMATS) {
  test.describe(`Tournament format: ${fmt.label}`, () => {
    test('generates the correct bracket, renders in the UI, and progresses', async ({ page }) => {
      // Registering 4 users, starting, and playing out result-claim sagas is a
      // lot of sequential HTTP; give it room beyond the 30s default.
      test.setTimeout(180_000)

      const adminToken = await getAdminToken()
      // Tournament pages are members-only now.
      await loginAsAdmin(page)
      // Tournament pages are members-only now.
      await loginAsAdmin(page)

      // --- 1. Create draft + drive to in_progress so the bracket generates ---
      const tournament = await createDraftTournament(adminToken, {
        name: `E2E ${fmt.label} ${Date.now()}`,
        format: fmt.format,
        participantType: 'individual',
        minParticipants: 2,
        // Capacity is checked as `count_registrations >= max_participants` on
        // BOTH register and approve, and the count includes the row being
        // approved — so max must exceed the participant count (mirrors the
        // backend integration tests, which use 16). Bracket generation still
        // uses only the seeded/approved participants.
        maxParticipants: 16,
      })

      const participants = await driveIndividualTournamentToInProgress(
        adminToken,
        tournament.id,
        fmt.participants,
        fmt.label,
      )
      expect(participants).toHaveLength(fmt.participants)

      const brackets = await getBrackets(adminToken, tournament.id)
      const matches = await getMatches(adminToken, tournament.id)

      // --- 2. Assert the generated bracket shape for this format ---
      await assertBracketShape(fmt, brackets, matches)

      // --- 3. Assert the format + bracket render on the detail UI ---
      await assertDetailUi(page, tournament.slug, fmt, participants)

      // --- 4. Prove progression works for this format ---
      await assertProgression(adminToken, tournament.id, fmt, brackets, matches, participants)
    })
  })
}

// ===========================================================================
// Bracket-shape assertions (API)
// ===========================================================================

async function assertBracketShape(
  fmt: FormatCase,
  brackets: FormatBracket[],
  matches: FormatMatch[],
): Promise<void> {
  const n = fmt.participants

  switch (fmt.format) {
    case 'single_elimination': {
      // n-1 total matches, rounds = log2(n). (4 → 3 matches, 2 rounds)
      expect(matches).toHaveLength(n - 1)
      expect(brackets).toHaveLength(1)
      expect(brackets[0].bracket_type).toBe('single_elim')

      const maxRound = Math.max(...matches.map((m) => m.round))
      expect(maxRound).toBe(log2(n))

      const round1 = matches.filter((m) => m.round === 1)
      const finalRound = matches.filter((m) => m.round === maxRound)
      expect(round1).toHaveLength(n / 2) // 2 first-round matches
      expect(finalRound).toHaveLength(1) // single final

      // First-round matches have both participants; the final has none yet.
      for (const m of round1) {
        expect(m.participant1_registration_id).toBeTruthy()
        expect(m.participant2_registration_id).toBeTruthy()
      }
      expect(finalRound[0].participant1_registration_id).toBeFalsy()
      expect(finalRound[0].participant2_registration_id).toBeFalsy()
      break
    }

    case 'double_elimination': {
      // 4-team DE → WB3 / LB2 / GF1 = 6 matches across 3 brackets.
      expect(brackets).toHaveLength(3)
      const types = brackets.map((b) => b.bracket_type).sort()
      expect(types).toEqual(['grand_final', 'losers', 'winners'])

      expect(matches).toHaveLength(6)
      // More matches than an equivalent single-elim (which would be n-1 = 3).
      expect(matches.length).toBeGreaterThan(n - 1)

      const losers = brackets.find((b) => b.bracket_type === 'losers')!
      const winners = brackets.find((b) => b.bracket_type === 'winners')!
      const gf = brackets.find((b) => b.bracket_type === 'grand_final')!

      const wbMatches = matches.filter((m) => m.bracket_id === winners.id)
      const lbMatches = matches.filter((m) => m.bracket_id === losers.id)
      const gfMatches = matches.filter((m) => m.bracket_id === gf.id)
      expect(wbMatches).toHaveLength(3)
      expect(lbMatches.length).toBeGreaterThan(0) // losers bracket present
      expect(lbMatches).toHaveLength(2)
      expect(gfMatches).toHaveLength(1)

      // WB round 1 has both participants; the grand final is empty for now.
      const wr1 = wbMatches.filter((m) => m.round === 1)
      expect(wr1).toHaveLength(n / 2)
      for (const m of wr1) {
        expect(m.participant1_registration_id).toBeTruthy()
        expect(m.participant2_registration_id).toBeTruthy()
      }
      expect(gfMatches[0].participant1_registration_id).toBeFalsy()
      break
    }

    case 'round_robin': {
      // Every pair plays once → C(n,2) matches, all fully assigned. (4 → 6)
      const expected = (n * (n - 1)) / 2
      expect(brackets).toHaveLength(1)
      expect(brackets[0].bracket_type).toBe('round_robin')
      expect(matches).toHaveLength(expected)

      for (const m of matches) {
        expect(m.participant1_registration_id).toBeTruthy()
        expect(m.participant2_registration_id).toBeTruthy()
        expect(m.bracket_position.startsWith('RR')).toBe(true)
      }
      break
    }

    case 'swiss': {
      // Swiss generates only round 1: floor(n/2) matches. (4 → 2)
      const expected = Math.floor(n / 2)
      expect(brackets).toHaveLength(1)
      expect(brackets[0].bracket_type).toBe('swiss')
      expect(matches).toHaveLength(expected)

      for (const m of matches) {
        expect(m.round).toBe(1)
        expect(m.participant1_registration_id).toBeTruthy()
        expect(m.participant2_registration_id).toBeTruthy()
        expect(m.bracket_position.startsWith('SW1M')).toBe(true)
      }
      break
    }
  }
}

// ===========================================================================
// Detail-page UI assertions
// ===========================================================================

async function assertDetailUi(
  page: import('@playwright/test').Page,
  slug: string,
  fmt: FormatCase,
  participants: FormatParticipant[],
): Promise<void> {
  await page.goto(`/tournaments/${slug}`)

  // Page resolved (not the not-found card).
  await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).not.toBeVisible()
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()

  // Overview tab (default active) shows the format label. `tournament.format`
  // serializes as the canonical string, so this label is reliable for all four.
  await expect(page.getByText(fmt.label).first()).toBeVisible()

  // Matches tab lists the generated matches for every format.
  await page.getByRole('tab', { name: 'Matches' }).click()
  await expect(page.locator('.match-card').first()).toBeVisible()
  // Seed-1 participant is always present in a first-round pairing.
  await expect(page.getByText(participants[0].displayName).first()).toBeVisible()

  // Bracket tab: a bracket exists, so the empty-state must not show.
  await page.getByRole('tab', { name: 'Bracket' }).click()
  await expect(page.getByRole('heading', { name: 'No Bracket Available' })).not.toBeVisible()

  if (fmt.format === 'double_elimination') {
    // DE renders explicit Winners + Losers bracket columns.
    await expect(page.getByText('Winners Bracket')).toBeVisible()
    await expect(page.getByText('Losers Bracket')).toBeVisible()
  } else if (fmt.format === 'round_robin' || fmt.format === 'swiss') {
    // RR/Swiss render a standings table on the bracket view.
    await expect(page.getByText('Standings')).toBeVisible({ timeout: 10_000 })
  }
}

// ===========================================================================
// Progression assertions (API)
// ===========================================================================

async function assertProgression(
  adminToken: string,
  tournamentId: string,
  fmt: FormatCase,
  brackets: FormatBracket[],
  matches: FormatMatch[],
  participants: FormatParticipant[],
): Promise<void> {
  switch (fmt.format) {
    case 'single_elimination': {
      // Completing both round-1 matches should fill the final's two slots.
      const round1 = matches.filter((m) => m.round === 1)
      for (const m of round1) {
        await completeMatchP1Wins(adminToken, tournamentId, m, participants)
      }
      const after = await getMatches(adminToken, tournamentId)
      const maxRound = Math.max(...after.map((m) => m.round))
      const final = after.find((m) => m.round === maxRound)!
      expect(final.participant1_registration_id).toBeTruthy()
      expect(final.participant2_registration_id).toBeTruthy()
      expect(final.status).toBe('ready')
      break
    }

    case 'double_elimination': {
      // Completing one winners-bracket R1 match drops its loser into the
      // losers bracket — a losers-bracket match gains a participant.
      const losers = brackets.find((b) => b.bracket_type === 'losers')!
      const winners = brackets.find((b) => b.bracket_type === 'winners')!

      const lbBefore = matches.filter((m) => m.bracket_id === losers.id)
      const lbAssignedBefore = lbBefore.filter(
        (m) => m.participant1_registration_id || m.participant2_registration_id,
      ).length
      expect(lbAssignedBefore).toBe(0)

      const wbR1 = matches.filter((m) => m.bracket_id === winners.id && m.round === 1)
      const winnerRegId = await completeMatchP1Wins(
        adminToken,
        tournamentId,
        wbR1[0],
        participants,
      )

      const after = await getMatches(adminToken, tournamentId)
      // Winner advanced somewhere in the winners bracket.
      const advanced = after.some(
        (m) =>
          m.bracket_id === winners.id &&
          m.round === 2 &&
          (m.participant1_registration_id === winnerRegId ||
            m.participant2_registration_id === winnerRegId),
      )
      expect(advanced).toBe(true)

      // Loser dropped into the losers bracket.
      const lbAssignedAfter = after
        .filter((m) => m.bracket_id === losers.id)
        .filter((m) => m.participant1_registration_id || m.participant2_registration_id).length
      expect(lbAssignedAfter).toBeGreaterThan(0)
      break
    }

    case 'round_robin': {
      // Completing one match updates the standings: the winner earns 3 points.
      const bracketId = brackets[0].id
      const before = await getStandings(adminToken, tournamentId, bracketId)
      expect(before.every((s) => s.points === 0 && s.matches_played === 0)).toBe(true)

      const winnerRegId = await completeMatchP1Wins(
        adminToken,
        tournamentId,
        matches[0],
        participants,
      )

      const after = await getStandings(adminToken, tournamentId, bracketId)
      const winnerStanding = after.find((s) => s.registration_id === winnerRegId)!
      expect(winnerStanding.points).toBe(3)
      expect(winnerStanding.matches_played).toBe(1)
      expect(winnerStanding.matches_won).toBe(1)
      break
    }

    case 'swiss': {
      // Completing every round-1 match then generating the next round should
      // create round-2 pairings.
      const round1 = matches.filter((m) => m.round === 1)
      for (const m of round1) {
        await completeMatchP1Wins(adminToken, tournamentId, m, participants)
      }

      const newMatches = await generateNextRound(adminToken, tournamentId)
      expect(newMatches.length).toBeGreaterThan(0)
      for (const m of newMatches) {
        expect(m.round).toBe(2)
      }

      const after = await getMatches(adminToken, tournamentId)
      const round2 = after.filter((m) => m.round === 2)
      expect(round2.length).toBeGreaterThan(0)
      // Standings reflect the completed round-1 results.
      const standings = await getStandings(adminToken, tournamentId, brackets[0].id)
      expect(standings.some((s) => s.points > 0)).toBe(true)
      break
    }
  }
}
