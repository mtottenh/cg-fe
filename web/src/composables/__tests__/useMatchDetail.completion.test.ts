import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createSnackbar, SnackbarKey } from '@/composables/useSnackbar'
import { useTournamentsStore, type TournamentResponse, type TournamentMatchResponse } from '@/stores/tournaments'
import { useMatchResultsStore, type ResultClaimResponse } from '@/stores/matchResults'
import { useEvidenceStore } from '@/stores/evidence'
import { useResultReviewsStore } from '@/stores/resultReviews'
import { useDisputesStore } from '@/stores/disputes'
import { useAuthStore } from '@/stores/auth'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { tournamentSlug: 'slug-1', matchId: 'match-1' } }),
}))

import { useMatchDetail } from '@/composables/useMatchDetail'

function withApp<T>(fn: () => T): { result: T; unmount: () => void } {
  let result!: T
  const Host = defineComponent({
    setup() {
      result = fn()
      return () => h('div')
    },
  })
  const app = createApp(Host)
  app.provide(SnackbarKey, createSnackbar())
  app.mount(document.createElement('div'))
  return { result, unmount: () => app.unmount() }
}

function makeMatch(overrides: Partial<TournamentMatchResponse> = {}): TournamentMatchResponse {
  return {
    id: 'match-1',
    participant1_registration_id: 'reg-a',
    participant2_registration_id: 'reg-b',
    status: 'awaiting_result',
    match_format: 'bo1',
    disputed: false,
    ...overrides,
  } as TournamentMatchResponse
}

function makeTournament(): TournamentResponse {
  return {
    id: 'tourney-1',
    slug: 'slug-1',
    participant_type: 'individual',
    // Not self_scheduled: keeps fetchAll/pollMatch away from the scheduling
    // endpoints, which have nothing to do with completion.
    scheduling_mode: 'live',
  } as TournamentResponse
}

/** Let every pending microtask, promise chain and pre-flush watcher run. */
async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

/**
 * P-134 — a match that COMPLETES while the page is open must fetch its result
 * review.
 *
 * `fetchAll` fetched the review only for matches that were already `completed`
 * at load, and `pollMatch` never fetched it at all. Completion is the moment
 * the backend can raise a review (the match-completion saga creates it before
 * it flips the match to `completed`), so the alert was missing for exactly the
 * people watching the match finish and present only for someone who came back
 * later.
 */
describe('useMatchDetail fetches the result review when a match completes in-page', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
  })

  function setupSpies(match: TournamentMatchResponse) {
    const tournamentsStore = useTournamentsStore()
    const authStore = useAuthStore()
    const resultsStore = useMatchResultsStore()
    const evidenceStore = useEvidenceStore()
    const resultReviewsStore = useResultReviewsStore()
    const disputesStore = useDisputesStore()

    authStore.playerId = 'player-a'

    const tournament = makeTournament()
    vi.spyOn(tournamentsStore, 'fetchTournamentBySlug').mockImplementation(async () => {
      tournamentsStore.currentTournament = tournament
      return tournament
    })
    vi.spyOn(tournamentsStore, 'fetchMatchParticipants').mockResolvedValue({
      match_id: match.id,
      my_registration_id: 'reg-a',
    } as Awaited<ReturnType<typeof tournamentsStore.fetchMatchParticipants>>)

    return {
      fetchMatch: vi.spyOn(tournamentsStore, 'fetchMatch').mockResolvedValue(match),
      fetchCurrentResult: vi.spyOn(resultsStore, 'fetchCurrentResult').mockResolvedValue(null),
      fetchResultHistory: vi.spyOn(resultsStore, 'fetchResultHistory').mockResolvedValue([]),
      fetchLinkedDemos: vi.spyOn(evidenceStore, 'fetchLinkedDemos').mockResolvedValue([]),
      fetchEvidence: vi.spyOn(evidenceStore, 'fetchEvidence').mockResolvedValue([]),
      discoverDemos: vi.spyOn(evidenceStore, 'discoverDemos').mockResolvedValue([]),
      getTournamentMapPool: vi
        .spyOn(tournamentsStore, 'getTournamentMapPool')
        .mockResolvedValue(null as unknown as Awaited<
          ReturnType<typeof tournamentsStore.getTournamentMapPool>
        >),
      fetchMatchResultReview: vi
        .spyOn(resultReviewsStore, 'fetchMatchResultReview')
        .mockResolvedValue(null),
      fetchMatchDispute: vi.spyOn(disputesStore, 'fetchMatchDispute').mockResolvedValue(null),
      resultsStore,
    }
  }

  async function loadPage() {
    const { result, unmount } = withApp(() => useMatchDetail())
    cleanups.push(unmount)
    await result.fetchAll()
    return result
  }

  it('fetches the review when a poll discovers the match completed', async () => {
    const spies = setupSpies(makeMatch({ status: 'awaiting_result' }))

    await loadPage()
    // An unfinished match has no review to show.
    expect(spies.fetchMatchResultReview).not.toHaveBeenCalled()

    // The next refresh finds it completed. Driven through the visibility
    // handler rather than the 15s interval so the test needs no fake clock —
    // both call the same `pollMatch`.
    spies.fetchMatch.mockResolvedValue(makeMatch({ status: 'completed' }))
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(spies.fetchMatchResultReview).toHaveBeenCalledWith('match-1')
  })

  it('fetches the review when the opponent confirms the claim under the page', async () => {
    const spies = setupSpies(makeMatch({ status: 'awaiting_result' }))

    await loadPage()
    spies.fetchMatch.mockResolvedValue(makeMatch({ status: 'completed' }))

    // The real sequence: our claim is pending, the opponent confirms it, the
    // claim watcher refreshes the match — and the match is now completed.
    spies.resultsStore.currentResult = { status: 'pending' } as ResultClaimResponse
    await settle(2)
    spies.resultsStore.currentResult = { status: 'confirmed' } as ResultClaimResponse
    await settle()

    expect(spies.fetchMatchResultReview).toHaveBeenCalledWith('match-1')
  })

  it('does not re-fetch the review for a match that was already completed on load', async () => {
    const spies = setupSpies(makeMatch({ status: 'completed' }))

    await loadPage()
    await settle()

    // `fetchAll` owns the load case and awaits it; the transition watcher must
    // not fire a second, redundant request for the same state.
    expect(spies.fetchMatchResultReview).toHaveBeenCalledTimes(1)
  })

  it('does not fetch a review for a match that is still in progress', async () => {
    const spies = setupSpies(makeMatch({ status: 'awaiting_result' }))

    await loadPage()
    spies.fetchMatch.mockResolvedValue(makeMatch({ status: 'in_progress' }))
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(spies.fetchMatchResultReview).not.toHaveBeenCalled()
  })
})
