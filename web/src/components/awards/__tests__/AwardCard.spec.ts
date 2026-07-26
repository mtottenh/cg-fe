import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import AwardCard from '@/components/awards/AwardCard.vue'
import type { AwardResponse, LeaderboardEntryResponse } from '@/stores/awards'

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

function makeAward(overrides: Partial<AwardResponse> = {}): AwardResponse {
  return {
    id: 'award-1',
    scope_type: 'tournament',
    scope_id: 'tourn-1',
    game_id: 'game-1',
    template_id: null,
    name: 'Swag 7',
    description: 'Most MAG-7 kills',
    icon: 'mdi-spray',
    color: '#8E24AA',
    stat_key: 'kills.weapon.mag7',
    aggregation: 'sum',
    direction: 'desc',
    subject_type: 'player',
    min_qualifier_type: null,
    min_qualifier_value: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as AwardResponse
}

function makeEntry(overrides: Partial<LeaderboardEntryResponse> = {}): LeaderboardEntryResponse {
  return {
    player_id: 'player-1',
    display_name: 'Player One',
    avatar_url: null,
    rank: 1,
    value: 7,
    demos_counted: 2,
    ...overrides,
  } as LeaderboardEntryResponse
}

function mountCard(props: Record<string, unknown> = {}) {
  wrapper = mount(AwardCard, {
    props: { award: makeAward(), ...props },
    global: { plugins: [vuetify] },
  })
  return wrapper
}

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('AwardCard', () => {
  it('renders name, description and the live chip for active awards', () => {
    const w = mountCard()
    expect(w.find('[data-testid="award-name"]').text()).toContain('Swag 7')
    expect(w.text()).toContain('Most MAG-7 kills')
    expect(w.find('[data-testid="award-live-chip"]').exists()).toBe(true)
    expect(w.find('[data-testid="award-finalized-chip"]').exists()).toBe(false)
  })

  it('renders the finalized trophy chip and styling for finalized awards', () => {
    const w = mountCard({ award: makeAward({ status: 'finalized' }) })
    expect(w.find('[data-testid="award-finalized-chip"]').exists()).toBe(true)
    expect(w.find('[data-testid="award-live-chip"]').exists()).toBe(false)
    expect(w.find('.award-card--finalized').exists()).toBe(true)
  })

  it('renders only the podium (rank <= 3) with values', () => {
    const w = mountCard({
      entries: [
        makeEntry({ player_id: 'p1', display_name: 'Alpha', rank: 1, value: 12 }),
        makeEntry({ player_id: 'p2', display_name: 'Bravo', rank: 2, value: 8 }),
        makeEntry({ player_id: 'p3', display_name: 'Charlie', rank: 3, value: 5 }),
        makeEntry({ player_id: 'p4', display_name: 'Delta', rank: 4, value: 2 }),
      ],
    })
    const podium = w.findAll('[data-testid="podium-entry"]')
    expect(podium).toHaveLength(3)
    expect(podium[0]!.text()).toContain('Alpha')
    expect(podium[0]!.text()).toContain('12')
    expect(w.find('[data-testid="award-podium"]').text()).not.toContain('Delta')
  })

  it('marks tied ranks as shared', () => {
    const w = mountCard({
      entries: [
        makeEntry({ player_id: 'p1', display_name: 'Alpha', rank: 1, value: 7 }),
        makeEntry({ player_id: 'p2', display_name: 'Bravo', rank: 1, value: 7 }),
        makeEntry({ player_id: 'p3', display_name: 'Charlie', rank: 3, value: 4 }),
      ],
    })
    const sharedChips = w.findAll('[data-testid="shared-rank-chip"]')
    expect(sharedChips).toHaveLength(2)
    // The non-tied rank has no shared marker.
    const podium = w.findAll('[data-testid="podium-entry"]')
    expect(podium[2]!.find('[data-testid="shared-rank-chip"]').exists()).toBe(false)
  })

  it('shows the empty message when there are no entries', () => {
    const w = mountCard({ entries: [] })
    expect(w.find('[data-testid="award-no-standings"]').exists()).toBe(true)
  })

  it('expands to full standings including sub-podium ranks', async () => {
    const w = mountCard({
      entries: [
        makeEntry({ player_id: 'p1', display_name: 'Alpha', rank: 1 }),
        makeEntry({ player_id: 'p4', display_name: 'Delta', rank: 4, value: 2 }),
      ],
      currentPlayerId: 'p4',
    })
    await w.find('[data-testid="award-expand"]').trigger('click')
    await flushPromises()
    const standings = w.find('[data-testid="award-standings"]')
    expect(standings.exists()).toBe(true)
    expect(standings.text()).toContain('Delta')
    // "Your rank" row highlighted for the logged-in player.
    expect(w.find('[data-testid="standings-row-you"]').text()).toContain('You')
  })
})
