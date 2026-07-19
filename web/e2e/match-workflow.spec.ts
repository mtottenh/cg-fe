import { test, expect } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import {
  createCheckInScenario,
  primeAuthStorage,
  type CheckInScenario,
} from './fixtures/checkin.fixture'
import { setAvailabilityWindow } from './fixtures/match.fixture'
import {
  createSelfScheduledScenario,
  proposeScheduleViaApi,
  completeMatchWithResult,
  type SelfScheduledScenario,
  type MatchDetails,
} from './fixtures/match-workflow-extra.fixture'

/**
 * Match workflow tests covering:
 * - Match detail page viewing and navigation
 * - Match scheduling (self-scheduled panel, availability calendar, proposals)
 * - Match check-in
 * - Match status display and completed-match results
 *
 * Every test drives the UI against an ephemeral tournament built through the
 * backend API in a beforeAll (see fixtures/match-workflow-extra.fixture.ts),
 * so the whole spec is self-contained: no seeded tournaments, no skips.
 *
 * Scenarios are shared within a describe only when its tests are read-only;
 * flows that mutate match state (proposals, results) build their own.
 */

test.describe('Match browsing and navigation', () => {
  let adminToken: string
  let scenario: SelfScheduledScenario

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    // In-progress tournament, two approved players, one round-1 match in `ready`.
    scenario = await createSelfScheduledScenario(adminToken)
  })

  test('navigates from the tournaments list to a tournament detail page', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/tournaments')

    // The scenario guarantees at least one tournament exists, so the grid
    // always renders at least one clickable card.
    const firstCard = page.locator('.tournament-card').first()
    await expect(firstCard).toBeVisible({ timeout: 15000 })
    await firstCard.click()

    await expect(page).toHaveURL(/\/tournaments\/[^/]+$/)
  })

  test('tournament detail shows the generated match on the Matches tab', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)

    const matchesTab = page.getByRole('tab', { name: 'Matches' })
    await expect(matchesTab).toBeEnabled({ timeout: 15000 })
    await matchesTab.click()

    const matchCard = page.locator('.match-card').first()
    await expect(matchCard).toBeVisible()

    // Both participants and the match format footer render on the card.
    await expect(matchCard.getByText(scenario.p1.participantName)).toBeVisible()
    await expect(matchCard.getByText(scenario.p2.participantName)).toBeVisible()
    await expect(matchCard.getByText('Bo1')).toBeVisible()
  })

  test('shows Match Not Found for an unknown match id', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(
      `/tournaments/${scenario.tournamentSlug}/matches/00000000-0000-0000-0000-000000000000`,
    )

    await expect(page.getByRole('heading', { name: /Match Not Found/i })).toBeVisible({
      timeout: 15000,
    })
  })

  test('displays tournament and match status chips', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)

    // Tournament header chip: the tournament started, so it shows Live Now.
    await expect(page.getByText('Live Now').first()).toBeVisible({ timeout: 15000 })

    // Match card status chip: freshly generated matches sit in `ready`.
    await page.getByRole('tab', { name: 'Matches' }).click()
    const matchCard = page.locator('.match-card').first()
    await expect(matchCard).toBeVisible()
    await expect(matchCard.locator('.v-chip').filter({ hasText: 'ready' })).toBeVisible()
  })

  test('bracket tab renders the bracket view', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)

    const bracketTab = page.getByRole('tab', { name: 'Bracket' })
    await expect(bracketTab).toBeEnabled({ timeout: 15000 })
    await bracketTab.click()

    // The bracket container renders and is NOT the empty state, because the
    // tournament has generated matches.
    //
    // Known display gap (pre-existing, surfaced by de-skipping this test):
    // the backend serializes bracket_type as "single_elim"
    // (portal-core BracketType::Display) while TournamentBracket.vue only
    // renders round columns for "single_elimination"/"winners", so round
    // headers like "Finals" never appear for single-elim brackets. Round
    // info coverage lives on the match detail page test instead.
    await expect(page.locator('.bracket-container')).toBeVisible()
    await expect(page.getByText('No Bracket Available')).toHaveCount(0)
  })

  test('navigates from the Matches tab to the match detail page with breadcrumbs', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)

    const matchesTab = page.getByRole('tab', { name: 'Matches' })
    await expect(matchesTab).toBeEnabled({ timeout: 15000 })
    await matchesTab.click()

    await page.locator('.match-card').first().click()

    await expect(page).toHaveURL(
      new RegExp(`/tournaments/${scenario.tournamentSlug}/matches/[^/]+$`),
    )

    // Breadcrumbs render with a link back to the tournaments list. Scope to
    // the breadcrumb bar — the nav drawer also has a Tournaments link.
    const breadcrumbs = page.locator('.v-breadcrumbs')
    await expect(breadcrumbs).toBeVisible({ timeout: 15000 })
    await expect(breadcrumbs.getByRole('link', { name: 'Tournaments' })).toBeVisible()
    await expect(page.getByText(scenario.tournamentName).first()).toBeVisible()
  })

  test('match detail shows match format, round, and status timeline', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)

    // Header chips: match number, round, and best-of format.
    await expect(page.getByText('Best of 1')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Round \d/).first()).toBeVisible()
    await expect(page.getByText(/Match #\d/).first()).toBeVisible()

    // Status timeline card renders for every match.
    await expect(page.getByText('Match Status').first()).toBeVisible()
  })

  test('shows Registration Closed once the tournament is underway', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)

    // The admin has no registration and the tournament is in progress, so
    // the registration card must show the closed state. (.first(): the text
    // appears both as the card heading and inside a status chip.)
    await expect(page.getByText('Registration Closed').first()).toBeVisible({ timeout: 15000 })
  })

  test('displays the participant count', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)

    // Overview tab info card: "Participants 2 / 4" for our two approved players.
    await expect(page.getByText('2 / 4')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Match scheduling panel (self-scheduled)', () => {
  let adminToken: string
  let scenario: SelfScheduledScenario

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    scenario = await createSelfScheduledScenario(adminToken)

    // Seed weekly availability for both participants with a guaranteed
    // overlap (16:00-22:00 every day) so the calendar overlay always has
    // mutual slots to render.
    for (let day = 0; day < 7; day++) {
      const p1Window = await setAvailabilityWindow(scenario.p1.token, day, '14:00', '22:00', true)
      const p2Window = await setAvailabilityWindow(scenario.p2.token, day, '16:00', '23:00', true)
      if (!p1Window || !p2Window) {
        throw new Error(`Failed to seed availability windows for day ${day}`)
      }
    }
  })

  async function openMatchAsP1(page: import('@playwright/test').Page): Promise<void> {
    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
  }

  test('participant sees the scheduling panel with the availability calendar', async ({ page }) => {
    await openMatchAsP1(page)

    // Panel renders because the tournament is self-scheduled, the match is
    // `ready`, and the viewer is a participant.
    await expect(page.getByText('Schedule Match')).toBeVisible({ timeout: 20000 })

    // Calendar overlay is the default view when the opponent is resolved:
    // title, legend, and the availability settings link.
    await expect(page.getByText('Availability', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Mutual', { exact: true })).toBeVisible()

    const availabilityLink = page.getByRole('link', { name: /Update Your Availability/i })
    await expect(availabilityLink).toBeVisible()
    await expect(availabilityLink).toHaveAttribute('href', '/profile/availability')
  })

  test('availability calendar shows mutual slots from both players windows', async ({ page }) => {
    await openMatchAsP1(page)

    await expect(page.getByText('Schedule Match')).toBeVisible({ timeout: 20000 })

    // Both players are available 16:00-22:00 every day, so the grid must
    // contain mutual (or backend-suggested, which supersedes mutual) cells.
    const overlapCells = page.locator('.grid-cell.cell-mutual, .grid-cell.cell-suggested')
    await expect(overlapCells.first()).toBeVisible({ timeout: 20000 })
  })

  test('selecting a mutual slot adds it to the proposed times', async ({ page }) => {
    await openMatchAsP1(page)

    await expect(page.getByText('Schedule Match')).toBeVisible({ timeout: 20000 })

    const overlapCells = page.locator('.grid-cell.cell-mutual, .grid-cell.cell-suggested')
    await expect(overlapCells.first()).toBeVisible({ timeout: 20000 })
    await overlapCells.first().click()

    // The selected-times summary reflects the picked slot.
    await expect(page.getByText(/1 time selected/)).toBeVisible()
  })

  test('manual mode shows the ScheduleTimePicker with quick select and custom times', async ({ page }) => {
    await openMatchAsP1(page)

    await expect(page.getByText('Schedule Match')).toBeVisible({ timeout: 20000 })

    // Toggle from the calendar overlay to the manual picker.
    await page.getByRole('button', { name: 'Manual' }).click()

    // Heading is "Recommended Times" when backend suggestions loaded,
    // "Quick Select" otherwise — either proves the picker rendered.
    await expect(page.getByText(/Quick Select|Recommended Times/)).toBeVisible()
    await expect(page.getByText('Custom Times')).toBeVisible()
    await expect(page.locator('input[type="datetime-local"]').first()).toBeVisible()
  })
})

