import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import ProposalCard from '@/components/match/ProposalCard.vue'
import type { ScheduleProposalResponse } from '@/stores/matchScheduling'

const vuetify = createVuetify({ components, directives })

const HOUR = 3_600_000
const future = (h: number) => new Date(Date.now() + h * HOUR).toISOString()
const past = (h: number) => new Date(Date.now() - h * HOUR).toISOString()

function makeProposal(times: string[]): ScheduleProposalResponse {
  return {
    id: 'proposal-1',
    match_id: 'match-1',
    status: 'pending',
    proposed_times: times,
    proposed_by_user_id: 'user-teammate',
    proposed_by_registration_id: 'reg-a',
    created_at: past(1),
    expires_at: future(47),
  } as ScheduleProposalResponse
}

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function mountCard(props: { times: string[]; isProposer?: boolean; isOwnTeam?: boolean; canAct?: boolean }) {
  wrapper = mount(ProposalCard, {
    props: {
      proposal: makeProposal(props.times),
      isProposer: props.isProposer ?? false,
      isOwnTeam: props.isOwnTeam ?? false,
      ...(props.canAct === undefined ? {} : { canAct: props.canAct }),
      fromName: 'Team Alpha',
    },
    global: { plugins: [vuetify] },
  })
  return wrapper
}

describe('ProposalCard — the opponent is not notified', () => {
  const notice = (w: VueWrapper) => w.find('[data-testid="proposal-not-notified"]')

  it('tells the proposing team to let the other captain know', () => {
    const w = mountCard({ times: [future(24)], isProposer: true, isOwnTeam: true })
    expect(notice(w).text()).toContain("Tell the other captain you've proposed a time")
    expect(notice(w).text()).toContain("doesn't send notifications yet")
  })

  it('shows the same note to a teammate of the proposer', () => {
    expect(notice(mountCard({ times: [future(24)], isOwnTeam: true })).exists()).toBe(true)
  })

  it('does not show it to the team that has to respond', () => {
    expect(notice(mountCard({ times: [future(24)] })).exists()).toBe(false)
  })
})

describe('ProposalCard — who may respond', () => {
  it('offers Accept / Counter / Reject to the opposing team', () => {
    const w = mountCard({ times: [future(24)] })
    expect(w.text()).toContain('Proposal from Team Alpha')
    expect(w.text()).toContain('Accept')
    expect(w.text()).toContain('Counter-Propose')
    expect(w.text()).toContain('Reject')
  })

  it("lets a captain or delegate withdraw a teammate's proposal, but not answer it", () => {
    // The API refuses a team answering its own proposal; any captain, owner
    // or delegate of that team may withdraw it, not only the sender.
    const w = mountCard({ times: [future(24)], isOwnTeam: true })
    expect(w.text()).toContain("Your team's proposal")
    expect(w.find('[data-testid="proposal-waiting"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Accept')
    expect(w.text()).not.toContain('Counter-Propose')
    expect(w.text()).not.toContain('Reject')
    expect(w.text()).toContain('Withdraw Proposal')
  })

  it("shows a plain roster member their own team's proposal read-only", () => {
    const w = mountCard({ times: [future(24)], isOwnTeam: true, canAct: false })
    expect(w.find('[data-testid="proposal-read-only"]').text())
      .toContain('Only your captain or a delegate can agree match times')
    expect(w.text()).not.toContain('Withdraw Proposal')
    expect(w.text()).not.toContain('Accept')
    expect(w.find('[data-testid="proposal-not-notified"]').exists()).toBe(false)
  })

  it("shows a plain roster member the opponent's proposal read-only", () => {
    const w = mountCard({ times: [future(24)], canAct: false })
    expect(w.find('[data-testid="proposal-read-only"]').exists()).toBe(true)
    expect(w.text()).toContain('waiting for your team to answer')
    expect(w.text()).not.toContain('Accept')
    expect(w.text()).not.toContain('Counter-Propose')
    expect(w.text()).not.toContain('Reject')
    expect(w.findAll('input[type="radio"]')).toHaveLength(0)
  })

  it('lets the proposer themselves withdraw', () => {
    const w = mountCard({ times: [future(24)], isProposer: true, isOwnTeam: true })
    expect(w.text()).toContain('Your proposal')
    expect(w.text()).toContain('Withdraw Proposal')
    expect(w.text()).not.toContain('Accept')
  })
})

describe('ProposalCard — proposed times that have already passed', () => {
  it('pre-selects a lone future time so Accept works in one click', async () => {
    const time = future(24)
    const w = mountCard({ times: [time] })
    const accept = w.find('[data-testid="proposal-accept"]')
    expect(accept.attributes('disabled')).toBeUndefined()
    await accept.trigger('click')
    expect(w.emitted('accept')).toEqual([[time]])
  })

  it('never pre-selects or accepts a lone time that has passed', async () => {
    const w = mountCard({ times: [past(2)] })
    const accept = w.find('[data-testid="proposal-accept"]')
    expect(accept.attributes('disabled')).toBeDefined()
    await accept.trigger('click')
    expect(w.emitted('accept')).toBeUndefined()
    expect(w.find('[data-testid="proposal-all-past"]').exists()).toBe(true)
    expect(w.text()).toContain('already passed')
  })

  it('disables only the passed slot when a later one is still open', () => {
    const w = mountCard({ times: [past(2), future(24)] })
    const radios = w.findAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
    expect(radios[0]!.attributes('disabled')).toBeDefined()
    expect(radios[1]!.attributes('disabled')).toBeUndefined()
    expect(w.find('[data-testid="proposal-all-past"]').exists()).toBe(false)
  })

  it('states which timezone the times are shown in', () => {
    const w = mountCard({ times: [future(24)] })
    expect(w.find('[data-testid="proposal-timezone"]').text()).toContain('local time')
  })
})
