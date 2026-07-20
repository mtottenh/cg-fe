import { describe, it, expect, afterEach, beforeEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

// Mock only the `api` client; the store helpers stay real so the component
// exercises the true fetch path.
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api } from '@/api'
import StatsLeaderboard from '@/components/awards/StatsLeaderboard.vue'
import type { PlayerStatsEntryResponse } from '@/stores/awards'

const mockGet = api.GET as unknown as Mock
const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

function makeRow(overrides: Partial<PlayerStatsEntryResponse> = {}): PlayerStatsEntryResponse {
  return {
    player_id: 'player-1',
    display_name: 'Player One',
    avatar_url: null,
    kills: 20,
    deaths: 5,
    assists: 2,
    total_damage: 1600,
    adr: 83.27,
    rounds_played: 20,
    demos_counted: 1,
    ...overrides,
  } as PlayerStatsEntryResponse
}

function mountTable(rows: PlayerStatsEntryResponse[]) {
  mockGet.mockResolvedValue({ data: { data: rows } })
  wrapper = mount(StatsLeaderboard, {
    props: { scope: 'tournament', scopeId: 'tourn-1' },
    global: {
      plugins: [vuetify],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('StatsLeaderboard', () => {
  it('fetches on mount for the tournament scope and renders the columns', async () => {
    const w = mountTable([makeRow()])
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/stats-leaderboard', {
      params: {
        path: { tournament_id: 'tourn-1' },
        query: { sort: 'kills', min_rounds: undefined, min_demos: undefined, limit: undefined },
      },
    })

    const headerText = w.find('[data-testid="stats-leaderboard-table"]').text()
    for (const col of ['Player', 'Kills', 'Deaths', 'Assists', 'Damage', 'ADR', 'Demos']) {
      expect(headerText).toContain(col)
    }
  })

  it('formats K/D/A and Damage as integers, ADR to one decimal', async () => {
    const w = mountTable([
      makeRow({ kills: 20, deaths: 5, assists: 2, total_damage: 1600, adr: 83.27, demos_counted: 3 }),
    ])
    await flushPromises()

    expect(w.find('[data-testid="stat-kills"]').text()).toBe('20')
    expect(w.find('[data-testid="stat-deaths"]').text()).toBe('5')
    expect(w.find('[data-testid="stat-assists"]').text()).toBe('2')
    expect(w.find('[data-testid="stat-damage"]').text()).toBe('1600')
    expect(w.find('[data-testid="stat-adr"]').text()).toBe('83.3')
    expect(w.find('[data-testid="stat-demos"]').text()).toBe('3')
  })

  it('renders a row per player with a profile link', async () => {
    const w = mountTable([
      makeRow({ player_id: 'p1', display_name: 'Alpha' }),
      makeRow({ player_id: 'p2', display_name: 'Bravo' }),
    ])
    await flushPromises()

    const links = w.findAll('[data-testid="stats-player-link"]')
    expect(links).toHaveLength(2)
    expect(w.text()).toContain('Alpha')
    expect(w.text()).toContain('Bravo')
  })

  it('shows the empty state when there are no stats', async () => {
    const w = mountTable([])
    await flushPromises()
    expect(w.find('[data-testid="stats-leaderboard-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="stats-leaderboard-empty"]').text()).toContain('No Player Stats Yet')
  })
})