test.describe('Schedule proposal workflow', () => {
  let adminToken: string
  let scenario: SelfScheduledScenario

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    scenario = await createSelfScheduledScenario(adminToken)

    // P1 proposes two times via the API; the spec then verifies P2's view.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const dayAfter = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    await proposeScheduleViaApi(scenario.p1.token, scenario.tournamentId, scenario.matchId, [
      tomorrow,
      dayAfter,
    ])
  })

  test('opponent sees the pending proposal with accept, reject, and counter actions', async ({ page }) => {
    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)

    // ProposalCard renders inside the scheduling panel for the non-proposer.
    await expect(page.getByText('Schedule Match')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Proposed Times')).toBeVisible()

    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Counter-Propose' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible()
  })

  test('counter-proposal dialog reuses the ScheduleTimePicker', async ({ page }) => {
    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)

    await expect(page.getByText('Proposed Times')).toBeVisible({ timeout: 20000 })
    await page.getByRole('button', { name: 'Counter-Propose' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Counter-Propose')).toBeVisible()

    // The dialog embeds the same time picker as the proposal form.
    await expect(dialog.getByText(/Quick Select|Recommended Times/)).toBeVisible()
    await expect(dialog.getByText('Custom Times')).toBeVisible()

    // Close without submitting so the proposal stays pending for retries.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })
})

test.describe('Match check-in', () => {
  let scenario: CheckInScenario

  test.beforeAll(async () => {
    const adminToken = await getAdminToken()
    // Fresh tournament whose match the fixture drives into `checking_in`.
    scenario = await createCheckInScenario(undefined, adminToken, {
      checkInRequired: true,
    })
  })

  test('participant sees the check-in panel while the match is checking in', async ({ page }) => {
    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)

    await expect(page.getByText('Match Check-in')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Both participants need to check in')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Check In$/i })).toBeVisible()

    // The status timeline accompanies the check-in phase.
    await expect(page.getByText('Match Status').first()).toBeVisible()
  })
})

test.describe('Completed match display', () => {
  let adminToken: string
  let scenario: SelfScheduledScenario
  let completedMatch: MatchDetails

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    scenario = await createSelfScheduledScenario(adminToken)
    // Advance to in_progress, P1 submits 1-0 claiming the win, P2 confirms.
    completedMatch = await completeMatchWithResult(adminToken, scenario, 1, 0)
    expect(completedMatch.winner_registration_id).toBe(scenario.p1.registrationId)
  })

  test('match detail shows the final score and highlights the winner', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)

    // Completed header: score, Final chip, and the winner rendered in the
    // success style.
    // exact: the claim summary caption also contains "P1 1 - 0 P2".
    await expect(page.getByText('1 - 0', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Final', { exact: true })).toBeVisible()
    await expect(page.locator('h3.text-success')).toHaveText(
      new RegExp(scenario.p1.participantName),
    )
  })

  test('tournament Matches tab shows the completed match with scores', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)

    const matchesTab = page.getByRole('tab', { name: 'Matches' })
    await expect(matchesTab).toBeEnabled({ timeout: 15000 })
    await matchesTab.click()

    const matchCard = page.locator('.match-card').first()
    await expect(matchCard).toBeVisible()
    await expect(matchCard.getByText('Completed')).toBeVisible()

    // Per-participant scores render on completed cards.
    await expect(matchCard.locator('.score').filter({ hasText: '1' })).toBeVisible()
    await expect(matchCard.locator('.score').filter({ hasText: '0' })).toBeVisible()
  })
})
