import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      GET: vi.fn(),
      POST: vi.fn(),
      PUT: vi.fn(),
      DELETE: vi.fn(),
      PATCH: vi.fn(),
    },
  }
})

import { api } from '@/api'
import MatchResultsTab from '@/components/admin/match-detail/MatchResultsTab.vue'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'
import { useMatchResultsStore } from '@/stores/matchResults'
import type { TournamentMatchResponse } from '@/stores/tournaments'

const mockGet = api.GET as unknown as Mock
const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null
afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

const P1_REG = '00000000-0000-0000-0000-0000000000a1'
const P2_REG = '00000000-0000-0000-0000-0000000000a2'

/** UUID v7-ish ids created a second apart: identical for the first 8 chars. */
const EVIDENCE_A = '01912f4a-1111-7000-8000-000000000001'
const EVIDENCE_B = '01912f4a-2222-7000-8000-000000000002'

/**
 * Typed as the real `TournamentMatchResponse` rather than a loose object
 * literal. P-86 was exactly this: fixtures declared as `string`/`any` stop the
 * compiler noticing when a DTO changes, so the test keeps passing against a
 * shape the product no longer returns. Every required field is present, and the
 * two that matter here are the parameters.
 */
function match(
  p1Score: number,
  p2Score: number,
  overrides: Partial<TournamentMatchResponse> = {},
): TournamentMatchResponse {
  return {
    id: 'match-1',
    tournament_id: 'tour-1',
    stage_id: 'stage-1',
    bracket_id: 'bracket-1',
    bracket_position: 'R1M1',
    round: 1,
    match_number: 1,
    status: 'completed',
    match_format: 'bo1',
    maps_required: 1,
    check_in_required: false,
    veto_required: false,
    disputed: false,
    participant1_registration_id: P1_REG,
    participant2_registration_id: P2_REG,
    participant1_name: 'Alpha',
    participant2_name: 'Bravo',
    participant1_score: p1Score,
    participant2_score: p2Score,
    winner_registration_id: P1_REG,
    scheduled_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  }
}

function claim(p1: number, p2: number, overrides: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    match_id: 'match-1',
    status: 'confirmed',
    claimed_participant1_score: p1,
    claimed_participant2_score: p2,
    claimed_winner_registration_id: P1_REG,
    submitted_by_user_id: '11111111-2222-3333-4444-555555555555',
    submitted_by_display_name: 'Dana Submitter',
    submitted_by_registration_id: P1_REG,
    confirmed_by_user_id: null,
    confirmed_by_display_name: null,
    confirmed_by_registration_id: null,
    confirmed_at: null,
    auto_confirm_at: null,
    was_auto_confirmed: false,
    submitter_notes: null,
    game_results: [],
    evidence_ids: [],
    demo_link_ids: [],
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  }
}

/**
 * This tab does NOT fetch the claim itself — `AdminMatchDetailModal` loads it
 * into the store and the tab renders `storeToRefs(matchResultsStore)`. So the
 * store is seeded directly rather than mocked through a GET the component never
 * issues; mocking that GET would test nothing and pass regardless.
 *
 * The tab's own `watch` does fire `fetchMatchResultOverrides`, which is why the
 * GET mock still has to resolve.
 */
async function mountTab(matchRow: TournamentMatchResponse, claimRow: unknown) {
  mockGet.mockResolvedValue({ data: { data: [] }, error: undefined })

  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useMatchResultsStore()
  store.currentResult = claimRow as never
  store.resultHistory = []

  wrapper = mount(MatchResultsTab, {
    props: { match: matchRow, tournamentId: 'tour-1' },
    global: {
      plugins: [pinia, vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * P-170 — after an admin correction the tab showed two different scores in two
 * cards of equal weight and said nothing about which one was live.
 *
 * The claim row is deliberately not rewritten by an override: it is EVIDENCE
 * that a participant asserted a score, and it is the only record of it.
 * Overwriting it would erase the history a dispute is judged on. So the data
 * was right and the presentation was wrong.
 */
describe('MatchResultsTab — a superseded claim says so (P-170)', () => {
  it('marks the claim superseded when it disagrees with the recorded score', async () => {
    // Claimed 16-14; an admin corrected the match to 16-13.
    const w = await mountTab(match(16, 13), claim(16, 14))

    const notice = w.find('[data-testid="claim-superseded-notice"]')
    expect(notice.exists()).toBe(true)
    // Both numbers must appear, and the notice must say which one governs.
    expect(notice.text()).toContain('16 - 14')
    expect(notice.text()).toContain('16 - 13')
    expect(notice.text()).toMatch(/bracket and standings/i)

    // The heading must stop calling it "Current" — it isn't.
    expect(w.text()).toContain('Result Claim (superseded)')
    expect(w.text()).not.toContain('Current Result Claim')
  })

  it('stays silent when the claim and the recorded score agree', async () => {
    const w = await mountTab(match(16, 14), claim(16, 14))

    // A warning that fires on the ordinary path is one people learn to scroll
    // past, which would make the real case invisible by a different route.
    expect(w.find('[data-testid="claim-superseded-notice"]').exists()).toBe(false)
    expect(w.text()).toContain('Current Result Claim')
  })

  it('stays silent for a PENDING claim that has not been applied yet', async () => {
    // The case the first draft of this got wrong. `participant1_score` is
    // NOT NULL DEFAULT 0 (migration 0030:340), so an unplayed match records 0-0
    // rather than null — a pending 16-14 claim "disagrees" with the match on the
    // entirely ordinary path where it simply has not been confirmed. Flagging it
    // would put a warning on almost every live match.
    const w = await mountTab(match(0, 0), claim(16, 14, { status: 'pending' }))

    expect(w.find('[data-testid="claim-superseded-notice"]').exists()).toBe(false)
  })

  it('stays silent when no result has been recorded at all', async () => {
    // Because the score columns default to 0, `winner_registration_id` is the
    // only honest signal that a result exists.
    const w = await mountTab(
      match(0, 0, { winner_registration_id: undefined }),
      claim(16, 14),
    )

    expect(w.find('[data-testid="claim-superseded-notice"]').exists()).toBe(false)
  })
})

/**
 * P-171 / P-172 — the same "identify a record by characters a human cannot
 * distinguish" defect as P-95, P-115 and P-123, on the surface an admin uses to
 * judge whether a claim was made in good faith.
 */
describe('MatchResultsTab — records are named, not hashed (P-171, P-172)', () => {
  it('names the submitter instead of printing their UUID', async () => {
    const w = await mountTab(match(16, 14), claim(16, 14))

    const submitter = w.find('[data-testid="claim-submitter"]')
    expect(submitter.text()).toBe('Dana Submitter')
    // The id stays reachable for support, just not as the label.
    expect(submitter.attributes('title')).toBe('11111111-2222-3333-4444-555555555555')
  })

  it('does not render evidence chips whose visible text is identical', async () => {
    const w = await mountTab(
      match(16, 14),
      claim(16, 14, { evidence_ids: [EVIDENCE_A, EVIDENCE_B] }),
    )

    // These two ids share their first 8 characters, because UUID v7 prefixes
    // are timestamps and attaching two files to one claim happens seconds
    // apart. `id.slice(0, 8)` rendered both chips as the same string.
    const chips = w.findAll('.v-chip').map((c) => c.text())
    const evidenceChips = chips.filter((t) => /File \d/.test(t))
    expect(evidenceChips).toHaveLength(2)
    expect(new Set(evidenceChips).size).toBe(2)
    expect(w.text()).not.toContain('01912f4a...')
  })
})
