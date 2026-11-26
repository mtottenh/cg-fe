import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import DisputeDetailModal from '@/components/admin/DisputeDetailModal.vue'
import { useDisputesStore } from '@/stores/disputes'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'
import type { components as ApiComponents } from '@/api/types'

/**
 * "Overturn" used to take the winner as a registration id typed by hand, and
 * the API did not check it against the match. The modal now reads the match
 * and takes the winner from the entered score, so the two cannot disagree and
 * no id is typed.
 */

type Dispute = ApiComponents['schemas']['DisputeResponse']

const vuetify = createVuetify({ components, directives })
let wrapper: VueWrapper | null = null

const dispute = {
  id: 'dispute-1',
  match_id: 'match-1',
  tournament_id: 'tour-1',
  disputed_by_user_id: 'user-1',
  disputed_by_registration_id: 'reg-b',
  reason: 'wrong_score',
  description: 'Wrong way round.',
  priority: 'normal',
  status: 'pending',
  evidence_ids: [],
  participant1_name: 'Alpha',
  participant2_name: 'Bravo',
  original_participant1_score: 2,
  original_participant2_score: 1,
  original_winner_registration_id: 'reg-a',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as Dispute

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function mountModal(fetchMatch: () => Promise<TournamentMatchResponse>) {
  const store = useDisputesStore()
  store.currentDispute = dispute
  store.currentThread = []
  vi.spyOn(useTournamentsStore(), 'fetchMatch').mockImplementation(fetchMatch)
  const resolveOverturn = vi.spyOn(store, 'resolveOverturn').mockResolvedValue({} as never)

  wrapper = mount(DisputeDetailModal, {
    props: { disputeId: 'dispute-1', modelValue: true },
    global: { plugins: [vuetify], provide: { [SnackbarKey as symbol]: createSnackbar() } },
    attachTo: document.body,
  })
  await flushPromises()

  const title = [...document.body.querySelectorAll<HTMLElement>('.v-expansion-panel-title')].find(
    (el) => el.textContent?.includes('Overturn Result'),
  )!
  title.click()
  await flushPromises()
  const panel = title.closest('.v-expansion-panel') as HTMLElement
  return { panel, resolveOverturn }
}

const theMatch = () =>
  Promise.resolve({
    id: 'match-1',
    participant1_registration_id: 'reg-a',
    participant2_registration_id: 'reg-b',
  } as TournamentMatchResponse)

async function setInput(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('DisputeDetailModal — overturn winner', () => {
  it('names the winner from the score and sends that side’s registration', async () => {
    const { panel, resolveOverturn } = await mountModal(theMatch)
    const [p1, p2] = [...panel.querySelectorAll<HTMLInputElement>('input[type="number"]')]

    // No id field at all once the match is known.
    expect(panel.textContent).not.toContain('Winner Reg ID')
    expect(panel.textContent).toContain('P1 Score * (Alpha)')

    await setInput(p1!, '1')
    await setInput(p2!, '2')
    expect(panel.querySelector('[data-testid="overturn-winner"]')!.textContent).toContain('Bravo')

    await setInput(panel.querySelector('textarea')!, 'Demo shows Bravo won.')
    const submit = [...panel.querySelectorAll<HTMLButtonElement>('button')].filter((b) =>
      b.textContent?.includes('Overturn Result'),
    ).pop()!
    expect(submit.disabled).toBe(false)
    submit.click()
    await flushPromises()

    expect(resolveOverturn).toHaveBeenCalledWith('dispute-1', {
      new_participant1_score: 1,
      new_participant2_score: 2,
      new_winner_registration_id: 'reg-b',
      notes: 'Demo shows Bravo won.',
    })
  })

  it('will not submit a level score, which has no winner', async () => {
    const { panel } = await mountModal(theMatch)
    const [p1, p2] = [...panel.querySelectorAll<HTMLInputElement>('input[type="number"]')]
    await setInput(p1!, '1')
    await setInput(p2!, '1')
    await setInput(panel.querySelector('textarea')!, 'notes')

    expect(panel.querySelector('[data-testid="overturn-winner"]')!.textContent).toContain('no winner')
    const submit = [...panel.querySelectorAll<HTMLButtonElement>('button')].filter((b) =>
      b.textContent?.includes('Overturn Result'),
    ).pop()!
    expect(submit.disabled).toBe(true)
  })

  it('falls back to a typed id when the match cannot be loaded', async () => {
    const { panel } = await mountModal(() => Promise.reject(new Error('offline')))
    expect(panel.textContent).toContain('Winner Reg ID')
  })
})
