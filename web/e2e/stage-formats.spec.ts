import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import { createDraftTournament } from './fixtures/tournament-lifecycle.fixture'
import type { StageStatus } from './fixtures/api-status'

/**
 * Stage format picker — P-99 and P-98.
 *
 * P-99: `StagesTab` offered `groups_and_playoffs`, a value
 * `StageFormat::from_str` (api/crates/portal-core/src/types/tournament.rs:669-678)
 * has never accepted, and omitted `group_stage`, which it does. One option was a
 * guaranteed 400; the only multi-group format the product has was unreachable.
 *
 * P-98: the same select was labelled "Format (optional)" while
 * `handleCreateStage` sent `format: newStage.format ?? ''` into a REQUIRED field
 * that cannot parse `""`. Believing the label produced a hard failure.
 *
 * WHY THIS EXISTS ALONGSIDE THE UNIT TESTS
 * ----------------------------------------
 * `StagesTab.formats.test.ts` compares the picker's options to a transcription
 * of the Rust enum. A transcription cannot detect the thing that actually went
 * wrong: the frontend and the backend disagreeing. If someone re-adds a bogus
 * format they will "fix" the unit test's list to match and it stays green.
 *
 * So the first test here takes the options FROM THE LIVE UI and pushes every one
 * of them through the real create endpoint. There is no list to keep in sync —
 * an option the backend rejects fails, by construction. That is the only shape
 * of test that could have caught P-99 before it shipped, and it is why the
 * generated-union approach (C1) is preferred wherever a union exists: this test
 * is doing by execution what the typechecker would do for free if the API
 * declared `StageFormat` instead of stringifying it (P-112).
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface StageRow {
  id: string
  name: string
  stage_order: number
  format: string
  match_format: string | null
  status: StageStatus
}

/** Mirrors `stores/tournament/_stages.ts:20` — the backend cross-check. */
async function fetchStages(tournamentId: string): Promise<StageRow[]> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/stages`)
  if (!resp.ok) {
    throw new Error(`Fetch stages failed (${resp.status}): ${await resp.text()}`)
  }
  const body = (await resp.json()) as { data: StageRow[] }
  return body.data ?? []
}

/**
 * Open the create dialog and return it.
 *
 * "Add Stage" is gated on an early lifecycle status (`StagesTab.vue:7`), which
 * `draft` satisfies with no participants needed.
 */
async function openStageDialog(page: Page) {
  await page.getByRole('button', { name: 'Add Stage' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

/**
 * The format select, addressed BY POSITION.
 *
 * `StagesTab.vue` renders two v-selects: index 0 is Format, index 1 is Match
 * Format. Position rather than label because Vuetify's v-select label is not
 * associated with the control, and `hasText: 'Format'` is substring-matched so
 * it hits "Match Format" too (§2). Same pattern as `tournament-admin.spec.ts:557`.
 */
function formatSelect(dialog: ReturnType<Page['getByRole']>) {
  return dialog.locator('.v-select').nth(0)
}

test.describe('Stage format picker', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('every format the picker offers is one the backend accepts', async ({ page }) => {
    // Five formats, each a full dialog round-trip through the UI.
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const tournament = await createDraftTournament(adminToken)

    await page.goto(`/admin/tournaments/${tournament.id}?tab=stages`)
    await expect(page.getByRole('heading', { name: 'No Stages' })).toBeVisible({
      timeout: 15_000,
    })

    // Read the offered options out of the live UI — NOT from a list in this
    // file. That is the whole point: this test has no copy of the enum to drift.
    const dialog = await openStageDialog(page)
    await formatSelect(dialog).click()
    const optionMenu = page.locator('.v-select__content .v-list-item')
    await expect(optionMenu.first()).toBeVisible()
    const offered = (await optionMenu.allInnerTexts()).map((t) => t.trim())
    await page.keyboard.press('Escape')
    await expect(page.locator('.v-select__content')).toHaveCount(0)

    // Guard the guard: if the picker rendered nothing, every assertion below
    // would vacuously pass (ground rule 2). P-99's dead option lived in a
    // five-item list, so anything less than that is a broken test, not a pass.
    expect(offered.length, 'the format picker offers options at all').toBeGreaterThanOrEqual(5)
    // The dead option must be gone, by name — a regression should say WHY.
    // P-117 gave the picker human titles, so match on those; the wire values
    // are still pinned by the per-stage API cross-check inside the loop.
    expect(offered).not.toContain('Groups and Playoffs')
    expect(offered).not.toContain('groups_and_playoffs')
    // ...and the valid one it displaced must be present.
    expect(offered).toContain('Group Stage')

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    // Now prove each offered option is REAL by creating a stage with it. A
    // format the backend rejects surfaces as a 400 → no snackbar → failure here.
    // P-117: options now show human titles, so the displayed text is NOT the
    // wire value and must not be sent as one. The loop selects by POSITION and
    // never learns the wire value at all — which keeps this test's whole point
    // intact (it holds no copy of the enum to drift) while the API cross-check
    // below still proves what was actually persisted.
    for (const [index, label] of offered.entries()) {
      const stageName = `Stage ${label}`
      const d = await openStageDialog(page)
      await d.getByLabel('Stage Name').fill(stageName)

      await formatSelect(d).click()
      await page.locator('.v-select__content .v-list-item').nth(index).click()
      await expect(page.locator('.v-select__content')).toHaveCount(0)

      // Await the mutation rather than networkidle (§2): an already-idle page
      // satisfies networkidle before the click's request is even dispatched.
      const created = page.waitForResponse(
        (r) =>
          r.url().includes(`/tournaments/${tournament.id}/stages`) &&
          r.request().method() === 'POST',
      )
      await d.getByRole('button', { name: 'Create', exact: true }).click()
      const response = await created

      expect(
        response.status(),
        `creating a stage with the offered format "${label}" must not be rejected`,
      ).toBe(201)
      await expect(d).not.toBeVisible({ timeout: 10_000 })

      // Backend cross-check (ground rule 4): the format persisted VERBATIM, so
      // a silently-coerced value cannot masquerade as a success.
      const stages = await fetchStages(tournament.id)
      expect(stages).toHaveLength(index + 1)
      const persisted = stages.find((s) => s.name === stageName)
      expect(persisted, `stage "${stageName}" persisted`).toBeTruthy()
      // The persisted value must be a REAL StageFormat, not the label. This is
      // what would catch a picker whose title and value had come apart.
      expect(
        ['single_elimination', 'double_elimination', 'round_robin', 'swiss', 'group_stage'],
        `"${label}" persisted as a wire value the backend defines`,
      ).toContain(persisted!.format)
    }
  })

  test('creates a stage without touching the format picker', async ({ page }) => {
    // P-98 exactly: fill ONLY the name — the path the "(optional)" label
    // invited — and submit. This used to send `format: ""` and 400 with
    // "Invalid stage format". It now submits `StageFormat`'s own `#[default]`.
    test.setTimeout(60_000)
    const adminToken = await getAdminToken()
    const tournament = await createDraftTournament(adminToken)

    await page.goto(`/admin/tournaments/${tournament.id}?tab=stages`)
    await expect(page.getByRole('heading', { name: 'No Stages' })).toBeVisible({
      timeout: 15_000,
    })

    const dialog = await openStageDialog(page)

    // The label must no longer claim the field is optional — the copy is half
    // the finding, since it is what made the blank path look supported.
    //
    // `exact: true` is MANDATORY here (§2: Playwright text matching is
    // substring-based). Without it this matched "Match Format (optional)" — the
    // sibling select, whose label is correct because that field really IS
    // optional — and failed with "resolved to 2 elements" on a fixed component.
    await expect(dialog.getByText('Format (optional)', { exact: true })).toHaveCount(0)
    // The format select's own name, positively asserted, so this cannot pass by
    // the field having disappeared altogether. Asserted via the ACCESSIBLE name
    // rather than `getByText`: Vuetify renders a select's label twice (floating
    // label + fieldset legend), so a text count is 2 and pinning that number
    // pins a Vuetify implementation detail. `exact: true` is safe here only
    // because this select is no longer `clearable` — a clearable one would also
    // expose "Clear Format" (§2).
    await expect(dialog.getByLabel('Format', { exact: true })).toHaveCount(1)

    const createButton = dialog.getByRole('button', { name: 'Create', exact: true })
    await expect(createButton).toBeDisabled()
    await dialog.getByLabel('Stage Name').fill('Untouched Format')
    await expect(createButton).toBeEnabled()

    const created = page.waitForResponse(
      (r) =>
        r.url().includes(`/tournaments/${tournament.id}/stages`) &&
        r.request().method() === 'POST',
    )
    await createButton.click()
    const response = await created

    // The assertion that was impossible before the fix.
    expect(
      response.status(),
      'submitting without touching the format picker must not 400',
    ).toBe(201)
    await expect(
      page.locator('.v-snackbar').getByText('Stage created'),
    ).toBeVisible({ timeout: 15_000 })
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    // Backend: a real, parseable format was stored — not `''`, not null.
    const stages = await fetchStages(tournament.id)
    expect(stages).toHaveLength(1)
    expect(stages[0]?.name).toBe('Untouched Format')
    expect(stages[0]?.format).toBe('single_elimination')
  })
})
