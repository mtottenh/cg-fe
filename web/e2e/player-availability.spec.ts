import { test, expect, type Locator, type Page } from '@playwright/test'
import { login } from './fixtures/auth.fixture'
import {
  createPlayer,
  createOverrideViaApi,
  createWindowViaApi,
  isoDateInDays,
  listOverridesViaApi,
  listWindowsViaApi,
  type PlayerSession,
} from './fixtures/player-surfaces.fixture'

/**
 * `PlayerAvailabilityPage` (`/profile/availability`) — the two managers a player
 * uses to describe when they can play, which is what
 * `POST /tournaments/{id}/matches/{id}/schedule-suggestions` reads.
 *
 *   windows   PATCH  /v1/players/me/availability/windows/{id}   (availability.ts:92)
 *             DELETE /v1/players/me/availability/windows/{id}   (availability.ts:104)
 *   overrides POST   /v1/players/me/availability/overrides      (availability.ts:122)
 *             DELETE /v1/players/me/availability/overrides/{id} (availability.ts:133)
 *
 * Window *creation* through the UI is already driven by
 * `player-profile.spec.ts:601` ("should create availability window"); this spec
 * covers the four handlers that nothing reached.
 *
 * Every test registers its own player. These are `/players/me` routes, so a
 * shared account makes "this player has exactly one window" unassertable the
 * moment two specs run at once.
 */

/** `AvailabilityWindowsManager.vue:2-9` — the card titled "Weekly Availability". */
function weeklyCard(page: Page): Locator {
  return page.locator('.v-card').filter({ hasText: 'Weekly Availability' })
}

/** `AvailabilityOverridesManager.vue:2-9` — the card titled "Date Overrides". */
function overridesCard(page: Page): Locator {
  return page.locator('.v-card').filter({ hasText: 'Date Overrides' })
}

/**
 * The day subheader for a weekday (`AvailabilityWindowsManager.vue:30`).
 * Playwright text matching is substring-based, so a bare "Thursday" also
 * matches a row whose notes read "Moved to Thursdays" — `exact` is required.
 */
function daySubheader(card: Locator, day: string): Locator {
  return card.getByText(day, { exact: true })
}

async function openAvailability(page: Page, player: PlayerSession, tab: string): Promise<void> {
  await login(page, { username_or_email: player.email, password: player.password })
  await page.goto('/profile/availability')
  await expect(page.getByRole('heading', { name: 'My Availability' })).toBeVisible()
  await page.getByRole('tab', { name: tab }).click()
}

