import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      GET: vi.fn().mockResolvedValue({ data: { data: [] }, error: undefined, response: { ok: true, status: 200 } }),
      POST: vi.fn(),
      PUT: vi.fn(),
      DELETE: vi.fn(),
      PATCH: vi.fn(),
    },
  }
})

import ResultConfirmationPanel from '@/components/match/results/ResultConfirmationPanel.vue'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'
import type { ResultClaimResponse } from '@/stores/matchResults'
import { useEvidenceStore } from '@/stores/evidence'

const vuetify = createVuetify({ components, directives })

function makeClaim(overrides: Partial<ResultClaimResponse> = {}): ResultClaimResponse {
  return {
    id: 'claim-1',
    match_id: 'match-1',
    status: 'pending',
    source: 'participant',
    submitted_by_registration_id: 'reg-a',
    claimed_winner_registration_id: 'reg-a',
    claimed_participant1_score: 2,
    claimed_participant2_score: 1,
    game_results: [],
    evidence_ids: [],
    demo_link_ids: [],
    auto_confirm_at: new Date(Date.now() + 9 * 60_000).toISOString(),
    ...overrides,
  } as ResultClaimResponse
}

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function mountPanel(claim: ResultClaimResponse, submitterName = 'Team Bravo') {
  const pinia = createPinia()
  setActivePinia(pinia)
  // The panel loads linked demos on mount; irrelevant to who reported it.
  vi.spyOn(useEvidenceStore(), 'fetchLinkedDemos').mockResolvedValue([])
  wrapper = mount(ResultConfirmationPanel, {
    props: {
      matchId: 'match-1',
      claim,
      teamAName: 'Team Alpha',
      teamBName: 'Team Bravo',
      teamARegistrationId: 'reg-a',
      teamBRegistrationId: 'reg-b',
      submitterName,
    },
    global: {
      plugins: [vuetify, pinia],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
      stubs: { ResultDisputeModal: true },
    },
  })
  await flushPromises()
  return wrapper
}

/**
 * A result reported by the game server has no submitting team. The card used
 * to say "Opponent Submitted Result — <participant 2> has submitted…" to both
 * teams, including participant 2 themselves.
 */
describe('ResultConfirmationPanel — who reported the result', () => {
  it('attributes a server-reported claim to the game server, not to a team', async () => {
    const w = await mountPanel(makeClaim({ source: 'server', submitted_by_registration_id: null }))

    expect(w.text()).toContain('Game Server Reported Result')
    expect(w.find('[data-testid="result-from-server"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Opponent Submitted Result')
    expect(w.text()).not.toContain('Team Bravo has submitted')
  })

  it('warns that a server-reported result becomes final when the countdown ends', async () => {
    const w = await mountPanel(makeClaim({ source: 'server', submitted_by_registration_id: null }))

    const note = w.find('[data-testid="result-auto-confirm"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('auto-confirmed')
    expect(note.text()).toContain('dispute it before then')
  })

  it('still names the opposing team for a captain-submitted claim', async () => {
    const w = await mountPanel(makeClaim())

    expect(w.text()).toContain('Opponent Submitted Result')
    expect(w.text()).toContain('Team Bravo has submitted')
    expect(w.find('[data-testid="result-from-server"]').exists()).toBe(false)
  })
})
