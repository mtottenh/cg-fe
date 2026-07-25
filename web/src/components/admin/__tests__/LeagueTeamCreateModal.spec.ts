import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import LeagueTeamCreateModal from '@/components/admin/LeagueTeamCreateModal.vue'

/**
 * COVERAGE-PLAN P-41 — the two create-team forms disagreed with each other AND
 * with the endpoint they both POST to.
 *
 * The single source of truth is `CreateLeagueTeamRequest`
 * (api/crates/portal-api/src/dto/requests/league_team.rs:247-275), enforced by
 * the `ValidatedJson` extractor on `POST /v1/leagues/{id}/seasons/{id}/teams`
 * (handlers/league_teams/team.rs:71):
 *
 *   name         length(min = 2,  max = 50)
 *   tag          length(min = 2,  max = 5)
 *   description  length(max = 1000)
 *
 * This modal used to allow name ≤ 100, tag ≤ 8 and description ≤ 2000 — every
 * one of those a guaranteed 400 that the form promised would succeed. The
 * public form on `LeagueDetailPage` disagreed in the other direction
 * (name ≥ 3, refusing a name the backend accepts); that half is covered in
 * `e2e/team-management.spec.ts`.
 *
 * WHY A COMPONENT TEST: the boundary cases are exactly the ones the form must
 * refuse to SEND, so an e2e assertion would be asserting the absence of a
 * request. Driving the rules directly states the contract in one place, and
 * fails loudly if either bound drifts from the DTO again.
 */

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

function mountModal() {
  wrapper = mount(LeagueTeamCreateModal, {
    props: { seasonId: 'season-1', modelValue: true },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
  return wrapper
}

/** The Vuetify text field whose floating label is `label`. */
function field(w: VueWrapper, label: string) {
  const inputs = w.findAllComponents({ name: 'VTextField' })
  const found = inputs.find((c) => c.props('label') === label)
  if (!found) throw new Error(`No VTextField labelled "${label}"`)
  return found
}

function textarea(w: VueWrapper, label: string) {
  const areas = w.findAllComponents({ name: 'VTextarea' })
  const found = areas.find((c) => c.props('label') === label)
  if (!found) throw new Error(`No VTextarea labelled "${label}"`)
  return found
}

/**
 * Run a field's rules against a value the way Vuetify does, and return the
 * validation messages. Reading the rules rather than typing into the DOM keeps
 * the assertion about the CONTRACT (which lengths are legal) instead of about
 * Vuetify's async validation timing.
 */
function messagesFor(rules: unknown, value: string): string[] {
  const list = rules as Array<(v: string) => string | boolean>
  return list
    .map((rule) => rule(value))
    .filter((r): r is string => typeof r === 'string')
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('LeagueTeamCreateModal validation matches CreateLeagueTeamRequest', () => {
  it('accepts a 2-character team name — the backend minimum', async () => {
    const w = mountModal()
    await flushPromises()
    expect(messagesFor(field(w, 'Team Name').props('rules'), 'AB')).toEqual([])
  })

  it('rejects a 1-character team name', async () => {
    const w = mountModal()
    await flushPromises()
    expect(messagesFor(field(w, 'Team Name').props('rules'), 'A')).toContain(
      'Must be at least 2 characters',
    )
  })

  it('accepts a 50-character team name and rejects 51 — the backend maximum', async () => {
    const w = mountModal()
    await flushPromises()
    const rules = field(w, 'Team Name').props('rules')
    expect(messagesFor(rules, 'x'.repeat(50))).toEqual([])
    expect(messagesFor(rules, 'x'.repeat(51))).toContain('Must be at most 50 characters')
  })

  it('accepts a 5-character tag and rejects 6 — the backend maximum', async () => {
    const w = mountModal()
    await flushPromises()
    const rules = field(w, 'Team Tag').props('rules')
    expect(messagesFor(rules, 'ABCDE')).toEqual([])
    // Both the length rule and the alphanumeric pattern rule cap at 5.
    expect(messagesFor(rules, 'ABCDEF').length).toBeGreaterThan(0)
    expect(messagesFor(rules, 'ABCDEF')).toContain('Must be at most 5 characters')
  })

  it('rejects a description longer than 1000 characters', async () => {
    const w = mountModal()
    await flushPromises()
    const rules = textarea(w, 'Description (Optional)').props('rules')
    expect(messagesFor(rules, 'x'.repeat(1000))).toEqual([])
    expect(messagesFor(rules, 'x'.repeat(1001))).toContain('Must be at most 1000 characters')
  })
})
