import { describe, it, expect, afterEach } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import VetoPanel from '@/components/match/veto/VetoPanel.vue'
import { MatchLobbyKey, type MatchLobby, type VetoPhase } from '@/composables/useMatchLobby'

const vuetify = createVuetify({ components, directives })

/** Only what the panel's header reads; the child components are stubbed. */
function fakeLobby(phase: VetoPhase, timeRemaining: number | null): MatchLobby {
  return {
    session: ref({ side_selection_mode: 'knife', current_team_turn: 'reg-a' }),
    hasSession: computed(() => true),
    phase: computed(() => phase),
    isMyTurn: computed(() => false),
    isMyTeamsTurn: computed(() => false),
    canActInVeto: computed(() => false),
    maps: computed(() => []),
    pickedMaps: computed(() => []),
    actions: computed(() => []),
    currentAction: computed(() => ({ action_type: 'ban', team: 1 })),
    timeRemaining: ref(timeRemaining),
    mapsNeedingSideSelect: computed(() => []),
    coinFlipResult: ref(null),
    bothParticipantsConnected: computed(() => true),
    connected: ref(true),
    usingFallback: ref(false),
    initialize: async () => {},
  } as unknown as MatchLobby
}

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

async function mountPanel(phase: VetoPhase, timeRemaining: number | null) {
  wrapper = mount(VetoPanel, {
    props: {
      matchId: 'match-1',
      userRegistrationId: null,
      participant1RegistrationId: 'reg-a',
      participant2RegistrationId: 'reg-b',
      participant1Name: 'Alpha',
      participant2Name: 'Bravo',
    },
    global: {
      plugins: [vuetify],
      provide: { [MatchLobbyKey as symbol]: fakeLobby(phase, timeRemaining) },
      stubs: { VetoCoinFlip: true, VetoMapGrid: true, VetoSideSelect: true, VetoTimeline: true },
    },
  })
  await flushPromises()
  return wrapper
}

const timesUp = (w: VueWrapper) => w.find('[data-testid="veto-times-up"]')

describe('VetoPanel — turn clock at zero', () => {
  it('shows the seconds left while the clock is running', async () => {
    const w = await mountPanel('banning', 12)
    expect(w.text()).toContain('12s')
    expect(timesUp(w).exists()).toBe(false)
  })

  it('keeps a chip up at zero: the server picks automatically a moment later', async () => {
    const w = await mountPanel('banning', 0)
    expect(timesUp(w).text()).toContain("Time's up")
    expect(timesUp(w).text()).toContain('choosing automatically')
  })

  it('shows nothing once the veto is over', async () => {
    const w = await mountPanel('completed', 0)
    expect(timesUp(w).exists()).toBe(false)
  })
})
