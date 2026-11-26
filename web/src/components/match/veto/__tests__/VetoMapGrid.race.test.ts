import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import VetoMapGrid from '../VetoMapGrid.vue'
import GameMapCard from '@/components/GameMapCard.vue'
import { useVetoStore } from '@/stores/veto'
import { ApiError } from '@/api'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'

/**
 * A ban or pick that loses a race (the opponent's action or the turn timing
 * out landed first) is refused with 409. The board on screen is then behind,
 * so the grid says so and re-reads it.
 */

const vuetify = createVuetify({ components, directives })
let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function mountGrid() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const snackbar = createSnackbar()
  const store = useVetoStore()
  wrapper = mount(VetoMapGrid, {
    props: {
      maps: [
        { map_id: 'de_nuke', map_name: 'Nuke', status: 'available' },
        { map_id: 'de_inferno', map_name: 'Inferno', status: 'available' },
      ],
      phase: 'banning',
      isMyTurn: true,
      matchId: 'm-1',
      currentAction: { action_type: 'ban', team: 1 },
      userRegistrationId: 'reg-a',
      participant1RegistrationId: 'reg-a',
      participant2RegistrationId: 'reg-b',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    global: { plugins: [pinia, vuetify], provide: { [SnackbarKey as symbol]: snackbar } },
  })
  return { w: wrapper, store, snackbar }
}

async function banNuke(w: VueWrapper) {
  w.findAllComponents(GameMapCard)[0]!.vm.$emit('select')
  await flushPromises()
  await w.find('[data-testid="veto-confirm-action"]').trigger('click')
  await flushPromises()
}

describe('VetoMapGrid when an action loses a race', () => {
  it('explains and re-reads the board on a 409', async () => {
    const { w, store, snackbar } = mountGrid()
    vi.spyOn(store, 'performVetoAction').mockRejectedValue(new ApiError(409, 'stale turn'))
    const resync = vi.spyOn(store, 'getVetoSession').mockResolvedValue(null as never)
    await banNuke(w)
    expect(resync).toHaveBeenCalledWith('m-1')
    expect(snackbar.text).toContain('The turn moved on')
  })

  it('also re-reads the board after any other refusal', async () => {
    const { w, store } = mountGrid()
    vi.spyOn(store, 'performVetoAction').mockRejectedValue(new ApiError(400, 'Not your turn'))
    const resync = vi.spyOn(store, 'getVetoSession').mockResolvedValue(null as never)
    await banNuke(w)
    expect(resync).toHaveBeenCalledWith('m-1')
  })
})
