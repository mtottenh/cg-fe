import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api } from '@/api'
import { createSnackbar, SnackbarKey } from '@/composables/useSnackbar'
import StagesTab from '@/components/admin/tournament-detail/StagesTab.vue'

const mockPost = api.POST as unknown as Mock

const vuetify = createVuetify({ components, directives })

/**
 * P-99 / P-98 — the stage format picker.
 *
 * P-99: the list offered `groups_and_playoffs`, which `StageFormat::from_str`
 * (api/crates/portal-core/src/types/tournament.rs:669-678) has never accepted,
 * and omitted `group_stage`, which it does. So one option was a guaranteed 400
 * and the only multi-group format in the product was unreachable.
 *
 * P-98: the same select was labelled "Format (optional)" and `handleCreateStage`
 * sent `format: newStage.format ?? ''`. The field is required on
 * `CreateTournamentStageRequest` and `""` does not parse, so an organiser who
 * believed the label got a hard 400.
 *
 * This is the `AdminDisputesPage.status.test.ts` pattern (which pinned P-79's
 * `critical`/`urgent` drift) applied to the stage formats: mount, read the
 * select's real `items`, compare to the backend enum. Cheap and exact.
 *
 * What it CANNOT do is see the backend — the assertion below is a transcription,
 * so if the Rust enum gains a variant this test happily stays green while the UI
 * omits it. `e2e/stage-formats.spec.ts` closes that gap by driving every offered
 * option through the real API. Both are needed: this one fails fast on a typo,
 * that one fails on genuine drift.
 */

/** `StageFormat::from_str`'s match arms, in declaration order. */
const BACKEND_STAGE_FORMATS = [
  'single_elimination',
  'double_elimination',
  'round_robin',
  'swiss',
  'group_stage',
]