test.describe('Player weekly availability windows', () => {
  test('player edits a window and the day, times, preference and notes all persist', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const player = await createPlayer()
    const originalNotes = 'Weeknights after work'
    const seeded = await createWindowViaApi(player.token, {
      day_of_week: 2, // Tuesday
      start_time: '18:00:00',
      end_time: '22:00:00',
      is_preferred: false,
      notes: originalNotes,
    })

    await openAvailability(page, player, 'Weekly Schedule')
    const card = weeklyCard(page)

    // Precondition, asserted rather than assumed. formatTimeRange is
    // `src/stores/availability.ts:234`.
    await expect(daySubheader(card, 'Tuesday')).toBeVisible()
    await expect(card.getByText('6:00 PM - 10:00 PM')).toBeVisible()
    await expect(card.getByText(originalNotes)).toBeVisible()

    await card
      .locator('.v-list-item')
      .filter({ hasText: originalNotes })
      .getByRole('button', { name: 'Edit availability window' })
      .click()

    // The add/edit dialog re-titles itself when `editingWindow` is set
    // (`AvailabilityWindowsManager.vue:71-73`).
    const dialog = page.getByRole('dialog').filter({ hasText: 'Edit Availability' })
    await expect(dialog).toBeVisible()

    // The v-select menu is teleported to the overlay container, outside the dialog.
    await dialog.locator('.v-select').filter({ hasText: 'Day of Week' }).click()
    await page.getByRole('option', { name: 'Thursday' }).click()

    await dialog.getByLabel('Start Time').fill('19:00')
    await dialog.getByLabel('End Time').fill('23:00')
    await dialog.getByRole('checkbox', { name: 'Preferred Time' }).check()

    const newNotes = 'Moved to Thursdays'
    await dialog.getByLabel('Notes (Optional)').fill(newNotes)

    // saveWindow → store.updateWindow → PATCH .../windows/{id}
    // (`src/stores/availability.ts:92-102`).
    const patchPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/v1/players/me/availability/windows/${seeded.id}`) &&
        resp.request().method() === 'PATCH',
    )
    await dialog.getByRole('button', { name: 'Save Changes' }).click()
    const patchResponse = await patchPromise
    expect(patchResponse.status(), 'window update must return 200').toBe(200)

    // UI: the row moved day, changed range, gained the Preferred chip (:44-46)
    // and shows the new notes — and none of the old values survive.
    await expect(dialog).toBeHidden()
    await expect(daySubheader(card, 'Thursday')).toBeVisible()
    await expect(card.getByText('7:00 PM - 11:00 PM')).toBeVisible()
    await expect(card.getByText(newNotes)).toBeVisible()
    await expect(
      card.locator('.v-list-item').filter({ hasText: newNotes }).getByText('Preferred'),
    ).toBeVisible()
    await expect(daySubheader(card, 'Tuesday')).toHaveCount(0)
    await expect(card.getByText('6:00 PM - 10:00 PM')).toHaveCount(0)
    await expect(card.getByText(originalNotes)).toHaveCount(0)

    // API cross-check: the same row was rewritten — an edit must not mint a
    // second window.
    const windows = await listWindowsViaApi(player.token)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.id).toBe(seeded.id)
    expect(windows[0]!.day_of_week).toBe(4)
    expect(windows[0]!.start_time).toBe('19:00:00')
    expect(windows[0]!.end_time).toBe('23:00:00')
    expect(windows[0]!.is_preferred).toBe(true)
    expect(windows[0]!.notes).toBe(newNotes)
  })

  test('player deletes one window and the other is left untouched', async ({ page }) => {
    test.setTimeout(60_000)
    const player = await createPlayer()
    const doomedNotes = 'Monday slot to remove'
    const keptNotes = 'Friday slot to keep'
    const doomed = await createWindowViaApi(player.token, {
      day_of_week: 1,
      start_time: '18:00:00',
      end_time: '20:00:00',
      is_preferred: false,
      notes: doomedNotes,
    })
    const kept = await createWindowViaApi(player.token, {
      day_of_week: 5,
      start_time: '20:00:00',
      end_time: '23:00:00',
      is_preferred: false,
      notes: keptNotes,
    })

    await openAvailability(page, player, 'Weekly Schedule')
    const card = weeklyCard(page)
    await expect(card.getByText(doomedNotes)).toBeVisible()
    await expect(card.getByText(keptNotes)).toBeVisible()

    await card
      .locator('.v-list-item')
      .filter({ hasText: doomedNotes })
      .getByRole('button', { name: 'Delete availability window' })
      .click()

    // Deletion is confirm-gated (`AvailabilityWindowsManager.vue:151-169`); the
    // confirmation names the row it is about to remove.
    const confirm = page.getByRole('dialog').filter({ hasText: 'Delete Availability' })
    await expect(confirm).toBeVisible()
    await expect(confirm.getByText('Monday')).toBeVisible()
    await expect(confirm.getByText('6:00 PM - 8:00 PM')).toBeVisible()

    const deletePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/v1/players/me/availability/windows/${doomed.id}`) &&
        resp.request().method() === 'DELETE',
    )
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
    const deleteResponse = await deletePromise
    expect(deleteResponse.status(), 'window deletion must return 204').toBe(204)

    // UI: only the doomed row disappears — including its day subheader.
    await expect(confirm).toBeHidden()
    await expect(card.getByText(doomedNotes)).toHaveCount(0)
    await expect(daySubheader(card, 'Monday')).toHaveCount(0)
    await expect(card.getByText(keptNotes)).toBeVisible()
    await expect(daySubheader(card, 'Friday')).toBeVisible()

    // API cross-check: the delete hit the row the player pointed at.
    const windows = await listWindowsViaApi(player.token)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.id).toBe(kept.id)
  })
})

