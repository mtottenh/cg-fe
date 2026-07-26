import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import TournamentRegistrationCard from '@/components/tournament/TournamentRegistrationCard.vue'
import type { components as ApiComponents } from '@/api/types'

/**
 * P-47 — the registration card's invite-only awareness.
 *
 * WHY THESE ARE COMPONENT TESTS AND NOT E2E TESTS:
 * `e2e/tournament-invite-only.spec.ts` drives the case that matters — a TEAM
 * tournament with an eligible captain — end to end. The states below are the
 * ones an e2e test cannot reach cheaply or at all:
 *
 *  - INDIVIDUAL invite-only tournaments. The card's copy branches on
 *    `participant_type`, and the whole invite path for individuals is invited
 *    by `user_id`; standing an individual tournament up in e2e duplicates the
 *    team scenario to assert one sentence.
 *  - PRECEDENCE between the invite gate and the states that must outrank it.
 *    "No Eligible Teams", "Registration Opens Soon" and an existing
 *    registration all have to win over "Invitation Required", and each is a
 *    distinct combination of `is_registration_open` / `hasEligibleTeams` /
 *    `myRegistration`. Reaching all four through the UI means four tournaments
 *    in four lifecycle states.
 *  - The NEGATIVE case: a non-invite-only tournament must be untouched by this
 *    change. This is the assertion that catches an over-broad gate, and it is
 *    the one an invite-only e2e spec structurally cannot make.
 */

type TournamentResponse = ApiComponents['schemas']['TournamentResponse']
type TournamentRegistrationResponse = ApiComponents['schemas']['TournamentRegistrationResponse']

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

function makeTournament(overrides: Partial<TournamentResponse> = {}): TournamentResponse {
  return {
    id: 'tournament-1',
    slug: 'tournament-1',
    name: 'Test Cup',
    game_id: 'game-1',
    created_by: 'user-1',
    format: 'single_elimination',
    format_settings: {},
    settings: {},
    participant_type: 'team',
    registration_type: 'open',
    scheduling_mode: 'live',
    default_match_format: 'bo1',
    withdrawal_policy: 'forfeit',
    status: 'registration',
    is_registration_open: true,
    is_check_in_open: false,
    check_in_required: false,
    min_participants: 2,
    max_participants: 8,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as TournamentResponse
}

function makeRegistration(
  overrides: Partial<TournamentRegistrationResponse> = {},
): TournamentRegistrationResponse {
  return {
    id: 'registration-1',
    tournament_id: 'tournament-1',
    participant_name: 'Test Team',
    status: 'pending',
    checked_in: false,
    registered_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as TournamentRegistrationResponse
}

function mountCard(props: {
  tournament: TournamentResponse
  myRegistration?: TournamentRegistrationResponse | null
  hasEligibleTeams?: boolean
  isInvited?: boolean
}) {
  wrapper = mount(TournamentRegistrationCard, {
    props: {
      myRegistration: null,
      hasEligibleTeams: true,
      ...props,
    },
    global: { plugins: [vuetify] },
  })
  return wrapper
}

/** Trimmed labels of every button the card renders. */
function buttonLabels(w: VueWrapper): string[] {
  return w.findAll('button').map((b) => b.text().trim())
}

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('TournamentRegistrationCard invite-only gate', () => {
  it('withholds the unconditional CTA on an invite-only team tournament', () => {
    const w = mountCard({ tournament: makeTournament({ registration_type: 'invite_only' }) })

    expect(w.text()).toContain('Invitation Required')
    expect(w.text()).toContain('Only teams the organiser has invited can register')
    expect(buttonLabels(w)).not.toContain('Register Team')
    expect(w.find('[data-testid="register-with-invitation"]').exists()).toBe(true)
  })

  it('names players, not teams, on an invite-only individual tournament', () => {
    const w = mountCard({
      tournament: makeTournament({
        registration_type: 'invite_only',
        participant_type: 'individual',
      }),
      hasEligibleTeams: undefined,
    })

    expect(w.text()).toContain('Invitation Required')
    expect(w.text()).toContain('Only players the organiser has invited can register')
    expect(buttonLabels(w)).not.toContain('Register Now')
    expect(w.find('[data-testid="register-with-invitation"]').exists()).toBe(true)
  })

  it('leaves an open tournament untouched', () => {
    const w = mountCard({ tournament: makeTournament({ registration_type: 'open' }) })

    expect(w.text()).not.toContain('Invitation Required')
    expect(buttonLabels(w)).toContain('Register Team')
    expect(w.find('[data-testid="register-with-invitation"]').exists()).toBe(false)
  })

  it('leaves an approval tournament untouched', () => {
    const w = mountCard({ tournament: makeTournament({ registration_type: 'approval' }) })

    expect(w.text()).not.toContain('Invitation Required')
    expect(buttonLabels(w)).toContain('Register Team')
  })

  it('still reports "No Eligible Teams" ahead of the invite gate', () => {
    // Having no team to enter is the more actionable problem: an invitation
    // would not help.
    const w = mountCard({
      tournament: makeTournament({ registration_type: 'invite_only' }),
      hasEligibleTeams: false,
    })

    expect(w.text()).toContain('No Eligible Teams')
    expect(w.text()).not.toContain('Invitation Required')
    expect(w.find('[data-testid="register-with-invitation"]').exists()).toBe(false)
  })

  it('still reports "Registration Opens Soon" before registration opens', () => {
    const w = mountCard({
      tournament: makeTournament({
        registration_type: 'invite_only',
        status: 'published',
        is_registration_open: false,
      }),
    })

    expect(w.text()).toContain('Registration Opens Soon')
    expect(w.text()).not.toContain('Invitation Required')
  })

  it('drops the gate once the invitee is registered', () => {
    // The invitation has been consumed by the registration; re-offering the
    // gate would be telling a participant they might not be in.
    const w = mountCard({
      tournament: makeTournament({ registration_type: 'invite_only' }),
      myRegistration: makeRegistration({ status: 'pending' }),
    })

    expect(w.text()).toContain('Registration Pending')
    expect(w.text()).not.toContain('Invitation Required')
    expect(w.find('[data-testid="register-with-invitation"]').exists()).toBe(false)
  })

  it('emits register from the conditional affordance, so an invitee can still enter', async () => {
    const w = mountCard({ tournament: makeTournament({ registration_type: 'invite_only' }) })

    await w.find('[data-testid="register-with-invitation"]').trigger('click')

    expect(w.emitted('register')).toHaveLength(1)
  })

  // P-51: with a self-scoped invite signal, the gate becomes a real block.
  it('hard-blocks a known-uninvited viewer: no register affordance at all', () => {
    const w = mountCard({
      tournament: makeTournament({ registration_type: 'invite_only' }),
      isInvited: false,
    })

    expect(w.text()).toContain('Invitation Required')
    // Neither the plain CTA nor the soft "I Have an Invitation" button is offered.
    expect(w.find('[data-testid="register-with-invitation"]').exists()).toBe(false)
    expect(w.find('[data-testid="invitation-required-block"]').exists()).toBe(true)
    expect(buttonLabels(w)).not.toContain('Register Team')
  })

  it('opens the register CTA for a known-invited viewer', () => {
    const w = mountCard({
      tournament: makeTournament({ registration_type: 'invite_only' }),
      isInvited: true,
    })

    expect(w.text()).not.toContain('Invitation Required')
    expect(buttonLabels(w)).toContain('Register Team')
    expect(w.find('[data-testid="register-with-invitation"]').exists()).toBe(false)
  })
})
