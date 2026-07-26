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
 * this was written while nothing in the product could put a season into
 * `soft_lock` or `hard_lock` — `update_season` dropped `roster_lock_status`
 * and `update_roster_lock` had no HTTP route (P-14) — so an e2e test could
 * only ever observe `open`, which the BROKEN code also rendered as "Open" and
 * therefore could not tell a fixed build from a broken one.
 *
 * P-14 is fixed (api 297a19e): `PATCH /v1/league-seasons/{id}` now applies the
 * lock, and e2e coverage of a real lock lives in
 * `e2e/team-management.spec.ts`. This stays a component test because it is a
 * *rendering* table — one row per schema value, including a value the schema
 * forbids, to prove the fail-closed mapping. Driving three seasons through the
 * API to assert three chip labels would be slower and prove less.
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
    // The cast is deliberate and is the POINT of the test. Since P-31,
    // `roster_lock_status` is the union 'open'|'soft_lock'|'hard_lock', so a
    // drifted literal no longer type-checks — which is the fix working. But the
    // server can still send something this client has never heard of (an older
    // build, a newly added variant), and that is exactly the case this asserts.
    // Casting here keeps the runtime guarantee under test without weakening the
    // type anywhere in application code.
    const w = mountPanel([makeSeason({ roster_lock_status: 'locked' as never })])
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
