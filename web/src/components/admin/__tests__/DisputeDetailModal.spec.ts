import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import DisputeDetailModal from '@/components/admin/DisputeDetailModal.vue'
import { useDisputesStore } from '@/stores/disputes'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'
import type { components as ApiComponents } from '@/api/types'

/**
 * COVERAGE-PLAN §9c — the resolution panel was gated on
 * `!dispute.resolution && dispute.status !== 'closed'`.
 *
 * `closed` is not a `DisputeStatus`, so that half could never be false. The fix
 * mirrors `Dispute::can_resolve()` (Pending | UnderReview), the same predicate
 * `validate_can_resolve` enforces on all five resolve endpoints.
 *
 * WHY THIS IS A COMPONENT TEST AND NOT AN E2E TEST: the case that actually
 * changes behaviour is a CANCELLED dispute — terminal, but with no `resolution`,
 * so the old guard offered the full resolve UI for it. `cancelled` is
 * unreachable through the product: there is no cancel endpoint on either the
 * public (`routes/disputes.rs`) or the admin (`routes/admin.rs:88-114`) router.
 * Driving the component over the four real enum values is the only honest way
 * to cover it.
 */

type Dispute = ApiComponents['schemas']['DisputeResponse']

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

function makeDispute(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id: 'dispute-1',
    match_id: 'match-1',
    disputed_by_user_id: 'user-1',
    disputed_by_registration_id: 'reg-1',
    reason: 'incorrect_score',
    description: 'Scores were entered the wrong way round.',
    priority: 'normal',
    status: 'pending',
    evidence_ids: [],
    resolution: null,
    resolved_at: null,
    resolved_by_user_id: null,
    result_claim_id: null,
    original_participant1_score: 16,
    original_participant2_score: 14,
    original_winner_registration_id: 'reg-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Dispute
}

/**
 * Mount the modal already open, with the store pre-populated. `disputeId` stays
 * null so the component's fetch watcher never fires — the dispute under test is
 * the one we put in the store.
 */
async function mountModal(dispute: Dispute) {
  const store = useDisputesStore()
  store.currentDispute = dispute
  store.currentThread = []

  wrapper = mount(DisputeDetailModal, {
    props: { disputeId: null, modelValue: true },
    global: {
      plugins: [vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

/** The resolution panel is identified by its heading and its five actions. */
function resolvePanelRendered(): boolean {
  return document.body.textContent?.includes('Resolve Dispute') ?? false
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('DisputeDetailModal resolution panel', () => {
  it('offers resolution on a pending dispute', async () => {
    await mountModal(makeDispute({ status: 'pending' }))

    expect(resolvePanelRendered()).toBe(true)
    expect(document.body.textContent).toContain('Uphold Original Result')
    expect(document.body.textContent).toContain('Double Disqualification')
  })

  it('offers resolution on an under_review dispute', async () => {
    await mountModal(makeDispute({ status: 'under_review' }))

    expect(resolvePanelRendered()).toBe(true)
  })

  it('hides resolution on a resolved dispute and shows the resolution instead', async () => {
    await mountModal(
      makeDispute({
        status: 'resolved',
        resolved_at: '2026-01-02T00:00:00Z',
        resolved_by_user_id: 'admin-1',
        resolution: {
          resolution_type: 'overturned',
          notes: 'Demo shows the opposite scoreline.',
          new_participant1_score: 14,
          new_participant2_score: 16,
          new_winner_registration_id: 'reg-2',
        },
      }),
    )

    expect(resolvePanelRendered()).toBe(false)
    expect(document.body.textContent).toContain('Demo shows the opposite scoreline.')
  })

  it('hides resolution on a cancelled dispute — the case the dead `!== "closed"` guard missed', async () => {
    // A cancelled dispute is terminal and carries no `resolution`, so the old
    // guard rendered the whole panel and every button would have failed with
    // 400 "cannot be resolved" (`validate_can_resolve`).
    await mountModal(makeDispute({ status: 'cancelled', resolution: null }))

    expect(resolvePanelRendered()).toBe(false)
  })

  it('offers "Assign to Me" only while the dispute is pending', async () => {
    // Mirrors `Dispute::can_assign()` — Pending only. Already correct; locked in
    // here so the two guards stay in step.
    await mountModal(makeDispute({ status: 'pending' }))
    expect(document.body.textContent).toContain('Assign to Me')

    wrapper!.unmount()
    document.body.innerHTML = ''

    await mountModal(makeDispute({ status: 'under_review' }))
    expect(document.body.textContent).not.toContain('Assign to Me')
  })
})
