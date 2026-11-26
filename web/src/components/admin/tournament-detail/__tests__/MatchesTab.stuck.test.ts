import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import MatchesTab from '@/components/admin/tournament-detail/MatchesTab.vue'

/**
 * A stuck match should be findable from the list, and one click from the
 * tools that fix it, without a diagnostics request per row.
 */

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null
afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
})

function row(id: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id, status, match_number: 1, round: 1, match_format: 'bo3',
    participant1_name: 'Team Alpha', participant2_name: 'Team Bravo',
    participant1_score: 0, participant2_score: 0, scheduled_at: null, ...extra,
  }
}

function mountTab(matches: ReturnType<typeof row>[]) {
  wrapper = mount(MatchesTab, {
    global: { plugins: [vuetify] },
    props: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      matches: matches as any,
      loading: false,
      tournamentStatus: 'in_progress',
      bulkStartLoading: false,
      matchTransitionLoadingId: null,
    },
  })
  return wrapper
}

describe('MatchesTab stuck-match hint', () => {
  it('marks stuck rows and leaves healthy ones alone', () => {
    const past = new Date(Date.now() - 5 * 60_000).toISOString()
    const future = new Date(Date.now() + 5 * 60_000).toISOString()
    const w = mountTab([
      row('no-time', 'scheduled'),
      row('timed', 'scheduled', { scheduled_at: future }),
      row('expired', 'checking_in', { check_in_deadline: past }),
      row('open', 'checking_in', { check_in_deadline: future }),
      row('forfeited', 'forfeit'),
      row('cancelled', 'cancelled'),
      row('ready', 'ready'),
      row('done', 'completed'),
    ])
    const flagged = (id: string) => w.find(`[data-testid="match-stuck-${id}"]`)
    for (const id of ['no-time', 'expired', 'forfeited', 'cancelled']) expect(flagged(id).exists(), id).toBe(true)
    for (const id of ['timed', 'open', 'ready', 'done']) expect(flagged(id).exists(), id).toBe(false)
    expect(flagged('no-time').attributes('aria-label')).toContain('no time')
    expect(flagged('expired').attributes('aria-label')).toContain('expired')
  })

  it('opens the match on its rescue tools', async () => {
    const w = mountTab([row('no-time', 'scheduled')])
    await w.find('[data-testid="match-stuck-no-time"]').trigger('click')
    expect(w.emitted('rescue')).toEqual([['no-time']])
  })
})
