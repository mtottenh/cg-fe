import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import {
  createCheckInScenario,
  primeAuthStorage,
  type CheckInScenario,
} from './fixtures/checkin.fixture'
import { setAvailabilityWindow } from './fixtures/match.fixture'
import {
  createSelfScheduledScenario,
  completeMatchWithResult,
  type SelfScheduledScenario,
  type MatchDetails,
} from './fixtures/match-workflow-extra.fixture'

/**
 * Match workflow tests covering:
 * - Match detail page viewing and navigation
 * - Match scheduling (self-scheduled panel, availability calendar, proposals)
 * - The full scheduling negotiation: propose / accept / counter / reject
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

// ---------------------------------------------------------------------------
// Read-only backend cross-checks for the negotiation tests.
//
// `match-workflow-extra.fixture.ts` exports `proposeScheduleViaApi`, but that
// is a WRITE and the propose action is exactly what these tests must drive
// through the UI, so it is deliberately unused here. No shared fixture reads
// the proposal endpoints, and `fixtures/` belongs to another workstream, so
// the readers live locally.
//
// `/schedule/active` and `/schedule/history` take no auth extractor
// (api/crates/portal-api/src/handlers/tournaments/scheduling.rs:273 and :309),
// so any valid bearer token works.
// ---------------------------------------------------------------------------
const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface ScheduleProposal {
  id: string
  proposed_by_user_id: string
  proposed_times: string[]
  selected_time?: string
  status: string
  rejection_reason?: string
}

interface ScheduledMatch {
  id: string
  status: string
  /**
   * Absent (not null) while unscheduled — `TournamentMatchResponse` marks it
   * `skip_serializing_if = "Option::is_none"`
   * (api/crates/portal-api/src/dto/responses/tournament.rs:453-455).
   */
  scheduled_at?: string
}

async function apiGet<T>(path: string, token: string, context: string): Promise<T> {
  const resp = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`${context} failed (${resp.status}): ${text}`)
  }
  return (JSON.parse(text) as { data: T }).data
}

/** The single pending proposal for a match, or null when there is none. */
function getActiveProposal(
  token: string,
  tournamentId: string,
  matchId: string,
): Promise<ScheduleProposal | null> {
  return apiGet<ScheduleProposal | null>(
    `/v1/tournaments/${tournamentId}/matches/${matchId}/schedule/active`,
    token,
    'Get active proposal',
  )
}

/** Every proposal ever raised on a match, in creation order. */
function getProposalHistory(
  token: string,
  tournamentId: string,
  matchId: string,
): Promise<ScheduleProposal[]> {
  return apiGet<ScheduleProposal[]>(
    `/v1/tournaments/${tournamentId}/matches/${matchId}/schedule/history`,
    token,
    'Get proposal history',
  )
}

/**
 * Match read that exposes `scheduled_at` — the fixture's `fetchMatchDetails`
 * only projects the result-related columns.
 */
function getScheduledMatch(
  token: string,
  tournamentId: string,
  matchId: string,
): Promise<ScheduledMatch> {
  return apiGet<ScheduledMatch>(
    `/v1/tournaments/${tournamentId}/matches/${matchId}`,
    token,
    'Get match',
  )
}

/**
 * A `datetime-local` input value (`YYYY-MM-DDTHH:mm`) N days out at a whole
 * hour. Well clear of ScheduleTimePicker's `:min` of now + 1h
 * (ScheduleTimePicker.vue:172-176) and of the backend's "proposed times must
 * be in the future" rule (services/tournament/scheduling.rs:94-100).
 */