let wrapper: VueWrapper | null = null

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function mountTab() {
  setActivePinia(createPinia())
  wrapper = mount(StagesTab, {
    global: {
      plugins: [createPinia(), vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
    props: { tournamentId: 'tour-1', tournamentStatus: 'draft' },
  })
  // The create dialog (and therefore the selects) only exists once opened.
  await wrapper.find('button').trigger('click')
  await flushPromises()
  return wrapper
}

function formatSelect(w: VueWrapper) {
  const select = w
    .findAllComponents({ name: 'VSelect' })
    .find((s) => s.props('label') === 'Format')
  expect(select, 'a v-select labelled "Format" is rendered').toBeTruthy()
  return select!
}

/**
 * The offered wire values.
 *
 * P-117 changed `items` from bare strings to `{ value, title }` objects so the
 * picker could show human labels instead of `round_robin`, and did not update
 * the three assertions below — so all three had been failing since that landed
 * (a P-103 recurrence: a fix shipping without the test that depended on the old
 * shape). Reading the values through one helper means the next presentational
 * change to the picker cannot rot the *semantic* assertions again.
 */
function offeredFormats(w: VueWrapper): string[] {
  const items = formatSelect(w).props('items') as ({ value: string } | string)[]
  return items.map((i) => (typeof i === 'string' ? i : i.value))
}

describe('StagesTab format picker', () => {
  it('offers exactly the formats StageFormat::from_str accepts', async () => {
    // P-99. Order matters here on purpose: it makes the diff on failure read
    // as "you added/removed X" rather than a set-difference puzzle.
    const w = await mountTab()
    expect(offeredFormats(w)).toEqual(BACKEND_STAGE_FORMATS)
  })

  it('does not offer groups_and_playoffs, which the backend always rejects', async () => {
    // The exact dead option from the finding, named so a regression says why.
    const w = await mountTab()
    expect(offeredFormats(w)).not.toContain('groups_and_playoffs')
  })

  it('offers group_stage, the valid format that was missing', async () => {
    const w = await mountTab()
    expect(offeredFormats(w)).toContain('group_stage')
  })

  it('labels every offered format through stageFormatMap', async () => {
    // P-112: `stageFormatMap` is now keyed to `S['StageFormat']`, so the titles
    // cannot silently fall back to the wire value the way P-117 found them
    // doing. Assert the human labels, not just the values.
    const w = await mountTab()
    const items = formatSelect(w).props('items') as { value: string; title: string }[]
    expect(items.map((i) => i.title)).toEqual([
      'Single Elimination',
      'Double Elimination',
      'Round Robin',
      'Swiss',
      'Group Stage',
    ])
  })
})

describe('StagesTab format is required, not optional', () => {
  it('does not label the required format field "(optional)"', async () => {
    // P-98. The label and the aria-label both lied; the a11y ratchet requires
    // the select keep an aria-label, so assert on both rather than dropping it.
    const w = await mountTab()
    expect(formatSelect(w).props('label')).toBe('Format')
    // v-dialog TELEPORTS to body, and Vuetify passes `aria-label` down to the
    // inner input rather than keeping it on the VSelect root — so neither
    // `w.html()` nor `select.attributes()` sees it. Read the real document.
    const dom = document.body.innerHTML
    expect(dom).toContain('aria-label="Format"')
    // The accessible name must not say "(optional)" either: the a11y ratchet
    // requires every v-select carry an aria-label, and a screen-reader user
    // hearing "optional" is misled exactly as the sighted one was.
    expect(dom).not.toContain('aria-label="Format (optional)"')
  })

  it('is not clearable, so a blank format cannot be submitted', async () => {
    // The mechanism, not just the copy: `clearable` is what let the value go
    // back to null after the default was applied.
    const w = await mountTab()
    expect(formatSelect(w).props('clearable')).toBeFalsy()
    // Match format IS genuinely optional (`match_format?: string | null` on the
    // request DTO) and must stay clearable — this asymmetry is the fix, so
    // pin it or a later "make them consistent" cleanup silently undoes P-98.
    const matchFormat = w
      .findAllComponents({ name: 'VSelect' })
      .find((s) => s.props('label') === 'Match Format (optional)')
    expect(matchFormat, 'match format select rendered').toBeTruthy()
    expect(matchFormat!.props('clearable')).toBeTruthy()
  })

  it('defaults to a real backend format so an untouched dialog cannot 400', async () => {
    // The heart of P-98: previously `format` started as `null` and was sent as
    // `''`. It now starts on `StageFormat`'s own `#[default]`.
    const w = await mountTab()
    const value = formatSelect(w).props('modelValue')
    expect(value).toBe('single_elimination')
    expect(BACKEND_STAGE_FORMATS).toContain(value)
  })

  it('POSTs a parseable format when the organiser never touches the picker', async () => {
    // End-to-end within the unit: fill only the name — the exact path the
    // "(optional)" label invited — and assert what actually goes on the wire.
    // Asserting the request body is what distinguishes this fix from a cosmetic
    // label change; `''` here is the 400.
    mockPost.mockResolvedValue({
      data: { data: { id: 's1', name: 'Group Phase', stage_order: 1, format: 'single_elimination' } },
    })

    const w = await mountTab()
    const dialog = w.findComponent({ name: 'VDialog' })
    const nameField = dialog
      .findAllComponents({ name: 'VTextField' })
      .find((f) => f.props('label') === 'Stage Name')
    expect(nameField, 'stage name field rendered').toBeTruthy()
    await nameField!.setValue('Group Phase')

    const createBtn = w
      .findAllComponents({ name: 'VBtn' })
      .find((b) => b.text().trim() === 'Create')
    expect(createBtn, 'Create button rendered').toBeTruthy()
    await createBtn!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledTimes(1)
    const body = mockPost.mock.calls[0]![1].body as { format: string; name: string }
    expect(body.name).toBe('Group Phase')
    expect(body.format).toBe('single_elimination')
    expect(body.format).not.toBe('')
    expect(BACKEND_STAGE_FORMATS).toContain(body.format)
  })
})
