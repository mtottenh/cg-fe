import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api } from '@/api'
import { useTournamentsStore } from '@/stores/tournaments'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock

const TID = 'tournament-1'

function counts(pending: number) {
  return { data: { data: { pending, approved: 5, withdrawn: 0, disqualified: 0, total: pending + 5 } }, error: undefined }
}

function registration(id: string, status: string) {
  return {
    id,
    tournament_id: TID,
    status,
    registration_type: 'team',
    seed: null,
    checked_in_at: null,
    withdrawn_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

/**
 * P-179 — the server-sourced counts went stale after every action taken on them.
 *
 * P-167 replaced `registrations.filter(r => r.status === 'pending').length` with
 * a real server count, fixing a badge computed from a 20-row page. But the old
 * computation had a property the new one lost: it was derived from the same
 * reactive array the mutations write to, so approving a registration updated it
 * for free. `registrationCounts` is a separate ref written only by
 * `fetchRegistrationCounts`, so the badge was right on load and wrong from the
 * first approval onwards.
 *
 * A fix that is correct on load and stale after a mutation is the same class of
 * defect as the one it replaced — it just moves when the lie starts.
 */
describe('registration counts survive mutations (P-179)', () => {
  it('refetches the counts after an approval', async () => {
    const store = useTournamentsStore()

    mockGet.mockResolvedValueOnce(counts(3))
    await store.fetchRegistrationCounts(TID)
    expect(store.registrationCounts?.pending).toBe(3)

    // The organiser approves one; the server now reports 2 pending.
    mockPost.mockResolvedValueOnce({ data: { data: registration('r1', 'approved') }, error: undefined })
    mockGet.mockResolvedValueOnce(counts(2))
    await store.approveRegistration(TID, 'r1')

    expect(store.registrationCounts?.pending).toBe(2)
  })

  it('refetches after reject, disqualify and withdraw too', async () => {
    const store = useTournamentsStore()
    mockGet.mockResolvedValueOnce(counts(9))
    await store.fetchRegistrationCounts(TID)

    for (const [n, run] of [
      [8, () => store.rejectRegistration(TID, 'r1', 'nope')],
      [7, () => store.disqualifyRegistration(TID, 'r2', 'cheating')],
      [6, () => store.withdrawFromTournament(TID, 'r3')],
    ] as const) {
      mockPost.mockResolvedValueOnce({ data: { data: registration('r1', 'rejected') }, error: undefined })
      mockGet.mockResolvedValueOnce(counts(n))
      await run()
      expect(store.registrationCounts?.pending).toBe(n)
    }
  })

  it('clears the counts rather than leaving a wrong number when the refetch fails', async () => {
    const store = useTournamentsStore()
    mockGet.mockResolvedValueOnce(counts(3))
    await store.fetchRegistrationCounts(TID)

    // The approval succeeds; the follow-up count read does not.
    mockPost.mockResolvedValueOnce({ data: { data: registration('r1', 'approved') }, error: undefined })
    mockGet.mockResolvedValueOnce({ data: undefined, error: { status: 500, detail: 'boom' } })

    // The mutation must NOT fail — it really did happen server-side.
    await expect(store.approveRegistration(TID, 'r1')).resolves.toBeDefined()

    // ...and the stale 3 must not survive. "Unknown" is honest; a confidently
    // wrong count is the defect.
    expect(store.registrationCounts).toBeNull()
  })

  it('does not fetch counts for a page that never displayed them', async () => {
    const store = useTournamentsStore()
    expect(store.registrationCounts).toBeNull()

    mockPost.mockResolvedValueOnce({ data: { data: registration('r1', 'approved') }, error: undefined })
    await store.approveRegistration(TID, 'r1')

    // No GET at all: a surface that never showed a count pays nothing.
    expect(mockGet).not.toHaveBeenCalled()
  })
})
