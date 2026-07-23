import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import LeagueSeasonsPanel from '@/components/admin/LeagueSeasonsPanel.vue'
import type { components as ApiComponents } from '@/api/types'

/**
 * COVERAGE-PLAN §9b P-22 — the Roster column always read "Open".
 *
 * WHY THIS IS A COMPONENT TEST AND NOT AN E2E TEST:
 * nothing in the product can put a season into `soft_lock` or `hard_lock`.
 * `roster_lock_status` is accepted and validated by the update DTO but
 * `LeagueSeasonService::update_season` never forwards it to the repository, and
 * `update_roster_lock` has no HTTP route (COVERAGE-PLAN §9b P-14). An e2e test
 * can therefore only ever observe `open`, which the BROKEN code also rendered as
 * "Open" — it could not tell a fixed build from a broken one. Driving the
 * component with the states the schema permits is the honest way to prove the
 * column reads them correctly.
 */

type LeagueSeason = ApiComponents['schemas']['LeagueSeasonResponse']

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

function makeSeason(overrides: Partial<LeagueSeason> = {}): LeagueSeason {
  return {
    id: 'season-1',
    league_id: 'league-1',
    created_by: 'user-1',
    name: 'Spring Split',
    slug: 'spring-split',
    description: null,
    status: 'active',
    roster_lock_status: 'open',
    max_substitutes: 2,
    max_teams: 16,
    team_size_min: 5,
    team_size_max: 7,
    registration_start: null,
    registration_end: null,
    season_start: null,
    season_end: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as LeagueSeason
}

function mountPanel(seasons: LeagueSeason[]) {
  wrapper = mount(LeagueSeasonsPanel, {
    props: { leagueId: 'league-1', seasons, loading: false },
    global: { plugins: [vuetify] },
  })
  return wrapper
}

/** Text of the row cell under the "Roster" header. */
function rosterCellText(w: VueWrapper, rowIndex = 0): string {
  const headers = w.findAll('thead th').map((th) => th.text().trim())
  const column = headers.indexOf('Roster')
  expect(column, 'Roster column present in the seasons table').toBeGreaterThanOrEqual(0)
  // Index access rather than `.at()`: the app tsconfig's lib target predates
  // ES2022, so `Array.prototype.at` is not in scope for this project.
  const cells = w.findAll('tbody tr')[rowIndex]!.findAll('td')
  return cells[column]!.text().trim()
}

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('LeagueSeasonsPanel roster-lock column', () => {
  it('reads "Open" for an unlocked season', () => {
    const w = mountPanel([makeSeason({ roster_lock_status: 'open' })])
    expect(rosterCellText(w)).toBe('Open')
  })

  it('reads "Roster Soft-Locked" for a soft-locked season', () => {
    const w = mountPanel([makeSeason({ roster_lock_status: 'soft_lock' })])
    expect(rosterCellText(w)).toBe('Roster Soft-Locked')
  })

  it('reads "Roster Locked" for a hard-locked season — the case that always said "Open"', () => {
    const w = mountPanel([makeSeason({ roster_lock_status: 'hard_lock' })])
    expect(rosterCellText(w)).toBe('Roster Locked')
  })

  it('fails CLOSED: an unrecognised lock value is reported as locked, never as Open', () => {
    // The whole P-4/P-10/P-11/P-22 defect family is a hand-rolled comparison
    // drifting away from the backend's vocabulary. For a control whose job is to
    // report that mutations are BLOCKED, an unknown state must not read as
    // "everything is permitted" — see src/utils/rosterLock.ts.
    const w = mountPanel([makeSeason({ roster_lock_status: 'locked' })])
    expect(rosterCellText(w)).toBe('Roster Locked')
  })

  it('renders each row against its own lock state', () => {
    const w = mountPanel([
      makeSeason({ id: 's1', name: 'Open Season', roster_lock_status: 'open' }),
      makeSeason({ id: 's2', name: 'Locked Season', roster_lock_status: 'hard_lock' }),
    ])
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(rosterCellText(w, 0)).toBe('Open')
    expect(rosterCellText(w, 1)).toBe('Roster Locked')
  })
})
