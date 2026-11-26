import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import VetoSideSelect from '@/components/match/veto/VetoSideSelect.vue'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'
import type { VetoActionResponse, MapStatusResponse } from '@/stores/veto'

const vuetify = createVuetify({ components, directives })

const pick = (overrides: Partial<VetoActionResponse> = {}) =>
  ({
    id: 'action-3',
    action_number: 3,
    action_type: 'pick',
    map_id: 'de_nuke',
    performed_by_registration_id: 'reg-picker',
    ...overrides,
  }) as VetoActionResponse

const maps = [
  { map_id: 'de_nuke', map_name: 'Nuke', game_number: 1 },
  { map_id: 'de_inferno', map_name: 'Inferno', game_number: 2 },
] as MapStatusResponse[]

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function mountCard(props: {
  userRegistrationId: string | null
  canAct?: boolean
  actions?: VetoActionResponse[]
}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  wrapper = mount(VetoSideSelect, {
    props: {
      matchId: 'match-1',
      actionsNeedingSide: props.actions ?? [pick()],
      userRegistrationId: props.userRegistrationId,
      canAct: props.canAct,
      maps,
    },
    global: { plugins: [vuetify, pinia], provide: { [SnackbarKey as symbol]: createSnackbar() } },
  })
  return wrapper
}

const card = (w: VueWrapper) => w.find('[data-testid="side-select-card"]')

describe('VetoSideSelect — the owed side choice cannot be missed', () => {
  it('tells the captain who owes the choice to choose now, with the buttons', () => {
    const w = mountCard({ userRegistrationId: 'reg-opponent', canAct: true })
    expect(card(w).attributes('data-urgency')).toBe('choose')
    const callout = w.find('[data-testid="side-select-callout"]')
    expect(callout.text()).toContain('Choose your starting side for Nuke now')
    expect(callout.text()).toContain('knife round if the veto finishes first')
    expect(w.text()).toContain('CT')
  })

  it('names every map the team still owes a side for', () => {
    const w = mountCard({
      userRegistrationId: 'reg-opponent',
      canAct: true,
      actions: [pick(), pick({ id: 'action-9', action_number: 9, map_id: 'de_inferno' })],
    })
    expect(w.find('[data-testid="side-select-callout"]').text()).toContain('Nuke and Inferno')
  })

  it("tells a rostered non-captain that the captain must choose, with no buttons", () => {
    const w = mountCard({ userRegistrationId: 'reg-opponent', canAct: false })
    expect(card(w).attributes('data-urgency')).toBe('captain')
    expect(w.find('[data-testid="side-select-callout"]').text()).toContain(
      "Your captain must choose your team's starting side for Nuke now",
    )
    expect(w.findAll('button')).toHaveLength(0)
  })

  it('stays low-key for the picking team, whose opponent chooses', () => {
    const w = mountCard({ userRegistrationId: 'reg-picker', canAct: true })
    expect(card(w).attributes('data-urgency')).toBe('none')
    expect(w.find('[data-testid="side-select-callout"]').exists()).toBe(false)
    expect(w.text()).toContain('Waiting for your opponent to select a side')
  })

  it('stays low-key for a spectator', () => {
    const w = mountCard({ userRegistrationId: null })
    expect(card(w).attributes('data-urgency')).toBe('none')
    expect(w.findAll('button')).toHaveLength(0)
  })
})
