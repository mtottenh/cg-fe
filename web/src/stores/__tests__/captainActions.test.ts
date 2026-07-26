/**
 * P-103: pins the `hasCritical` one-hour threshold that e2e can no longer reach.
 *
 * `captain-actions.spec.ts:251` used to prove this end-to-end: a submitted result
 * claim had `auto_confirm_at` 15 minutes out, inside the store's one-hour window,
 * so the dashboard badge rendered `bg-error`. **P-57 deliberately raised that
 * window to 24 hours** (commit 5590726), and no action item the e2e suite can
 * create now carries a sub-hour deadline — so the critical branch became
 * unreachable from a browser test.
 *
 * Ground rule 9 requires that when an assertion is relaxed because the spec
 * changed, a separate test pins what was NOT relaxed. This is that test: the
 * threshold itself is client-side logic (`stores/captainActions.ts:29-35`) and
 * does not need a backend to prove. The e2e still asserts the real post-P-57
 * rendering (warning, hours); this asserts the boundary the e2e gave up.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCaptainActionsStore, type CaptainAction } from '@/stores/captainActions'

function action(overrides: Partial<CaptainAction> = {}): CaptainAction {
  return {
    action_type: 'confirm_result',
    match_id: 'm1',
    tournament_id: 't1',
    tournament_slug: 't-1',
    tournament_name: 'T 1',
    match_label: 'Round 1',
    deadline: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/** A deadline `minutes` from now, as the API would serialise it. */
function deadlineIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

describe('captainActions — hasCritical (the <1h threshold)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is critical when a deadline is inside the hour', () => {
    const store = useCaptainActionsStore()
    store.actions = [action({ deadline: deadlineIn(59) })]
    expect(store.hasCritical).toBe(true)
  })

  it('is NOT critical at the post-P-57 24h auto-confirm window', () => {
    const store = useCaptainActionsStore()
    store.actions = [action({ deadline: deadlineIn(24 * 60) })]
    expect(store.hasCritical).toBe(false)
  })

  it('is critical for an already-passed deadline', () => {
    // A negative diff is < 3600000, so an overdue item must stay critical —
    // easy to break by "fixing" the comparison to an absolute window.
    const store = useCaptainActionsStore()
    store.actions = [action({ deadline: deadlineIn(-30) })]
    expect(store.hasCritical).toBe(true)
  })

  it('ignores items with no deadline', () => {
    const store = useCaptainActionsStore()
    store.actions = [action({ deadline: null })]
    expect(store.hasCritical).toBe(false)
  })

  it('is critical if ANY item is inside the hour, not just the first', () => {
    const store = useCaptainActionsStore()
    store.actions = [
      action({ deadline: deadlineIn(24 * 60) }),
      action({ match_id: 'm2', deadline: deadlineIn(5) }),
    ]
    expect(store.hasCritical).toBe(true)
  })
})
