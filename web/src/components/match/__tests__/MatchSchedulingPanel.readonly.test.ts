import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import MatchSchedulingPanel from '../MatchSchedulingPanel.vue'
import type { ScheduleProposalResponse } from '@/stores/matchScheduling'

const vuetify = createVuetify({ components, directives })
let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

const future = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()

function proposal(): ScheduleProposalResponse {
  return {
    id: 'p-1', status: 'pending', proposed_times: [future(24)],
    proposed_by_registration_id: 'reg-a', proposed_by_user_id: 'u-1',
    created_at: new Date().toISOString(), expires_at: future(48),
  } as unknown as ScheduleProposalResponse
}

function mountPanel(props: { canAct: boolean; withProposal?: boolean; isOwnTeam?: boolean }) {
  wrapper = mount(MatchSchedulingPanel, {
    props: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tournament: { id: 't-1', scheduling_mode: 'self_scheduled' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      match: { id: 'm-1', status: 'ready', participant1_name: 'Alpha', participant2_name: 'Bravo' } as any,
      activeProposal: props.withProposal ? proposal() : null,
      isProposer: false,
      isOwnTeam: props.isOwnTeam ?? false,
      canAct: props.canAct,
      // What the page passes: nobody without the right to schedule may propose.
      canPropose: props.canAct && !props.withProposal,
    },
    global: { plugins: [createPinia(), vuetify] },
  })
  return wrapper
}

describe('MatchSchedulingPanel — who may schedule', () => {
  it('tells a plain roster member to ask their captain, with no form', () => {
    const w = mountPanel({ canAct: false })
    expect(w.find('[data-testid="scheduling-read-only"]').text())
      .toContain('Only your captain or a delegate can agree match times')
    expect(w.text()).not.toContain('Send Proposal')
  })

  it('shows a plain roster member an open proposal without any controls', () => {
    const w = mountPanel({ canAct: false, withProposal: true })
    expect(w.find('[data-testid="proposal-read-only"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Accept')
    expect(w.text()).not.toContain('Counter-Propose')
    expect(w.text()).not.toContain('Withdraw Proposal')
  })

  it('gives a captain the proposal form', () => {
    const w = mountPanel({ canAct: true })
    expect(w.find('[data-testid="scheduling-read-only"]').exists()).toBe(false)
    expect(w.text()).toContain('Send Proposal')
  })

  it("lets a captain withdraw a teammate's proposal", () => {
    const w = mountPanel({ canAct: true, withProposal: true, isOwnTeam: true })
    expect(w.text()).toContain('Withdraw Proposal')
    expect(w.text()).not.toContain('Accept')
  })
})
