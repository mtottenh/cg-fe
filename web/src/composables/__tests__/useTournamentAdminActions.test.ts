import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, createApp, defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createSnackbar, SnackbarKey } from '@/composables/useSnackbar'
import {
  useTournamentAdminActions,
  useTournamentLifecycleGuards,
} from '@/composables/useTournamentAdminActions'
import { useTournamentsStore, type TournamentResponse } from '@/stores/tournaments'

/**
 * Mounts a throwaway component whose setup() calls `fn`. Gives composables a
 * real component instance + an app context with a snackbar provider, so
 * inject/onMounted/etc. all behave normally.
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

function makeTournament(overrides: Partial<TournamentResponse> = {}): TournamentResponse {
  return {
    id: 'tourney-1',
    status: 'draft',
    check_in_required: false,
    ...overrides,
  } as TournamentResponse
}

describe('useTournamentLifecycleGuards', () => {
  const cases: Array<[string, Partial<Record<string, boolean>>]> = [
    ['draft', { canPublish: true, canCancel: true }],
    ['published', { canOpenRegistration: true, canCancel: true }],
    ['registration', { canCloseRegistration: true, canCancel: true }],
    ['scheduled', { canReopenRegistration: true, canStart: true, canCancel: true }],
    ['in_progress', { canComplete: true, canCancel: true }],
    ['completed', { canFinalize: true, canCancel: false }],
    ['finalized', { canCancel: false }],
    ['cancelled', { canCancel: false }],
  ]

  for (const [status, truths] of cases) {
    it(`for status='${status}' sets exactly the expected guards`, () => {
      const tournament = ref(makeTournament({ status } as Partial<TournamentResponse>))
      const guards = useTournamentLifecycleGuards(tournament)
      const actual = {
        canPublish: guards.canPublish.value,
        canOpenRegistration: guards.canOpenRegistration.value,
        canCloseRegistration: guards.canCloseRegistration.value,
        canReopenRegistration: guards.canReopenRegistration.value,
        canStart: guards.canStart.value,
        canComplete: guards.canComplete.value,
        canFinalize: guards.canFinalize.value,
        canCancel: guards.canCancel.value,
        canProcessNoShows: guards.canProcessNoShows.value,
      }
      for (const [flag, expected] of Object.entries(actual)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const want = (truths as any)[flag] ?? false
        expect(expected, `${flag} for status=${status}`).toBe(want)
      }
    })
  }

  it('canProcessNoShows requires both scheduled status and check_in_required', () => {
    const t1 = ref(makeTournament({ status: 'scheduled', check_in_required: false } as Partial<TournamentResponse>))
    expect(useTournamentLifecycleGuards(t1).canProcessNoShows.value).toBe(false)

    const t2 = ref(makeTournament({ status: 'scheduled', check_in_required: true } as Partial<TournamentResponse>))
    expect(useTournamentLifecycleGuards(t2).canProcessNoShows.value).toBe(true)

    const t3 = ref(makeTournament({ status: 'in_progress', check_in_required: true } as Partial<TournamentResponse>))
    expect(useTournamentLifecycleGuards(t3).canProcessNoShows.value).toBe(false)
  })

  it('returns all-false guards when tournament is null', () => {
    const tournament = ref<TournamentResponse | null>(null)
    const guards = useTournamentLifecycleGuards(tournament)
    expect(guards.canPublish.value).toBe(false)
    expect(guards.canCancel.value).toBe(false)
    expect(guards.canProcessNoShows.value).toBe(false)
  })

  it('guards update reactively as status changes', () => {
    const tournament = ref(makeTournament({ status: 'draft' } as Partial<TournamentResponse>))
    const guards = useTournamentLifecycleGuards(tournament)
    expect(guards.canPublish.value).toBe(true)
    expect(guards.canStart.value).toBe(false)
    tournament.value = makeTournament({ status: 'scheduled' } as Partial<TournamentResponse>)
    expect(guards.canPublish.value).toBe(false)
    expect(guards.canStart.value).toBe(true)
  })
})

describe('useTournamentAdminActions', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
  })

  it('publish() calls store and runs `after` on success', async () => {
    const tournament = ref(makeTournament({ status: 'draft' } as Partial<TournamentResponse>))
    const after = vi.fn()

    const { result: actions, unmount } = withApp(() =>
      useTournamentAdminActions(tournament, { after }),
    )
    cleanups.push(unmount)

    const store = useTournamentsStore()
    const publishSpy = vi
      .spyOn(store, 'publishTournament')
      .mockResolvedValue({ id: 'tourney-1', status: 'published' } as unknown as TournamentResponse)

    await actions.publish()

    expect(publishSpy).toHaveBeenCalledWith('tourney-1')
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('does nothing when tournament is null', async () => {
    const tournament = ref<TournamentResponse | null>(null)
    const after = vi.fn()
    const { result: actions, unmount } = withApp(() =>
      useTournamentAdminActions(tournament, { after }),
    )
    cleanups.push(unmount)
    const store = useTournamentsStore()
    const spy = vi.spyOn(store, 'publishTournament').mockResolvedValue({} as TournamentResponse)
    await actions.publish()
    expect(spy).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })

  it('cancel() opens the confirm dialog without calling the store', async () => {
    const tournament = ref(makeTournament({ status: 'in_progress' } as Partial<TournamentResponse>))
    const { result: actions, unmount } = withApp(() => useTournamentAdminActions(tournament))
    cleanups.push(unmount)

    const store = useTournamentsStore()
    const spy = vi.spyOn(store, 'cancelTournament')

    actions.cancel()

    expect(actions.confirmDialog.state.open).toBe(true)
    expect(actions.confirmDialog.state.color).toBe('error')
    expect(spy).not.toHaveBeenCalled()
  })

  it('cancel confirm.execute() invokes the store', async () => {
    const tournament = ref(makeTournament({ status: 'in_progress' } as Partial<TournamentResponse>))
    const after = vi.fn()
    const { result: actions, unmount } = withApp(() =>
      useTournamentAdminActions(tournament, { after }),
    )
    cleanups.push(unmount)

    const store = useTournamentsStore()
    vi.spyOn(store, 'cancelTournament').mockResolvedValue(
      { id: 'tourney-1', status: 'cancelled' } as unknown as TournamentResponse,
    )

    actions.cancel()
    await actions.confirmDialog.execute()

    expect(store.cancelTournament).toHaveBeenCalledWith('tourney-1')
    expect(after).toHaveBeenCalledTimes(1)
    expect(actions.confirmDialog.state.open).toBe(false)
  })

  it('guards match lifecycle guards of the wrapped tournament', () => {
    const tournament = ref(makeTournament({ status: 'registration' } as Partial<TournamentResponse>))
    const { result: actions, unmount } = withApp(() => useTournamentAdminActions(tournament))
    cleanups.push(unmount)
    expect(actions.canCloseRegistration.value).toBe(true)
    expect(actions.canReopenRegistration.value).toBe(false)
    expect(actions.canPublish.value).toBe(false)
  })
})