function localDateTimeInput(daysAhead: number, hour: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(hour, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Assert a page shows the match as scheduled for `iso`.
 *
 * The agreed time is rendered by `formatDateTime` (= `toLocaleString()`,
 * utils/formatters.ts:15-18) in the header chip (MatchDetailPage.vue:97-100),
 * so the expected label is produced by the browser's own Intl rather than
 * Node's — same locale and timezone as the component that rendered it.
 * `.first()`: once scheduled, the check-in card repeats the same timestamp
 * (MatchDetailPage.vue:145-151).
 */
async function expectMatchScheduledAt(page: Page, iso: string): Promise<void> {
  await expect(page.getByText('Match Scheduled')).toBeVisible({ timeout: 15000 })
  const label = await page.evaluate((value: string) => new Date(value).toLocaleString(), iso)
  await expect(page.getByText(label).first()).toBeVisible()
}

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

  // NOTE: "selecting a mutual slot adds it to the proposed times" used to live
  // here. It clicked a cell, asserted "1 time selected" and stopped — it never
  // submitted, so `submitProposal` had no coverage. The cell click and that
  // same summary assertion are now the opening moves of the end-to-end
  // negotiation below, which then actually sends the proposal.

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

/**
 * The scheduling negotiation, driven end to end through two real browser
 * sessions. Nothing here is seeded past the precondition (a self-scheduled
 * tournament with a `ready` match): every proposal, acceptance, counter and
 * rejection is a click.
 *
 * Two isolated contexts, one per player — the pattern from
 * `veto-realtime.spec.ts:117-126`. Each test owns its own tournament because
 * both mutate the same match's proposal state.
 */
test.describe('Schedule negotiation (two browser contexts)', () => {
  test('P1 proposes a mutual slot, P2 accepts it, and both pages show the scheduled time', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const scenario = await createSelfScheduledScenario(adminToken)

    // Weekly windows overlapping 16:00-22:00 so the calendar overlay has
    // `cell-mutual` slots to offer. The overlay's week starts TOMORROW
    // (useAvailabilityOverlay.ts:46-53) and its rows run 08:00-22:30
    // (:71), so the earliest mutual cell is tomorrow 16:00 local — safely
    // inside the backend's "must be in the future" rule.
    for (let day = 0; day < 7; day++) {
      const p1Window = await setAvailabilityWindow(scenario.p1.token, day, '14:00', '22:00', true)
      const p2Window = await setAvailabilityWindow(scenario.p2.token, day, '16:00', '23:00', true)
      if (!p1Window || !p2Window) {
        throw new Error(`Failed to seed availability windows for day ${day}`)
      }
    }

    const matchUrl = `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`
    const contextP1 = await browser.newContext()
    const contextP2 = await browser.newContext()

    try {
      const pageP1 = await contextP1.newPage()
      const pageP2 = await contextP2.newPage()
      await primeAuthStorage(pageP1, scenario.p1.token, scenario.p1.userId)
      await primeAuthStorage(pageP2, scenario.p2.token, scenario.p2.userId)

      // --- P1 picks a mutual slot and sends the proposal ------------------
      // (MatchSchedulingPanel.submitProposal -> MatchDetailPage.handlePropose)
      await pageP1.goto(matchUrl)
      await pageP1.waitForLoadState('networkidle')

      const p1Panel = pageP1.locator('.v-card').filter({ hasText: 'Schedule Match' }).first()
      await expect(p1Panel).toBeVisible({ timeout: 20000 })

      const mutualCells = p1Panel.locator('.grid-cell.cell-mutual, .grid-cell.cell-suggested')
      await expect(mutualCells.first()).toBeVisible({ timeout: 20000 })
      await mutualCells.first().click()
      await expect(p1Panel.getByText(/1 time selected/)).toBeVisible()

      const proposeCall = pageP1.waitForResponse(
        (res) =>
          res.url().includes(`/matches/${scenario.matchId}/schedule/propose`) &&
          res.request().method() === 'POST',
        { timeout: 20000 },
      )
      await p1Panel.getByRole('button', { name: 'Send Proposal' }).click()
      const proposeRes = await proposeCall
      expect(proposeRes.ok(), `POST /schedule/propose returned ${proposeRes.status()}`).toBe(true)

      // P1's own view swaps the form for their pending proposal.
      await expect(pageP1.getByText('Your Proposal')).toBeVisible({ timeout: 15000 })
      await expect(pageP1.getByText('Waiting for your opponent to respond...')).toBeVisible()
      await expect(pageP1.getByRole('button', { name: 'Send Proposal' })).toHaveCount(0)

      // Backend: exactly the one slot P1 clicked, attributed to P1.
      const pending = await getActiveProposal(
        scenario.p1.token,
        scenario.tournamentId,
        scenario.matchId,
      )
      expect(pending?.status, 'P1s proposal must be pending in the backend').toBe('pending')
      expect(pending?.proposed_by_user_id).toBe(scenario.p1.userId)
      expect(pending?.proposed_times ?? []).toHaveLength(1)
      const proposedTime = pending?.proposed_times[0] ?? ''

      // --- P2 accepts one of the offered times ---------------------------
      // (ProposalCard.handleAccept -> MatchDetailPage.handleAccept)
      await pageP2.goto(matchUrl)
      await pageP2.waitForLoadState('networkidle')

      await expect(pageP2.getByText('Proposal from opponent')).toBeVisible({ timeout: 20000 })
      // 'Awaiting Response' renders BOTH as the status chip and inside a <strong>
      // in the body copy, so scope to the chip or Playwright strict mode fails.
      await expect(
        pageP2.locator('.v-chip').filter({ hasText: 'Awaiting Response' }).first(),
      ).toBeVisible()

      // Accept stays locked until a time is picked (ProposalCard.vue:109).
      const acceptButton = pageP2.getByRole('button', { name: 'Accept' })
      await expect(acceptButton).toBeDisabled()

      const timeChoices = pageP2.getByRole('radio')
      await expect(timeChoices).toHaveCount(1)
      await timeChoices.first().check()
      await expect(timeChoices.first()).toBeChecked()
      await expect(acceptButton).toBeEnabled()

      const acceptCall = pageP2.waitForResponse(
        (res) =>
          res.url().includes(`/matches/${scenario.matchId}/schedule/accept`) &&
          res.request().method() === 'POST',
        { timeout: 20000 },
      )
      await acceptButton.click()
      const acceptRes = await acceptCall
      expect(acceptRes.ok(), `POST /schedule/accept returned ${acceptRes.status()}`).toBe(true)

      // Backend: the match now carries exactly the accepted instant.
      const scheduled = await getScheduledMatch(
        adminToken,
        scenario.tournamentId,
        scenario.matchId,
      )
      expect(scheduled.status).toBe('scheduled')
      expect(scheduled.scheduled_at, 'accepting must stamp scheduled_at').toBeTruthy()
      expect(new Date(scheduled.scheduled_at ?? '').getTime()).toBe(
        new Date(proposedTime).getTime(),
      )

      // UI, acceptor's page (no reload — handleAccept refetches).
      await expect(pageP2.getByText('Proposal from opponent')).toHaveCount(0)
      await expectMatchScheduledAt(pageP2, proposedTime)

      // UI, proposer's page: the same agreed time once refreshed.
      await pageP1.reload()
      await pageP1.waitForLoadState('networkidle')
      await expect(pageP1.getByText('Waiting for your opponent to respond...')).toHaveCount(0)
      await expectMatchScheduledAt(pageP1, proposedTime)
    } finally {
      await contextP1.close()
      await contextP2.close()
    }
  })

  test('P2 counter-proposes through the dialog and P1 rejects it, reopening scheduling', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const scenario = await createSelfScheduledScenario(adminToken)

    const matchUrl = `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`
    const contextP1 = await browser.newContext()
    const contextP2 = await browser.newContext()

    try {
      const pageP1 = await contextP1.newPage()
      const pageP2 = await contextP2.newPage()
      await primeAuthStorage(pageP1, scenario.p1.token, scenario.p1.userId)
      await primeAuthStorage(pageP2, scenario.p2.token, scenario.p2.userId)

      // --- P1 proposes through the manual picker -------------------------
      // No availability is seeded here on purpose: with no mutual cells the
      // calendar offers nothing, which is exactly when a player switches to
      // Manual. This also exercises the `pickerValid` gate that the calendar
      // path bypasses (MatchSchedulingPanel.vue:205-209).
      await pageP1.goto(matchUrl)
      await pageP1.waitForLoadState('networkidle')

      const p1Panel = pageP1.locator('.v-card').filter({ hasText: 'Schedule Match' }).first()
      await expect(p1Panel).toBeVisible({ timeout: 20000 })

      const sendProposal = p1Panel.getByRole('button', { name: 'Send Proposal' })
      await expect(sendProposal).toBeDisabled()

      await p1Panel.getByRole('button', { name: 'Manual' }).click()
      await expect(p1Panel.getByText('Custom Times')).toBeVisible()
      await p1Panel
        .locator('input[type="datetime-local"]')
        .first()
        .fill(localDateTimeInput(2, 19))
      await expect(p1Panel.getByText(/1 time selected/)).toBeVisible()
      await expect(sendProposal).toBeEnabled()

      const proposeCall = pageP1.waitForResponse(
        (res) =>
          res.url().includes(`/matches/${scenario.matchId}/schedule/propose`) &&
          res.request().method() === 'POST',
        { timeout: 20000 },
      )
      await sendProposal.click()
      const proposeRes = await proposeCall
      expect(proposeRes.ok(), `POST /schedule/propose returned ${proposeRes.status()}`).toBe(true)
      await expect(pageP1.getByText('Your Proposal')).toBeVisible({ timeout: 15000 })

      const original = await getActiveProposal(
        scenario.p1.token,
        scenario.tournamentId,
        scenario.matchId,
      )
      expect(original?.proposed_by_user_id).toBe(scenario.p1.userId)

      // --- P2 counter-proposes through the dialog ------------------------
      // (MatchSchedulingPanel.submitCounter -> MatchDetailPage.handleCounter)
      await pageP2.goto(matchUrl)
      await pageP2.waitForLoadState('networkidle')
      await expect(pageP2.getByText('Proposal from opponent')).toBeVisible({ timeout: 20000 })

      await pageP2.getByRole('button', { name: 'Counter-Propose' }).click()
      const counterDialog = pageP2.getByRole('dialog')
      await expect(counterDialog).toBeVisible()
      await expect(counterDialog.getByText('Custom Times')).toBeVisible()

      const counterSubmit = counterDialog.getByRole('button', { name: 'Send Counter-Proposal' })
      await expect(counterSubmit).toBeDisabled()
      await counterDialog
        .locator('input[type="datetime-local"]')
        .first()
        .fill(localDateTimeInput(4, 20))
      await expect(counterDialog.getByText(/1 time selected/)).toBeVisible()
      await expect(counterSubmit).toBeEnabled()

      const counterCall = pageP2.waitForResponse(
        (res) =>
          res.url().includes(`/matches/${scenario.matchId}/schedule/counter`) &&
          res.request().method() === 'POST',
        { timeout: 20000 },
      )
      await counterSubmit.click()
      const counterRes = await counterCall
      expect(counterRes.ok(), `POST /schedule/counter returned ${counterRes.status()}`).toBe(true)

      // The roles flip: P2 now owns the live proposal.
      await expect(pageP2.getByText('Your Proposal')).toBeVisible({ timeout: 15000 })
      await expect(pageP2.getByText('Waiting for your opponent to respond...')).toBeVisible()

      // Backend: P1's proposal is superseded, P2's counter is the live one.
      const counter = await getActiveProposal(
        scenario.p2.token,
        scenario.tournamentId,
        scenario.matchId,
      )
      expect(counter?.status).toBe('pending')
      expect(counter?.proposed_by_user_id).toBe(scenario.p2.userId)
      expect(counter?.proposed_times ?? []).toHaveLength(1)
      const counterTime = counter?.proposed_times[0] ?? ''

      const history = await getProposalHistory(
        adminToken,
        scenario.tournamentId,
        scenario.matchId,
      )
      expect(history.map((p) => p.status).sort()).toEqual(['counter_proposed', 'pending'])

      // --- P1 sees the counter and rejects it with a reason ---------------
      // (ProposalCard.confirmReject -> MatchDetailPage.handleReject)
      await pageP1.reload()
      await pageP1.waitForLoadState('networkidle')
      await expect(pageP1.getByText('Proposal from opponent')).toBeVisible({ timeout: 20000 })

      // P1 is shown P2's time, formatted by `formatProposedTime`
      // (stores/matchScheduling.ts:182-190) as the radio's label.
      const counterLabel = await pageP1.evaluate(
        (value: string) =>
          new Date(value).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        counterTime,
      )
      await expect(pageP1.getByText(counterLabel).first()).toBeVisible()

      await pageP1.getByRole('button', { name: 'Reject' }).click()
      const rejectDialog = pageP1.getByRole('dialog')
      await expect(rejectDialog.getByText('Reject Proposal')).toBeVisible()

      const rejectReason = 'None of those work — our league fixture clashes.'
      await rejectDialog.locator('textarea').first().fill(rejectReason)

      const rejectCall = pageP1.waitForResponse(
        (res) =>
          res.url().includes(`/matches/${scenario.matchId}/schedule/reject`) &&
          res.request().method() === 'POST',
        { timeout: 20000 },
      )
      // Scoped to the dialog: the ProposalCard's own Reject button is still
      // mounted behind it. Inside the dialog only Cancel / Reject exist.
      await rejectDialog.getByRole('button', { name: 'Reject' }).click()
      const rejectRes = await rejectCall
      expect(rejectRes.ok(), `POST /schedule/reject returned ${rejectRes.status()}`).toBe(true)

      // UI: scheduling reopens for P1 and the timeline records the rejection.
      await expect(pageP1.getByText(/Propose times for this match/)).toBeVisible({
        timeout: 15000,
      })
      await expect(pageP1.getByText('Proposal from opponent')).toHaveCount(0)
      await expect(pageP1.getByText('Scheduling History')).toBeVisible()
      await expect(pageP1.getByText('Rejected').first()).toBeVisible()

      // Backend: no live proposal, and the reason P1 typed is persisted.
      const afterReject = await getActiveProposal(
        adminToken,
        scenario.tournamentId,
        scenario.matchId,
      )
      expect(afterReject).toBeNull()

      const finalHistory = await getProposalHistory(
        adminToken,
        scenario.tournamentId,
        scenario.matchId,
      )
      const rejected = finalHistory.find((p) => p.id === counter?.id)
      expect(rejected?.status).toBe('rejected')
      expect(rejected?.rejection_reason).toBe(rejectReason)

      // The match never left `ready`, so the pair can negotiate again.
      const stillReady = await getScheduledMatch(
        adminToken,
        scenario.tournamentId,
        scenario.matchId,
      )
      expect(stillReady.status).toBe('ready')
      expect(stillReady.scheduled_at ?? null).toBeNull()
    } finally {
      await contextP1.close()
      await contextP2.close()
    }
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
