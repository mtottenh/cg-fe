import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import { createSnackbar, SnackbarKey } from '@/composables/useSnackbar'
import MatchOverviewTab from '@/components/admin/match-detail/MatchOverviewTab.vue'
import MatchesTab from '@/components/admin/tournament-detail/MatchesTab.vue'

/**
 * P-82 — the dead "Revert to Awaiting Result" control rendered at TWO sites.
 *
 * `utils/__tests__/matchStatus.test.ts` pins the state machine; this pins the
 * *rendering*, because that is what the finding was about. Both sites gate on
 * `getNextMatchStatus(...)` being non-null, so in principle removing the map
 * entry removes both buttons — but "in principle" is exactly the assumption
 * this campaign keeps finding to be false. A site that grew its own fallback
 * label, or gated on something else, would still render the dead button while
 * the pure unit test stayed green. So both are mounted and asserted directly.
 *
 * Deliberately asserts on the *visible label*, not on a testid: the label is
 * what an operator sees and clicks, and it is the thing that was lying.
 */

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

/** Minimal shape of the fields these two components actually read. */
function makeMatch(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: '01912f00-0000-7000-8000-00000000beef',
    tournament_id: '01912f00-0000-7000-8000-0000000000aa',
    match_number: 7,
    round: 2,
    status,
    match_format: 'bo3',
    participant1_registration_id: '01912f00-0000-7000-8000-000000000001',
    participant2_registration_id: '01912f00-0000-7000-8000-000000000002',
    participant1_name: 'Team Alpha',
    participant2_name: 'Team Bravo',
    participant1_score: 16,
    participant2_score: 9,
    winner_registration_id: '01912f00-0000-7000-8000-000000000001',
    scheduled_at: null,
    started_at: null,
    completed_at: '2026-07-20T12:00:00Z',
    ...overrides,
  }
}

function mountOverview(status: string) {
  wrapper = mount(MatchOverviewTab, {
    global: {
      plugins: [createPinia(), vuetify],
      // `useActionFeedback` resolves the snackbar through `inject`, which
      // throws in DEV when unprovided (useSnackbar.ts:49). Provide the REAL
      // instance rather than stubbing the composable — the component under
      // test is the template, and a stub here would only hide a setup error.
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: { match: makeMatch(status) as any, tournamentId: 'tour-1' },
  })
  return wrapper
}

function mountMatchesTab(status: string) {
  wrapper = mount(MatchesTab, {
    global: { plugins: [createPinia(), vuetify] },
    props: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      matches: [makeMatch(status)] as any,
      loading: false,
      tournamentStatus: 'in_progress',
      bulkStartLoading: false,
      matchTransitionLoadingId: null,
    },
  })
  return wrapper
}

describe('MatchOverviewTab — admin transition control', () => {
  it('offers NO transition control on a completed match', () => {
    // P-82: this site rendered "Revert to Awaiting Result", which
    // `admin_transition` rejects unconditionally because `Completed` is
    // terminal. The button is gone, not merely relabelled.
    const w = mountOverview('completed')
    expect(w.text()).not.toContain('Revert to Awaiting Result')
    expect(w.text()).not.toContain('Awaiting Result')
    // The whole `v-if="nextStatus"` block must be absent — asserting on the
    // label alone would pass if the button rendered with an empty label.
    expect(w.find('.mt-4 button').exists()).toBe(false)
  })

  it('still offers the real transition on an awaiting_result match', () => {
    // Guards against "fixed" by deleting the feature: the control that WORKS
    // must survive. Without this, removing the button entirely would pass.
    const w = mountOverview('awaiting_result')
    expect(w.text()).toContain('Complete')
    expect(w.find('.mt-4 button').exists()).toBe(true)
  })
})

describe('MatchesTab — row action menu', () => {
  it('offers NO transition menu on a completed match row', () => {
    // The second render site (the row menu). Same dead control, same 400.
    const w = mountMatchesTab('completed')
    expect(w.text()).not.toContain('Revert to Awaiting Result')
    // The row keeps its "View match details" button; only the transition
    // menu activator disappears.
    const buttons = w.findAll('button')
    const labels = buttons.map((b) => b.attributes('aria-label') ?? b.text())
    expect(labels).toContain('View match details')
    expect(labels.some((l) => l.includes('Revert'))).toBe(false)
  })

  it('still offers the real transition menu on an awaiting_result row', () => {
    const w = mountMatchesTab('awaiting_result')
    expect(w.text()).toContain('Complete')
  })
})
