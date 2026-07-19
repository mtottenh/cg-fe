import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createSnackbar, SnackbarKey } from '@/composables/useSnackbar'
import { useTournamentsStore, type TournamentResponse, type TournamentMatchResponse } from '@/stores/tournaments'
import { useMatchResultsStore } from '@/stores/matchResults'
import { useEvidenceStore } from '@/stores/evidence'
import { useResultReviewsStore } from '@/stores/resultReviews'
import { useDisputesStore } from '@/stores/disputes'
import { useAuthStore } from '@/stores/auth'

// useMatchDetail reads `useRoute()` at module call time — stub it so test
// harness doesn't need a full router instance.
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { tournamentSlug: 'slug-1', matchId: 'match-1' } }),
}))

import { useMatchDetail } from '@/composables/useMatchDetail'

/**
 * Mounts a throwaway component whose setup() calls `fn`. Returns what `fn`
 * returned, so onMounted/onUnmounted hooks register against a real component
 * instance (no Vue warnings about "no active component").
 */
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
    status: 'scheduled',
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
    // Not self_scheduled: keeps fetchAll away from the scheduling endpoints,
    // which are irrelevant to the status-guard behaviour under test.
    scheduling_mode: 'live',
  } as TournamentResponse
}

/**
 * Regression tests for the DisputeThreadPanel dead-code bug: 'disputed' is a
 * real MatchStatus (raising a claim dispute sets it), so the status guards in
 * fetchAll/pollMatch must include it — otherwise the result + dispute data is
 * never fetched and the dispute thread never renders for disputed matches.
 */
describe('useMatchDetail fetchAll status guards include disputed', () => {
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
    vi.spyOn(tournamentsStore, 'fetchMatch').mockResolvedValue(match)
    vi.spyOn(tournamentsStore, 'fetchRegistrations').mockResolvedValue([])

    const spies = {
      fetchCurrentResult: vi.spyOn(resultsStore, 'fetchCurrentResult').mockResolvedValue(null),
      fetchResultHistory: vi.spyOn(resultsStore, 'fetchResultHistory').mockResolvedValue([]),
      fetchLinkedDemos: vi.spyOn(evidenceStore, 'fetchLinkedDemos').mockResolvedValue([]),
      fetchEvidence: vi.spyOn(evidenceStore, 'fetchEvidence').mockResolvedValue([]),
      discoverDemos: vi.spyOn(evidenceStore, 'discoverDemos').mockResolvedValue([]),
      fetchMatchResultReview: vi
        .spyOn(resultReviewsStore, 'fetchMatchResultReview')
        .mockResolvedValue(null),
      fetchMatchDispute: vi.spyOn(disputesStore, 'fetchMatchDispute').mockResolvedValue(null),
    }

    return spies
  }

  function runFetchAll() {
    const { result, unmount } = withApp(() => useMatchDetail())
    cleanups.push(unmount)
    return result.fetchAll()
  }

  it("status 'disputed' fetches result data, evidence and the dispute thread", async () => {
    const spies = setupSpies(makeMatch({ status: 'disputed', disputed: true }))

    await runFetchAll()

    expect(spies.fetchCurrentResult).toHaveBeenCalledWith('match-1')
    expect(spies.fetchResultHistory).toHaveBeenCalledWith('match-1')
    expect(spies.fetchLinkedDemos).toHaveBeenCalledWith('match-1')
    expect(spies.fetchEvidence).toHaveBeenCalledWith('match-1')
    expect(spies.fetchMatchDispute).toHaveBeenCalledWith('tourney-1', 'match-1')
    // demo discovery only runs while the match is being played
    expect(spies.discoverDemos).not.toHaveBeenCalled()
    // result review is a completed-match concern
    expect(spies.fetchMatchResultReview).not.toHaveBeenCalled()
  })

  it("a completed match flagged disputed also loads the dispute (post-completion disputes)", async () => {
    const spies = setupSpies(makeMatch({ status: 'completed', disputed: true }))

    await runFetchAll()

    expect(spies.fetchCurrentResult).toHaveBeenCalledWith('match-1')
    expect(spies.fetchMatchDispute).toHaveBeenCalledWith('tourney-1', 'match-1')
    expect(spies.fetchMatchResultReview).toHaveBeenCalledWith('match-1')
  })

  it("a scheduled, undisputed match fetches neither result nor dispute data", async () => {
    const spies = setupSpies(makeMatch({ status: 'scheduled' }))

    await runFetchAll()

    expect(spies.fetchCurrentResult).not.toHaveBeenCalled()
    expect(spies.fetchResultHistory).not.toHaveBeenCalled()
    expect(spies.fetchLinkedDemos).not.toHaveBeenCalled()
    expect(spies.fetchEvidence).not.toHaveBeenCalled()
    expect(spies.fetchMatchDispute).not.toHaveBeenCalled()
  })

  it("an in_progress match fetches results and discovers demos but no dispute", async () => {
    const spies = setupSpies(makeMatch({ status: 'in_progress' }))

    await runFetchAll()

    expect(spies.fetchCurrentResult).toHaveBeenCalledWith('match-1')
    expect(spies.discoverDemos).toHaveBeenCalledWith('match-1')
    expect(spies.fetchMatchDispute).not.toHaveBeenCalled()
  })
})
