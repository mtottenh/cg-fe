import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import {
  createApprovalTournament,
  createTournamentWithApprovedPlayers,
  registerPendingPlayers,
  closeRegistration,
  startTournament,
  fetchSeeding,
  autoSeedViaApi,
  listMatches,
  listRegistrations,
  disqualifyRegistration,
  approveRegistration,
  type PendingPlayer,
} from './fixtures/tournament-seeding.fixture'

/**
 * Tournament Registration Approval + Bracket Seeding — E2E Tests
 *
 * Backlog: `web/docs/e2e-backlog.md` §2.3
 *
 * Gap covered: the UI flow between "tournament exists" and "matches can be
 * played" — admin approves/rejects registrations, configures seeding, and
 * re-seeds after late withdrawals. State is built via the backend API so
 * each test starts from a deterministic tournament.
 *
 * Tests create a fresh tournament per test (unique slug). No `serial` mode
 * required; each test is independent.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/**
 * Locate the registration row for a given participant name. Approve / reject
 * buttons are keyed off this row. Uses `.v-data-table` row selector since
 * RegistrationsTab renders a Vuetify data table.
 */
function registrationRow(page: Page, participantName: string) {
  return page.locator('tr').filter({ hasText: participantName })
}

test.describe('Tournament Registration Approval + Bracket Seeding', () => {
  test('admin approves 3, rejects 1 with reason, auto-seeds, bracket generates round-1 matches', async ({ page }) => {
    const adminToken = await getAdminToken()

    // Backend setup: approval tournament + 4 pending registrations.
    const tournament = await createApprovalTournament(adminToken, {
      minParticipants: 4,
      maxParticipants: 8,
    })
    const players = await registerPendingPlayers(tournament.id, 4)
    const [p1, p2, p3, p4] = players as [PendingPlayer, PendingPlayer, PendingPlayer, PendingPlayer]

    // All four registrations MUST land in `pending` on an approval tournament.
    const regs = await listRegistrations(adminToken, tournament.id)
    expect(regs.length).toBe(4)
    for (const r of regs) {
      expect(r.status).toBe('pending')
    }

    // Drive the UI as admin.
    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${tournament.id}`)
    await page.getByRole('tab', { name: 'Registrations' }).click()

    // Wait for the registrations table to render our 4 pending rows.
    await expect(registrationRow(page, p1.participantName)).toBeVisible({ timeout: 10_000 })
    await expect(registrationRow(page, p2.participantName)).toBeVisible()
    await expect(registrationRow(page, p3.participantName)).toBeVisible()
    await expect(registrationRow(page, p4.participantName)).toBeVisible()

    // Approve p1, p2, p3 via UI — each approve is a POST to the approve endpoint.
    for (const player of [p1, p2, p3]) {
      const approveResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/registrations/${player.registrationId}/approve`) &&
          resp.request().method() === 'POST',
      )
      await registrationRow(page, player.participantName)
        .getByRole('button', { name: 'Approve' })
        .click()
      const resp = await approveResponse
      expect(resp.ok()).toBe(true)

      // Row status chip MUST flip to approved. Actions become Disqualify only
      // (no check-in button because check_in_required=false).
      await expect(
        registrationRow(page, player.participantName).getByText('approved'),
      ).toBeVisible({ timeout: 5_000 })
    }

    // Reject p4 via UI — opens RegistrationReasonModal, fill reason, confirm.
    await registrationRow(page, p4.participantName)
      .getByRole('button', { name: 'Reject' })
      .click()
    const rejectModal = page.getByRole('dialog')
    await expect(rejectModal).toBeVisible()
    await expect(rejectModal.getByText('Reject Registration')).toBeVisible()
    await rejectModal.getByRole('textbox').fill('E2E: ineligible for approval round')

    const rejectResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/registrations/${p4.registrationId}/reject`) &&
        resp.request().method() === 'POST',
    )
    await rejectModal.getByRole('button', { name: 'Reject' }).click()
    const rejectResp = await rejectResponse
    expect(rejectResp.ok()).toBe(true)
    await expect(rejectModal).not.toBeVisible({ timeout: 5_000 })

    // Backend MUST reflect 3 approved + 1 rejected.
    const postApprove = await listRegistrations(adminToken, tournament.id)
    const byStatus = postApprove.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    }, {})
    expect(byStatus.approved).toBe(3)
    expect(byStatus.rejected).toBe(1)

    // Close registration via API so start-tournament is valid. The UI also
    // exposes a Close Registration button, but we already exercise that in
    // tournament-admin.spec; here we want to keep this test focused on
    // approval + seeding.
    await closeRegistration(adminToken, tournament.id)

    // Seeding tab → Auto Seed button.
    await page.getByRole('tab', { name: 'Seeding' }).click()
    // SeedingTab renders "No Seeding" empty state until auto-seed runs.
    await expect(page.getByText('No Seeding')).toBeVisible({ timeout: 10_000 })

    const autoSeedResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/tournaments/${tournament.id}/seeding/auto`) &&
        resp.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Auto Seed' }).click()
    const autoResp = await autoSeedResponse
    expect(autoResp.ok()).toBe(true)

    // Seeding list MUST contain exactly the 3 approved players.
    const seeds = await fetchSeeding(adminToken, tournament.id)
    expect(seeds.length).toBe(3)
    const seededRegIds = new Set(seeds.map((s) => s.registration_id))
    expect(seededRegIds.has(p1.registrationId)).toBe(true)
    expect(seededRegIds.has(p2.registrationId)).toBe(true)
    expect(seededRegIds.has(p3.registrationId)).toBe(true)
    expect(seededRegIds.has(p4.registrationId)).toBe(false)
    for (const s of seeds) {
      expect(s.seed).not.toBeNull()
    }

    // Start the tournament via API — with 3 approved participants and
    // single-elimination format, the bracket MUST generate round-1 matches.
    // With 3 registrations the single-elim generator produces 2 round-1
    // matches (one real pairing + one bye).
    await startTournament(adminToken, tournament.id)

    await page.getByRole('tab', { name: 'Bracket' }).click()
    await expect(
      page.locator('.bracket-container').first(),
    ).toBeVisible({ timeout: 10_000 })

    // Backend-visible match list MUST contain at least one round-1 match.
    const matches = await listMatches(adminToken, tournament.id)
    const roundOne = matches.filter((m) => m.round === 1)
    expect(roundOne.length).toBeGreaterThanOrEqual(1)

    // Every participant slot populated in round-1 matches MUST correspond
    // to one of the three approved registrations.
    const seededIds = new Set(seeds.map((s) => s.registration_id))
    for (const m of roundOne) {
      if (m.participant1_registration_id) {
        expect(seededIds.has(m.participant1_registration_id)).toBe(true)
      }
      if (m.participant2_registration_id) {
        expect(seededIds.has(m.participant2_registration_id)).toBe(true)
      }
    }
  })

  test('manual seed reorder persists the new order', async ({ page }) => {
    const adminToken = await getAdminToken()

    // Pre-approved so we can jump straight to the Seeding tab.
    const { tournament } = await createTournamentWithApprovedPlayers(adminToken, 4)

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${tournament.id}`)
    await page.getByRole('tab', { name: 'Seeding' }).click()

    // Baseline: auto-seed to populate the list.
    const autoSeedResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/tournaments/${tournament.id}/seeding/auto`) &&
        resp.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Auto Seed' }).click()
    await autoSeedResponse

    const baseline = await fetchSeeding(adminToken, tournament.id)
    expect(baseline.length).toBe(4)
    const baselineSorted = [...baseline].sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
    const originalFirst = baselineSorted[0]!
    const originalSecond = baselineSorted[1]!

    // The SeedingTab renders each seeded participant as a v-list-item
    // with a "#1" / "#2" / ... chip prepend. Scoping on the chip prefix
    // avoids collisions with any other v-list-items elsewhere on the page
    // (e.g. Stages tab, header chips).
    const seedListItems = page
      .locator('.v-list-item')
      .filter({ has: page.locator('.v-chip', { hasText: /^#\d+$/ }) })
    await expect(seedListItems).toHaveCount(4, { timeout: 10_000 })

    // Sanity: ensure the first list item corresponds to the original seed-1 participant.
    await expect(seedListItems.nth(0)).toContainText(originalFirst.participant_name)
    await expect(seedListItems.nth(1)).toContainText(originalSecond.participant_name)

    // Click the down-chevron on row 0 to swap #1 and #2.
    const topRow = seedListItems.nth(0)
    await topRow.locator('button:has(.mdi-chevron-down)').click()

    // UI list order MUST now show originalSecond first, originalFirst second.
    await expect(seedListItems.nth(0)).toContainText(originalSecond.participant_name)
    await expect(seedListItems.nth(1)).toContainText(originalFirst.participant_name)

    // Save via the Save Manual Seeding button — POSTs to /seeding/manual.
    const saveResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/tournaments/${tournament.id}/seeding/manual`) &&
        resp.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Save Manual Seeding' }).click()
    const saveResp = await saveResponse
    expect(saveResp.ok()).toBe(true)

    // Backend MUST reflect the swap: originalSecond now seed 1, originalFirst now seed 2.
    const updated = await fetchSeeding(adminToken, tournament.id)
    const bySeed = Object.fromEntries(updated.map((s) => [s.seed, s.registration_id]))
    expect(bySeed[1]).toBe(originalSecond.registration_id)
    expect(bySeed[2]).toBe(originalFirst.registration_id)

    // Remaining seeds 3 + 4 MUST be unchanged.
    expect(bySeed[3]).toBe(baselineSorted[2]!.registration_id)
    expect(bySeed[4]).toBe(baselineSorted[3]!.registration_id)
  })

  test('re-auto-seed after late withdrawal drops the withdrawn participant', async ({ page }) => {
    const adminToken = await getAdminToken()

    // 4 approved players + auto-seeded baseline.
    const { tournament, players } = await createTournamentWithApprovedPlayers(adminToken, 4)
    await autoSeedViaApi(adminToken, tournament.id)
    const baseline = await fetchSeeding(adminToken, tournament.id)
    expect(baseline.length).toBe(4)

    // Simulate late withdrawal: admin disqualifies player index 2. Using
    // disqualify because it's an admin-only, single-token flow whereas
    // player-initiated withdraw (DELETE /registrations/{id}) needs the
    // participant's own JWT. Both endpoints land the registration in a
    // non-active status that excludes it from seeding.
    const withdrawn = players[2]!
    await disqualifyRegistration(
      adminToken,
      tournament.id,
      withdrawn.registrationId,
      'E2E: simulated late withdrawal',
    )

    // Re-seed via the UI.
    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${tournament.id}`)
    await page.getByRole('tab', { name: 'Seeding' }).click()

    const autoSeedResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/tournaments/${tournament.id}/seeding/auto`) &&
        resp.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Auto Seed' }).click()
    const autoResp = await autoSeedResponse
    expect(autoResp.ok()).toBe(true)

    // New seeding MUST have exactly 3 entries, excluding the withdrawn player.
    const reSeeded = await fetchSeeding(adminToken, tournament.id)
    expect(reSeeded.length).toBe(3)
    const reSeededIds = new Set(reSeeded.map((s) => s.registration_id))
    expect(reSeededIds.has(withdrawn.registrationId)).toBe(false)
    // The remaining three approved players MUST all be present.
    for (const p of players) {
      if (p.registrationId === withdrawn.registrationId) continue
      expect(reSeededIds.has(p.registrationId)).toBe(true)
    }

    // UI list also MUST show 3 seeded rows.
    const seedListItems = page
      .locator('.v-list-item')
      .filter({ has: page.locator('.v-chip', { hasText: /^#\d+$/ }) })
    await expect(seedListItems).toHaveCount(3, { timeout: 10_000 })
  })
})

// Silence unused-import warning when the spec grows — touching it keeps
// the import list useful for future additions (API_URL / approveRegistration
// are re-exported for direct use if a follow-up scenario needs them).
void API_URL
void approveRegistration
