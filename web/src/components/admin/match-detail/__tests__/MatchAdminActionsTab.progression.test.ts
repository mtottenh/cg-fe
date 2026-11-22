import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { defineComponent, h, type PropType } from 'vue'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api } from '@/api'
import MatchAdminActionsTab from '@/components/admin/match-detail/MatchAdminActionsTab.vue'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'
import type { useConfirmDialog } from '@/composables/useConfirmDialog'
import type { TournamentMatchResponse } from '@/stores/tournaments'

const mockPost = api.POST as unknown as Mock
const vuetify = createVuetify({ components, directives })

const P1_REG = '00000000-0000-0000-0000-0000000000a1'
const P2_REG = '00000000-0000-0000-0000-0000000000a2'
const DETAIL = 'Match score 0-0 does not determine a winner. Supply participant1_score and participant2_score'

/**
 * Vuetify's v-dialog teleports and animates, which jsdom renders poorly. This
 * stand-in renders the same controller state inline: message, error and the
 * confirm action wired to `dialog.execute` exactly as the real host does.
 */
const ConfirmDialogHostStub = defineComponent({
  props: { dialog: { type: Object as PropType<ReturnType<typeof useConfirmDialog>>, required: true } },
  setup(props) {
    return () => props.dialog.state.open
      ? h('div', { 'data-testid': 'confirm' }, [
          h('p', { 'data-testid': 'confirm-message' }, props.dialog.state.message),
          props.dialog.state.dialogError
            ? h('p', { 'data-testid': 'confirm-error' }, props.dialog.state.dialogError)
            : null,
          h('button', { 'data-testid': 'confirm-go', onClick: () => props.dialog.execute() }, 'go'),
        ])
      : null
  },
})

function match(p1: number, p2: number, overrides: Partial<TournamentMatchResponse> = {}): TournamentMatchResponse {
  return {
    id: 'match-1',
    tournament_id: 'tour-1',
    stage_id: 'stage-1',
    bracket_id: 'bracket-1',
    bracket_position: 'R1M1',
    round: 1,
    match_number: 1,
    status: 'completed',
    match_format: 'bo3',
    maps_required: 3,
    check_in_required: false,
    veto_required: false,
    disputed: false,
    participant1_registration_id: P1_REG,
    participant2_registration_id: P2_REG,
    participant1_name: 'Alpha',
    participant2_name: 'Bravo',
    participant1_score: p1,
    participant2_score: p2,
    winner_registration_id: P1_REG,
    scheduled_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  }
}

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})
beforeEach(() => {
  vi.clearAllMocks()
})

