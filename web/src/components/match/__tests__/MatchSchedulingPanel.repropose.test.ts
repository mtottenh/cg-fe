import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import MatchSchedulingPanel from '../MatchSchedulingPanel.vue'
import { canStillReschedule } from '@/utils/schedulingLead'

/**
 * Teams may move an agreed time until an hour before the match; the current
 * time stands until the opponent accepts a new one.
 */

const vuetify = createVuetify({ components, directives })
let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

function mountScheduled(scheduledAt: string, canAct: boolean) {
  wrapper = mount(MatchSchedulingPanel, {
    props: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tournament: { id: 't-1', scheduling_mode: 'self_scheduled' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      match: { id: 'm-1', status: 'scheduled', scheduled_at: scheduledAt, participant1_name: 'Alpha', participant2_name: 'Bravo' } as any,
      activeProposal: null,
      isProposer: false,
      canAct,
      // What the page computes (useMatchDetail.canPropose).
      canPropose: canAct && canStillReschedule(scheduledAt),
    },
    global: { plugins: [createPinia(), vuetify] },
  })
  return wrapper
}

describe('canStillReschedule', () => {
  it('is true only more than an hour before the match', () => {
    const now = new Date('2032-01-01T12:00:00Z')
    expect(canStillReschedule('2032-01-01T13:01:00Z', now)).toBe(true)
    expect(canStillReschedule('2032-01-01T13:00:00Z', now)).toBe(false)
    expect(canStillReschedule('2032-01-01T12:30:00Z', now)).toBe(false)
    expect(canStillReschedule(null, now)).toBe(false)
  })
})

describe('MatchSchedulingPanel — re-agreeing a scheduled match', () => {
  it('offers a captain "Propose a new time" while the match is more than an hour away', async () => {
    const w = mountScheduled(inHours(5), true)
    expect(w.text()).toContain('Match Scheduled')
    expect(w.text()).not.toContain('Send Proposal')
    await w.find('[data-testid="repropose"]').trigger('click')
    expect(w.text()).toContain('Send Proposal')
    expect(w.find('[data-testid="repropose-note"]').text()).toContain('unless your opponent accepts')
    // and can back out
    await w.find('[data-testid="repropose-cancel"]').trigger('click')
    expect(w.text()).not.toContain('Send Proposal')
    expect(w.find('[data-testid="repropose"]').exists()).toBe(true)
  })

  it('offers nothing within the hour, and says to ask an organiser', () => {
    const w = mountScheduled(inHours(0.5), true)
    expect(w.find('[data-testid="repropose"]').exists()).toBe(false)
    expect(w.find('[data-testid="repropose-closed"]').text()).toContain('Ask an organiser')
  })

  it('offers a plain roster member nothing', () => {
    const w = mountScheduled(inHours(5), false)
    expect(w.find('[data-testid="repropose"]').exists()).toBe(false)
    expect(w.find('[data-testid="repropose-closed"]').exists()).toBe(false)
  })
})
