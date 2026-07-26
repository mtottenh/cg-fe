import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import LeagueSeasonEditModal from '@/components/admin/LeagueSeasonEditModal.vue'
import type { components as ApiComponents } from '@/api/types'

type LeagueSeasonResponse = ApiComponents['schemas']['LeagueSeasonResponse']

/**
 * COVERAGE-PLAN P-207 — the Status select used to offer all six season
 * statuses while the PATCH enforces the transition chain (P-199), so every
 * chain-illegal pick was a control that could only 400 (the P-82 shape).
 *
 * The option list is now the season's current status plus
 * `allowed_status_transitions` — SERVED by the API from
 * `SeasonStatus::allowed_transitions`, the same list the PATCH enforces —
 * so the client holds no copy of the lifecycle rule (the P-15 lesson).
 * These tests pin that derivation: what the server allows is what the
 * operator is offered, nothing more.
 */

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

function makeSeason(
  status: LeagueSeasonResponse['status'],
  allowed: LeagueSeasonResponse['allowed_status_transitions'],
): LeagueSeasonResponse {
  return {
    id: 'season-1',
    league_id: 'league-1',
    name: 'Season One',
    slug: 'season-one',
    team_size_min: 5,
    team_size_max: 5,
    max_substitutes: 2,
    max_teams: 16,
    roster_lock_status: 'open',
    status,
    allowed_status_transitions: allowed,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as LeagueSeasonResponse
}

function mountModal(season: LeagueSeasonResponse) {
  wrapper = mount(LeagueSeasonEditModal, {
    props: { season, modelValue: true },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
  return wrapper
}

/** The items offered by the Vuetify select labelled "Status". */
function statusItems(w: VueWrapper): Array<{ value: string; label: string }> {
  const selects = w.findAllComponents({ name: 'VSelect' })
  const found = selects.find((c) => c.props('label') === 'Status')
  if (!found) throw new Error('No VSelect labelled "Status"')
  return found.props('items') as Array<{ value: string; label: string }>
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('LeagueSeasonEditModal status options (P-207)', () => {
  it('offers a draft season only its legal moves: stay, open registration, cancel', () => {
    const w = mountModal(makeSeason('draft', ['registration', 'cancelled']))
    expect(statusItems(w).map((i) => i.value)).toEqual(['draft', 'registration', 'cancelled'])
    // Labels come from the shared map, not re-typed strings.
    expect(statusItems(w).map((i) => i.label)).toEqual([
      'Draft',
      'Registration Open',
      'Cancelled',
    ])
  })

  it('offers an active season playoffs, completion, or cancellation — never a move backwards', () => {
    const w = mountModal(makeSeason('active', ['playoffs', 'completed', 'cancelled']))
    const values = statusItems(w).map((i) => i.value)
    expect(values).toEqual(['active', 'playoffs', 'completed', 'cancelled'])
    expect(values).not.toContain('draft')
    expect(values).not.toContain('registration')
  })

  it('offers a completed season nothing but itself — terminal means terminal', () => {
    const w = mountModal(makeSeason('completed', []))
    expect(statusItems(w).map((i) => i.value)).toEqual(['completed'])
  })

  it('takes the list from the server field, not a client-side copy of the chain', () => {
    // A deliberately wrong server answer must flow through untouched — if the
    // client second-guessed it, there would be two copies of the rule and
    // they could disagree (the exact defect class P-199 closed server-side).
    const w = mountModal(makeSeason('draft', ['completed']))
    expect(statusItems(w).map((i) => i.value)).toEqual(['draft', 'completed'])
  })
})