/**
 * NO CREATE TEST HERE, AND THAT IS THE FINDING.
 *
 * `POST /v1/players/me/availability/overrides` is reachable from the UI, but a
 * test that drives it honestly cannot pass: the date the player picks is not
 * the date that gets stored in any timezone east of UTC.
 *
 * `AvailabilityOverridesManager.vue:334-335` converts the picker's value with
 *
 *     const date = new Date(form.value.override_date)
 *     const dateStr = date.toISOString().split('T')[0]!
 *
 * `v-date-picker` emits a **local-midnight** `Date` (its own day cells are
 * stamped with the local ISO date — `VDatePickerMonth.js:227`), so
 * `toISOString()` reinterprets that instant in UTC and rolls the calendar day
 * back by one for every positive UTC offset. Reproduced on this runner
 * (Europe/London, BST = UTC+1): picking "Sat, Aug 15, 2026" posted
 * `override_date: 2026-08-14` and the list rendered "Fri, Aug 14, 2026".
 *
 * The same `toISOString()` pattern also drives `minDate` (component :255-258)
 * and `futureOverrides` / `pastOverrides` (`src/stores/availability.ts:65`,
 * component :290), so "today" is off by a day there too between local midnight
 * and 01:00.
 *
 * The dropped test asserted `overrides[0].override_date === <the picked day>`.
 * Restore it verbatim once the component formats the picked date from its local
 * parts; pinning the runner to UTC instead would make it pass while leaving
 * every European player's overrides on the wrong day.
 *
 * ---------------------------------------------------------------------------
 * P-93 FIXED — the create test below is that dropped test, restored.
 * `AvailabilityOverridesManager` now formats the picked date with
 * `toLocalDateString` (`utils/formatters.ts`), which reads local parts. The
 * runner was NOT pinned to UTC; this asserts the picked day on whatever
 * timezone it runs in, so it stays honest at any offset.
 */

