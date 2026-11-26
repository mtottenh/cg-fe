import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createSnackbar, SnackbarKey } from '@/composables/useSnackbar'
import { useTournamentsStore, type TournamentResponse, type TournamentMatchResponse } from '@/stores/tournaments'
import { useMatchServerStore } from '@/stores/matchServer'
import { useVetoStore } from '@/stores/veto'
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
    status: 'checking_in',
    match_format: 'bo3',
    veto_required: true,
    disputed: false,
    ...overrides,
  } as TournamentMatchResponse
}

async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

/**
 * The match page used to stop refreshing entirely while it believed the match
 * was in `checking_in` or `pick_ban`, on the theory that the lobby websocket
 * pushes everything. No websocket frame carries the match status, so a page
 * left open never learned that the opponent had checked in, that the veto had
 * started, or that the match had gone live.
 */
describe('useMatchDetail keeps refreshing during check-in and pick/ban', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
    vi.useRealTimers()
  })

  function setupSpies(match: TournamentMatchResponse) {
    const tournamentsStore = useTournamentsStore()
    useAuthStore().playerId = 'player-a'
    const tournament = {
      id: 'tourney-1',
      slug: 'slug-1',
      participant_type: 'team',
      scheduling_mode: 'live',
    } as TournamentResponse
    vi.spyOn(tournamentsStore, 'fetchTournamentBySlug').mockImplementation(async () => {
      tournamentsStore.currentTournament = tournament
      return tournament
    })
    vi.spyOn(tournamentsStore, 'fetchMatchParticipants').mockResolvedValue({
      match_id: match.id,
      my_registration_id: 'reg-a',
    } as Awaited<ReturnType<typeof tournamentsStore.fetchMatchParticipants>>)
    vi.spyOn(useMatchServerStore(), 'fetchMatchServer').mockResolvedValue(null)
    return {
      fetchMatch: vi.spyOn(tournamentsStore, 'fetchMatch').mockResolvedValue(match),
      getVetoSession: vi
        .spyOn(useVetoStore(), 'getVetoSession')
        .mockResolvedValue(null as unknown as Awaited<ReturnType<ReturnType<typeof useVetoStore>['getVetoSession']>>),
    }
  }

  async function loadPage() {
    const { result, unmount } = withApp(() => useMatchDetail())
    cleanups.push(unmount)
    await result.fetchAll()
    return result
  }

  it('notices the match leaving check-in when the tab regains focus', async () => {
    const spies = setupSpies(makeMatch({ status: 'checking_in' }))
    const page = await loadPage()

    spies.fetchMatch.mockResolvedValue(makeMatch({ status: 'pick_ban' }))
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(page.match.value?.status).toBe('pick_ban')
  })

  it('notices the match going live from pick/ban on the poll interval', async () => {
    vi.useFakeTimers()
    const spies = setupSpies(makeMatch({ status: 'pick_ban' }))
    const page = await loadPage()

    spies.fetchMatch.mockResolvedValue(makeMatch({ status: 'in_progress' }))
    await vi.advanceTimersByTimeAsync(15_000)

    expect(page.match.value?.status).toBe('in_progress')
  })

  it('re-reads the veto session on each refresh while the veto is live', async () => {
    const spies = setupSpies(makeMatch({ status: 'pick_ban' }))
    await loadPage()
    expect(spies.getVetoSession).not.toHaveBeenCalled()

    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(spies.getVetoSession).toHaveBeenCalledWith('match-1')
  })

  it('does not poll the veto session outside pick/ban', async () => {
    const spies = setupSpies(makeMatch({ status: 'checking_in' }))
    await loadPage()

    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(spies.getVetoSession).not.toHaveBeenCalled()
  })
})
