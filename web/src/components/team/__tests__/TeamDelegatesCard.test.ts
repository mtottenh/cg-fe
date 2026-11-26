import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
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
import TeamDelegatesCard from '@/components/team/TeamDelegatesCard.vue'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'

/**
 * Only a captain (or the owner) can schedule, check in and veto for a team;
 * the delegate endpoints existed with no UI calling them, so a team whose
 * captain was away had no way to let anyone else act.
 */

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock
const mockDelete = api.DELETE as unknown as Mock
const vuetify = createVuetify({ components, directives })
const PATH = '/v1/leagues/{league_id}/teams/{team_id}/seasons/{season_id}/veto-delegates'
const IDS = { league_id: 'league-1', team_id: 'team-1', season_id: 'ts-1' }

const MEMBERS = [
  { player_id: 'p-cap', display_name: 'Cap', role: 'captain', status: 'active' },
  { player_id: 'p-two', display_name: 'Two', role: 'player', status: 'active' },
  { player_id: 'p-three', display_name: 'Three', role: 'player', status: 'active' },
  { player_id: 'p-gone', display_name: 'Gone', role: 'player', status: 'left' },
]

const delegate = (playerId: string) => ({
  id: `d-${playerId}`, player_id: playerId, team_season_id: 'ts-1', is_active: true,
  delegated_by_role: 'captain', delegated_by_user_id: 'u-cap', created_at: '2032-04-17T19:00:00Z',
})

let wrapper: VueWrapper | null = null
afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
  mockGet.mockReset()
  mockPost.mockReset()
  mockDelete.mockReset()
})

async function mountCard(existing: ReturnType<typeof delegate>[] = []) {
  mockGet.mockResolvedValue({ data: { data: { delegates: existing } } })
  wrapper = mount(TeamDelegatesCard, {
    global: {
      plugins: [createPinia(), vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
    props: { leagueId: 'league-1', teamId: 'team-1', teamSeasonId: 'ts-1', members: MEMBERS },
  })
  await flushPromises()
  return wrapper
}

describe('TeamDelegatesCard', () => {
  it('lists the team\'s delegates and says what a delegate can do', async () => {
    const w = await mountCard([delegate('p-two')])
    expect(mockGet).toHaveBeenCalledWith(PATH, { params: { path: IDS } })
    expect(w.find('[data-testid="team-delegate-p-two"]').text()).toContain('Two')
    expect(w.text()).toContain('agree match times, check the team in and run the')
    expect(w.text()).toContain('Can schedule, check in and veto for the team')
  })

  it('offers only active members who cannot already act for the team', async () => {
    const w = await mountCard([delegate('p-two')])
    const items = w.findComponent({ name: 'VSelect' }).props('items') as { player_id: string }[]
    expect(items.map((m) => m.player_id)).toEqual(['p-three'])
  })

  it('adds a delegate for the whole team season', async () => {
    const w = await mountCard()
    mockPost.mockResolvedValue({ data: { data: delegate('p-three') } })
    w.findComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'p-three')
    await flushPromises()
    await w.find('[data-testid="team-delegate-add"]').trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith(PATH, { params: { path: IDS }, body: { player_id: 'p-three' } })
    expect(w.find('[data-testid="team-delegate-p-three"]').exists()).toBe(true)
  })

  it('removes a delegate', async () => {
    const w = await mountCard([delegate('p-two')])
    mockDelete.mockResolvedValue({ data: undefined })
    await w.find('[data-testid="team-delegate-p-two"] button').trigger('click')
    await flushPromises()
    expect(mockDelete).toHaveBeenCalledWith(`${PATH}/{delegate_id}`, {
      params: { path: { ...IDS, delegate_id: 'd-p-two' } },
    })
    expect(w.find('[data-testid="team-delegates-empty"]').exists()).toBe(true)
  })
})