test.describe('Player date overrides', () => {
  test('player adds a date override and the day they picked is the day stored', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const player = await createPlayer()
    const reason = 'Wedding — unavailable all day'

    await openAvailability(page, player, 'Date Overrides')
    const card = overridesCard(page)

    // Pick a day far enough out to be unambiguous, and compute the expected
    // calendar date the same way a human reads the picker: local parts.
    const target = new Date()
    target.setDate(target.getDate() + 9)
    const expectedDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`

    await card.getByRole('button', { name: 'Add Override', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Open the date menu and click the cell stamped with the target LOCAL date.
    // `v-date-picker` puts the local ISO date on each cell as `data-v-date`
    // (VDatePickerMonth.js:227) — so this locator states P-93's invariant
    // directly: click the cell labelled X, and X is what must reach the server.
    // Addressing by `data-v-date` rather than by the day number also keeps it
    // non-positional, per the §2 locator traps.
    await dialog.getByPlaceholder('Select a date').click()

    // Navigate deterministically from the DATES, never by probing the DOM — a
    // conditional on visibility is the guard shape the ratchet bans, and it
    // would also mask a picker that opened on the wrong month.
    const now = new Date()
    const monthsAhead =
      (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
    for (let i = 0; i < monthsAhead; i++) {
      await page.getByRole('button', { name: 'Next month' }).click()
    }

    // Vuetify keeps both month grids mounted after navigating, so the date
    // resolves to two cells. `.first()` is safe precisely because they carry the
    // SAME `data-v-date` — whichever is clicked selects the same day, which is
    // the only property this test cares about. The `toBeVisible` below still
    // fails loudly if no cell carries the date at all.
    const dayCell = page.locator(`[data-v-date="${expectedDate}"]:visible`).first()
    await expect(dayCell).toBeVisible()

    // Click the inner VBtn, not the wrapping div: the div carries `data-v-date`
    // but the button is the control, and clicking the wrapper selects nothing
    // (the picker simply stayed open — a real failure here, not a hypothesis).
    await dayCell.getByRole('button').click()

    // The picker closes itself on selection (`@update:model-value`). Wait for
    // that, or its overlay swallows the next click.
    await expect(dayCell).toBeHidden()

    // `override_type` is left at its default of 'blocked' (component :248) — the
    // toggle is deliberately not clicked. This test is about the DATE; the
    // assertion on `override_type` below pins the default without adding an
    // interaction that has nothing to do with P-93.
    await dialog.getByLabel('Reason (Optional)').fill(reason)

    const created = page.waitForResponse(
      (res) =>
        res.url().includes('/v1/players/me/availability/overrides') &&
        res.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Add Override', exact: true }).last().click()
    expect((await created).status()).toBe(201)

    // UI: the override renders under the day the player actually picked.
    await expect(card.getByText(reason)).toBeVisible()

    // Backend cross-check — the assertion P-93 made impossible. Before the fix
    // this came back as the PREVIOUS day for any positive UTC offset.
    const overrides = await listOverridesViaApi(player.token)
    const mine = overrides.find((o) => o.reason === reason)
    expect(mine, 'the created override should be listed').toBeDefined()
    expect(mine!.override_date).toBe(expectedDate)
    expect(mine!.override_type).toBe('blocked')
  })

  test('player deletes a date override and the other is left untouched', async ({ page }) => {
    test.setTimeout(60_000)
    const player = await createPlayer()
    const doomedReason = 'Dentist appointment'
    const keptReason = 'Free all evening'
    const doomed = await createOverrideViaApi(player.token, {
      override_date: isoDateInDays(4),
      override_type: 'blocked',
      reason: doomedReason,
    })
    const kept = await createOverrideViaApi(player.token, {
      override_date: isoDateInDays(6),
      override_type: 'available',
      reason: keptReason,
    })

    await openAvailability(page, player, 'Date Overrides')
    const card = overridesCard(page)

    // Both render in the upcoming list with their type chip (:41-48).
    await expect(card.getByText(doomedReason)).toBeVisible()
    await expect(card.getByText(keptReason)).toBeVisible()
    await expect(
      card.locator('.v-list-item').filter({ hasText: doomedReason }).getByText('Blocked'),
    ).toBeVisible()
    await expect(
      card
        .locator('.v-list-item')
        .filter({ hasText: keptReason })
        .getByText('Extra Availability'),
    ).toBeVisible()

    await card
      .locator('.v-list-item')
      .filter({ hasText: doomedReason })
      .getByRole('button', { name: 'Delete override' })
      .click()

    const confirm = page.getByRole('dialog').filter({ hasText: 'Delete Override' })
    await expect(confirm).toBeVisible()

    const deletePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/v1/players/me/availability/overrides/${doomed.id}`) &&
        resp.request().method() === 'DELETE',
    )
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
    const deleteResponse = await deletePromise
    expect(deleteResponse.status(), 'override deletion must return 204').toBe(204)

    await expect(confirm).toBeHidden()
    await expect(card.getByText(doomedReason)).toHaveCount(0)
    await expect(card.getByText(keptReason)).toBeVisible()

    const overrides = await listOverridesViaApi(player.token)
    expect(overrides).toHaveLength(1)
    expect(overrides[0]!.id).toBe(kept.id)
  })
})
