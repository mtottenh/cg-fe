import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createSnackbar, SnackbarKey } from '@/composables/useSnackbar'
import { useTournamentsStore, type TournamentResponse, type TournamentMatchResponse } from '@/stores/tournaments'
import { useMatchResultsStore } from '@/stores/matchResults'
import { useAuthStore } from '@/stores/auth'

// useMatchDetail reads `useRoute()` at module call time — stub it so test
// harness doesn't need a full router instance. The composable's fetchAll
// relies on `route.params.tournamentSlug`/`matchId`, which aren't exercised
// here; we only test the panel-visibility computeds that react to store state.
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
  const el = document.createElement('div')
  app.mount(el)
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

type MatchParticipants = NonNullable<
  ReturnType<typeof useTournamentsStore>['matchParticipants']
>

/**
 * The `GET .../matches/{id}/participants` payload the page now resolves
 * identity from. `my_registration_id` is decided server-side from the match
 * row, which is what removed the 100-participant ceiling (P-53/P-56).
 */
function makeParticipants(overrides: Partial<MatchParticipants> = {}): MatchParticipants {
  return {
    match_id: 'match-1',
    participant1: { id: 'reg-a', player_id: 'player-a' },
    participant2: { id: 'reg-b', player_id: 'player-b' },
    my_registration_id: 'reg-a',
    ...overrides,
  } as MatchParticipants
}

function makeTournament(overrides: Partial<TournamentResponse> = {}): TournamentResponse {
  return {
    id: 'tourney-1',
    slug: 'slug-1',
    participant_type: 'individual',
    scheduling_mode: 'self_scheduled',
    ...overrides,
  } as TournamentResponse
}

describe('useMatchDetail panel-visibility computeds', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
  })

  function setup(matchOverrides: Partial<TournamentMatchResponse> = {}) {
    const { result, unmount } = withApp(() => useMatchDetail())
    cleanups.push(unmount)
    const tournamentsStore = useTournamentsStore()
    const authStore = useAuthStore()
    const resultsStore = useMatchResultsStore()

    // Simulate a logged-in user whose registration matches participant1.
    authStore.playerId = 'player-a'
    authStore.user = { id: 'user-a', username: 'u' } as unknown as typeof authStore.user extends infer U ? U : never
    tournamentsStore.currentTournament = makeTournament()
    // P-53/P-56: identity is now resolved by the server from the MATCH row,
    // not by scanning the paginated registrations list — so the fixture is the
    // participants response rather than a page of registrations.
    tournamentsStore.matchParticipants = makeParticipants()
    result.match.value = makeMatch(matchOverrides)

    return { composable: result, tournamentsStore, resultsStore }
  }

  it('matchFormat falls back to bo1 when format is missing/invalid', () => {
    const { composable } = setup({ match_format: 'unknown' as unknown as 'bo1' })
    expect(composable.matchFormat.value).toBe('bo1')
  })

  it('matchFormat returns the typed format when recognized', () => {
    const { composable } = setup({ match_format: 'bo3' })
    expect(composable.matchFormat.value).toBe('bo3')
  })

  it('userRegistrationId resolves to the participating registration', () => {
    const { composable } = setup()
    expect(composable.userRegistrationId.value).toBe('reg-a')
  })

  it('showSchedulingPanel only true for ready/scheduled on self_scheduled tournaments', () => {
    for (const status of ['ready', 'scheduled'] as const) {
      const { composable } = setup({ status })
      expect(composable.showSchedulingPanel.value, `status=${status}`).toBe(true)
    }
    for (const status of ['pending', 'in_progress', 'completed'] as const) {
      const { composable } = setup({ status })
      expect(composable.showSchedulingPanel.value, `status=${status}`).toBe(false)
    }
  })

  it('showSchedulingPanel is false when scheduling_mode is live', () => {
    const { composable, tournamentsStore } = setup({ status: 'scheduled' })
    tournamentsStore.currentTournament = makeTournament({ scheduling_mode: 'live' })
    expect(composable.showSchedulingPanel.value).toBe(false)
  })

  it('showCheckInPanel is true for scheduled and checking_in', () => {
    for (const status of ['scheduled', 'checking_in'] as const) {
      const { composable } = setup({ status })
      expect(composable.showCheckInPanel.value, `status=${status}`).toBe(true)
    }
  })

  it('showCheckInPanel is false when user is not a participant', () => {
    const { composable, tournamentsStore } = setup({ status: 'scheduled' })
    // The server reports no registration of the caller's in this match.
    tournamentsStore.matchParticipants = makeParticipants({ my_registration_id: undefined })
    expect(composable.userRegistrationId.value).toBeNull()
    expect(composable.showCheckInPanel.value).toBe(false)
  })

  it('showResultPanel is true for in_progress, awaiting_result, or disputed matches', () => {
    for (const status of ['in_progress', 'awaiting_result'] as const) {
      const { composable } = setup({ status })
      expect(composable.showResultPanel.value, `status=${status}`).toBe(true)
    }
    const { composable } = setup({ status: 'completed', disputed: true })
    expect(composable.showResultPanel.value).toBe(true)

    const { composable: c2 } = setup({ status: 'scheduled' })
    expect(c2.showResultPanel.value).toBe(false)
  })

  it('showConfirmationPanel needs a pending claim submitted by the opponent', () => {
    const { composable, resultsStore } = setup({ status: 'awaiting_result' })
    // Opponent submitted
    resultsStore.currentResult = {
      status: 'pending',
      submitted_by_registration_id: 'reg-b',
    } as unknown as typeof resultsStore.currentResult
    expect(composable.showConfirmationPanel.value).toBe(true)
    expect(composable.showWaitingForOpponent.value).toBe(false)

    // User submitted — flips to waiting
    resultsStore.currentResult = {
      status: 'pending',
      submitted_by_registration_id: 'reg-a',
    } as unknown as typeof resultsStore.currentResult
    expect(composable.showConfirmationPanel.value).toBe(false)
    expect(composable.showWaitingForOpponent.value).toBe(true)
  })

  it('canSubmitResult is true when no pending claim exists', () => {
    const { composable, resultsStore } = setup({ status: 'in_progress' })
    expect(composable.canSubmitResult.value).toBe(true)
    resultsStore.currentResult = {
      status: 'pending',
      submitted_by_registration_id: 'reg-b',
    } as unknown as typeof resultsStore.currentResult
    expect(composable.canSubmitResult.value).toBe(false)
  })
})
