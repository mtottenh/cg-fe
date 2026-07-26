import { test, expect, type APIRequestContext } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import {
  createCheckInScenario,
  checkInViaApi,
  getMatch,
  primeAuthStorage,
  type CheckInScenario,
} from './fixtures/checkin.fixture'

/**
 * Real match-evidence flows through the UI (supersedes the "Evidence Panel
 * Shell (Phase 1: UI only)" placeholder coverage in match-results.spec.ts).
 *
 * The evidence panel lives inside the result-submission panel, which only
 * renders for a participant of a match in in_progress/awaiting_result. Setup
 * drives a fresh match there via the API, then exercises:
 *   1. Link evidence: fill Name/URL → Add Link → appears in the panel and in
 *      the backend evidence list.
 *   2. File upload: initiate → PUT (presigned; local-storage URL in dev) →
 *      complete, via the real upload zone file input.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url))

/** Match in in_progress with p1/p2 participants (no veto session → check-ins
 *  auto-advance straight to in_progress). */
async function setupInProgressMatch(
  request: APIRequestContext,
  adminToken: string,
): Promise<CheckInScenario> {
  const scenario = await createCheckInScenario(request, adminToken, {
    checkInRequired: true,
  })
  await checkInViaApi(
    request,
    scenario.p1.token,
    scenario.tournamentId,
    scenario.matchId,
    scenario.p1.registrationId,
  )
  await checkInViaApi(
    request,
    scenario.p2.token,
    scenario.tournamentId,
    scenario.matchId,
    scenario.p2.registrationId,
  )
  const match = await getMatch(request, adminToken, scenario.tournamentId, scenario.matchId)
  expect(match.status, 'no-veto match should auto-advance to in_progress').toBe('in_progress')
  return scenario
}

async function listEvidence(
  request: APIRequestContext,
  token: string,
  matchId: string,
): Promise<Array<{ evidence_type: string; status?: string; name?: string | null }>> {
  const resp = await request.get(`${API_URL}/v1/matches/${matchId}/evidence`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(resp.ok()).toBe(true)
  return (await resp.json()).data ?? []
}

test.describe('Match Evidence', () => {
  test('participant links URL evidence through the panel', async ({ request, page }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupInProgressMatch(request, adminToken)

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    // Result submission panel with the evidence attachment section
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Attach Evidence')).toBeVisible()

    // Switch to the Link URL tab and add a VOD link
    await page.getByRole('button', { name: 'Link URL' }).click()
    await page.getByLabel('Name').fill('Match VOD')
    await page.getByLabel('URL').fill('https://youtube.com/watch?v=e2e-test-vod')
    const addLink = page.getByRole('button', { name: 'Add Link' })
    await expect(addLink).toBeEnabled()
    await addLink.click()

    // The link shows up in the panel's linked list
    await expect(page.getByText(/Linked \(1\)/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Match VOD')).toBeVisible()

    // And the backend has it
    const evidence = await listEvidence(request, scenario.p1.token, scenario.matchId)
    expect(evidence.length).toBe(1)
    expect(['link', 'video']).toContain(evidence[0].evidence_type)
  })

  test('participant uploads an image file end-to-end', async ({ request, page }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupInProgressMatch(request, adminToken)

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Attach Evidence')).toBeVisible({ timeout: 10000 })

    // Default tab is Upload Image; feed the hidden file input directly.
    // Watch the three-step upload conversation: initiate → PUT → complete.
    const completePromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/matches/${scenario.matchId}/evidence/`) &&
        res.url().endsWith('/complete') &&
        res.request().method() === 'POST',
      { timeout: 20000 },
    )
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(path.join(THIS_DIR, 'fixtures', 'images', 'test-square.png'))

    const completeResp = await completePromise
    expect(completeResp.ok()).toBe(true)

    // The upload shows in the panel list
    await expect(page.getByText(/Uploads \(1\)/)).toBeVisible({ timeout: 10000 })

    // Backend list contains the uploaded (completed) evidence item
    const evidence = await listEvidence(request, scenario.p1.token, scenario.matchId)
    expect(evidence.length).toBe(1)
    expect(evidence[0].evidence_type).toBe('screenshot')
  })

  test('the evidence status column shows a label, not the raw enum', async ({ request, page }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupInProgressMatch(request, adminToken)

    // Seed the record via the API — the UI path for creating it is covered by
    // the first test; what is under test here is how its STATUS renders.
    const created = await request.post(
      `${API_URL}/v1/matches/${scenario.matchId}/evidence/link`,
      {
        headers: { Authorization: `Bearer ${scenario.p1.token}` },
        data: {
          evidence_type: 'link',
          url: 'https://youtube.com/watch?v=e2e-status-chip',
          name: 'Status Chip VOD',
        },
      },
    )
    expect(created.ok()).toBe(true)

    const seeded = await listEvidence(request, scenario.p1.token, scenario.matchId)
    expect(seeded).toHaveLength(1)
    expect(seeded[0].status, 'backend evidence lifecycle status').toBe('active')

    // The Status column only renders on the detailed (admin) view.
    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${scenario.tournamentId}?tab=matches`)
    await page.waitForLoadState('networkidle')

    const matchRow = page.locator('tr').filter({ hasText: scenario.p1.username })
    await expect(matchRow).toBeVisible({ timeout: 10000 })
    await matchRow.getByRole('button', { name: 'View match details' }).click()

    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Match Detail' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('tab', { name: 'Evidence' }).click()

    const evidenceRow = dialog.locator('tr').filter({ hasText: 'Status Chip VOD' })
    await expect(evidenceRow).toBeVisible({ timeout: 10000 })
    await expect(evidenceRow.getByText('Active', { exact: true })).toBeVisible()
    await expect(evidenceRow.getByText('active', { exact: true })).toHaveCount(0)
  })

  test('non-participant does not get the evidence panel', async ({ request, page }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupInProgressMatch(request, adminToken)

    // Admin is not a participant of this match.
    await primeAuthStorage(page, adminToken)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Attach Evidence')).toHaveCount(0)
  })
})