async function mountTab(m: TournamentMatchResponse) {
  const pinia = createPinia()
  setActivePinia(pinia)
  wrapper = mount(MatchAdminActionsTab, {
    props: { match: m, tournamentId: 'tour-1' },
    global: {
      plugins: [pinia, vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
      stubs: { ConfirmDialogHost: ConfirmDialogHostStub },
    },
  })
  await flushPromises()
  return wrapper
}

function input(w: VueWrapper, testid: string) {
  return w.find(`[data-testid="${testid}"] input`)
}

function buttonByText(w: VueWrapper, text: string) {
  const btn = w.findAll('button').find((b) => b.text().trim() === text)
  if (!btn) throw new Error(`no button "${text}"`)
  return btn
}

async function confirm(w: VueWrapper) {
  await w.find('[data-testid="confirm-go"]').trigger('click')
  await flushPromises()
}

describe('MatchAdminActionsTab — progression scores', () => {
  it('labels the score inputs with participant names and prefills the stored score', async () => {
    const w = await mountTab(match(2, 1))
    expect(w.find('[data-testid="process-p1-score"]').text()).toContain('Alpha score')
    expect(w.find('[data-testid="process-p2-score"]').text()).toContain('Bravo score')
    expect((input(w, 'process-p1-score').element as HTMLInputElement).value).toBe('2')
    expect((input(w, 'process-p2-score').element as HTMLInputElement).value).toBe('1')
  })

  it('omits scores when the stored score already favours the winner', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: {} } })
    const w = await mountTab(match(2, 1))
    await buttonByText(w, 'Process').trigger('click')
    expect(w.find('[data-testid="confirm-message"]').text()).toContain('Score stays Alpha 2–1 Bravo')
    await confirm(w)
    expect(mockPost).toHaveBeenCalledWith('/v1/admin/matches/{match_id}/progression/process', {
      params: { path: { match_id: 'match-1' } },
      body: { winner_registration_id: P1_REG, loser_registration_id: P2_REG },
    })
  })

  it('blocks Process on an unplayed 0–0 match until scores are entered, then sends them', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: {} } })
    const w = await mountTab(match(0, 0))
    expect((input(w, 'process-p1-score').element as HTMLInputElement).value).toBe('')
    expect(w.find('[data-testid="process-score-error"]').text()).toMatch(/does not determine a winner/)
    expect(buttonByText(w, 'Process').attributes('disabled')).toBeDefined()

    await input(w, 'process-p1-score').setValue('2')
    await input(w, 'process-p2-score').setValue('0')
    expect(w.find('[data-testid="process-score-error"]').exists()).toBe(false)
    await buttonByText(w, 'Process').trigger('click')
    await confirm(w)
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      winner_registration_id: P1_REG,
      loser_registration_id: P2_REG,
      participant1_score: 2,
      participant2_score: 0,
    })
  })

  it('validates entered scores against the best-of and the selected winner', async () => {
    const w = await mountTab(match(0, 0))
    await input(w, 'process-p1-score').setValue('3')
    await input(w, 'process-p2-score').setValue('0')
    expect(w.find('[data-testid="process-score-error"]').text()).toMatch(/Bo3 the winner must have exactly 2 games/)

    await input(w, 'process-p1-score').setValue('0')
    await input(w, 'process-p2-score').setValue('2')
    expect(w.find('[data-testid="process-score-error"]').text()).toMatch(/Alpha is the selected winner/)

    await input(w, 'process-p2-score').setValue('')
    expect(w.find('[data-testid="process-score-error"]').text()).toMatch(/both participants/)
    expect(buttonByText(w, 'Process').attributes('disabled')).toBeDefined()
    await buttonByText(w, 'Process').trigger('click')
    expect(w.find('[data-testid="confirm"]').exists()).toBe(false)
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('hints that a contradicting stored score will be swapped on Reapply, and omits scores', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: {} } })
    const w = await mountTab(match(2, 1))
    ;(w.vm as unknown as { reapplyWinnerId: string }).reapplyWinnerId = P2_REG
    await flushPromises()

    const hint = w.find('[data-testid="reapply-score-swap-hint"]')
    expect(hint.text()).toContain('2–1 favours Alpha')
    expect(hint.text()).toContain('swapped to 1–2 so Bravo wins')

    await buttonByText(w, 'Reapply').trigger('click')
    await confirm(w)
    expect(mockPost).toHaveBeenCalledWith('/v1/admin/matches/{match_id}/progression/reapply', {
      params: { path: { match_id: 'match-1' } },
      body: { new_winner_registration_id: P2_REG },
    })
  })

  it('sends edited scores on Reapply instead of swapping', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: {} } })
    const w = await mountTab(match(2, 1))
    ;(w.vm as unknown as { reapplyWinnerId: string }).reapplyWinnerId = P2_REG
    await flushPromises()
    await input(w, 'reapply-p1-score').setValue('0')
    await input(w, 'reapply-p2-score').setValue('2')
    expect(w.find('[data-testid="reapply-score-swap-hint"]').exists()).toBe(false)

    await buttonByText(w, 'Reapply').trigger('click')
    await confirm(w)
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      new_winner_registration_id: P2_REG,
      participant1_score: 0,
      participant2_score: 2,
    })
  })

  it('surfaces the backend detail when the request is refused', async () => {
    mockPost.mockResolvedValueOnce({ error: { status: 400, detail: DETAIL } })
    const w = await mountTab(match(2, 1))
    await buttonByText(w, 'Process').trigger('click')
    await confirm(w)
    expect(w.find('[data-testid="confirm-error"]').text()).toBe(DETAIL)
  })
})
