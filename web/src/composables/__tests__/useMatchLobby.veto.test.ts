import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h, ref, type Ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

type Handlers = Record<string, (msg: unknown) => void>
const socketState = vi.hoisted(() => ({
  handlers: {} as Handlers,
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn(),
}))

vi.mock('@/composables/useMatchLobbySocket', async () => {
  const { ref } = await import('vue')
  return {
    useMatchLobbySocket: () => ({
      connected: ref(true),
      authenticated: ref(true),
      usingFallback: ref(false),
      role: ref(null),
      connect: socketState.connect,
      disconnect: socketState.disconnect,
      send: socketState.send,
      onMessage: (map: Handlers) => {
        socketState.handlers = { ...socketState.handlers, ...map }
      },
      onFallback: () => {},
    }),
  }
})

import { useMatchLobby } from '@/composables/useMatchLobby'
import { useMatchServerStore } from '@/stores/matchServer'
import { noteServerTime, resetServerClock } from '@/utils/serverClock'
import {
  useVetoStore,
  type VetoSessionResponse,
  type VetoSessionStateResponse,
} from '@/stores/veto'

function makeSession(overrides: Partial<VetoSessionResponse> = {}): VetoSessionResponse {
  return {
    id: 'session-1',
    match_id: 'match-1',
    status: 'pending',
    veto_format_id: 'bo3_veto',
    current_action_number: 0,
    current_team_turn: null,
    side_selection_mode: 'picker_choice',
    ...overrides,
  } as VetoSessionResponse
}

const SEQUENCE = [
  { action_type: 'ban', team: 1 },
  { action_type: 'ban', team: 2 },
  { action_type: 'pick', team: 1 },
  { action_type: 'pick', team: 2 },
  { action_type: 'ban', team: 1 },
  { action_type: 'ban', team: 2 },
  { action_type: 'decider', team: 0 },
]

/** What `GET /veto` returns before the session goes live: no current action. */
function makeState(session: VetoSessionResponse, overrides: object = {}): VetoSessionStateResponse {
  return {
    session,
    maps: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ map_id: id, map_name: id, status: 'available' })),
    actions: [],
    format: { id: 'bo3_veto', sequence: SEQUENCE },
    current_action: null,
    ...overrides,
  } as unknown as VetoSessionStateResponse
}

function mountLobby(canAct?: Ref<boolean>) {
  let lobby!: ReturnType<typeof useMatchLobby>
  const app = createApp(
    defineComponent({
      setup() {
        lobby = useMatchLobby(ref<string | null>('match-1'), ref<string | null>('reg-a'), canAct)
        return () => h('div')
      },
    }),
  )
  app.mount(document.createElement('div'))
  return { lobby, unmount: () => app.unmount() }
}

describe('useMatchLobby veto phase under live updates', () => {
  let unmount: () => void = () => {}

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    socketState.handlers = {}
  })

  afterEach(() => unmount())

  it('shows the banning phase — not "completed" — when the coin flip lands live', () => {
    const store = useVetoStore()
    const getVetoSession = vi.spyOn(store, 'getVetoSession').mockResolvedValue(null as never)
    // Page loaded during check-in: the session is pending, so the server
    // reported no current action.
    store.sessionState = makeState(makeSession())
    store.session = store.sessionState!.session
    const mounted = mountLobby()
    unmount = mounted.unmount
    expect(mounted.lobby.phase.value).toBe('waiting')

    socketState.handlers.veto_state_update!({
      type: 'veto_state_update',
      session: makeSession({ status: 'in_progress', current_action_number: 1, current_team_turn: 'reg-a' }),
    })

    expect(mounted.lobby.phase.value).toBe('banning')
    expect(mounted.lobby.isMyTurn.value).toBe(true)
    // Full state was already loaded, so the frame alone is enough.
    expect(getVetoSession).not.toHaveBeenCalled()
  })

  it('never reports a live session with an unknown step as completed', () => {
    const store = useVetoStore()
    vi.spyOn(store, 'getVetoSession').mockResolvedValue(null as never)
    store.sessionState = makeState(makeSession({ status: 'in_progress', current_action_number: 1 }), {
      format: null,
    })
    store.session = store.sessionState!.session
    const mounted = mountLobby()
    unmount = mounted.unmount

    expect(mounted.lobby.phase.value).toBe('waiting')
  })

  it('fetches the full state when a live update arrives before any was loaded', () => {
    const store = useVetoStore()
    const getVetoSession = vi.spyOn(store, 'getVetoSession').mockResolvedValue(null as never)
    const mounted = mountLobby()
    unmount = mounted.unmount

    socketState.handlers.veto_state_update!({
      type: 'veto_state_update',
      session: makeSession({ status: 'coin_flip' }),
    })

    expect(getVetoSession).toHaveBeenCalledWith('match-1')
  })

  it('re-reads the full state when the veto completes, so the decider is shown', () => {
    const store = useVetoStore()
    const getVetoSession = vi.spyOn(store, 'getVetoSession').mockResolvedValue(null as never)
    store.sessionState = makeState(makeSession({ status: 'in_progress', current_action_number: 6 }))
    store.session = store.sessionState!.session
    const mounted = mountLobby()
    unmount = mounted.unmount

    socketState.handlers.veto_complete!({
      type: 'veto_complete',
      session: makeSession({ status: 'completed', current_action_number: 8 }),
    })

    expect(mounted.lobby.phase.value).toBe('completed')
    expect(getVetoSession).toHaveBeenCalledWith('match-1')
  })

  it('re-reads the full state after a (re)connect authenticates', () => {
    const store = useVetoStore()
    const getVetoSession = vi.spyOn(store, 'getVetoSession').mockResolvedValue(null as never)
    const mounted = mountLobby()
    unmount = mounted.unmount

    socketState.handlers.auth_success!({
      type: 'auth_success',
      role: 'participant',
      lobby_state: { participants: [], spectator_count: 0, session: makeSession({ status: 'in_progress', current_action_number: 3 }) },
    })

    expect(getVetoSession).toHaveBeenCalledWith('match-1')
  })

  it('re-reads the server over REST on an assignment push (the socket strips connect details for non-captains)', () => {
    vi.spyOn(useVetoStore(), 'getVetoSession').mockResolvedValue(null as never)
    const serverStore = useMatchServerStore()
    const fetchMatchServer = vi.spyOn(serverStore, 'fetchMatchServer').mockResolvedValue(null)
    const mounted = mountLobby()
    unmount = mounted.unmount

    socketState.handlers.server_assignment_update!({
      type: 'server_assignment_update',
      status: 'ready',
      connect: null,
    })

    expect(serverStore.reservation?.status).toBe('ready')
    expect(fetchMatchServer).toHaveBeenCalledWith('match-1')
  })

  it('rejoins the socket once when the match enters pick/ban still awaiting the flip', async () => {
    const store = useVetoStore()
    vi.spyOn(store, 'getVetoSession').mockImplementation(async () => {
      store.session = makeSession({ status: 'coin_flip' })
      return null as never
    })
    const mounted = mountLobby()
    unmount = mounted.unmount

    await mounted.lobby.resync({ rejoin: true })

    expect(socketState.connect).toHaveBeenCalledTimes(1)
  })

  it('does not drop a healthy socket on resync once the veto is under way', async () => {
    const store = useVetoStore()
    vi.spyOn(store, 'getVetoSession').mockImplementation(async () => {
      store.session = makeSession({ status: 'in_progress', current_action_number: 2 })
      return null as never
    })
    const mounted = mountLobby()
    unmount = mounted.unmount

    await mounted.lobby.resync({ rejoin: true })

    expect(socketState.connect).not.toHaveBeenCalled()
  })

  describe('turn countdown', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-27T20:02:00Z'))
      resetServerClock()
    })

    afterEach(() => {
      resetServerClock()
      vi.useRealTimers()
    })

    it("counts down against the server's clock when this PC's clock is fast", async () => {
      // This PC reads 20:02:00; the server reads 20:00:00 and gave the turn
      // until 20:00:20. Against the local clock that deadline is long gone.
      noteServerTime(new Date('2026-11-27T20:00:00Z').getTime())
      const store = useVetoStore()
      vi.spyOn(store, 'getVetoSession').mockResolvedValue(null as never)
      const session = makeSession({
        status: 'in_progress',
        current_action_number: 1,
        current_team_turn: 'reg-a',
        action_deadline: '2026-11-27T20:00:20Z',
      })
      // Loaded before the turn started: the deadline arrives over the socket.
      const before = makeSession({ status: 'in_progress', current_action_number: 1 })
      store.sessionState = makeState(before, { current_action: SEQUENCE[0] })
      store.session = before
      const mounted = mountLobby()
      unmount = mounted.unmount

      socketState.handlers.veto_state_update!({ type: 'veto_state_update', session })
      await vi.advanceTimersByTimeAsync(1000)

      expect(mounted.lobby.timeRemaining.value).toBe(19)
    })
  })

  describe('who may act for the team on the clock', () => {
    function liveSessionOnMyTeam() {
      const store = useVetoStore()
      vi.spyOn(store, 'getVetoSession').mockResolvedValue(null as never)
      store.sessionState = makeState(
        makeSession({ status: 'in_progress', current_action_number: 1, current_team_turn: 'reg-a' }),
        { current_action: SEQUENCE[0] },
      )
      store.session = store.sessionState!.session
    }

    function authAs(role: string) {
      socketState.handlers.auth_success!({
        type: 'auth_success',
        role,
        lobby_state: { participants: [], spectator_count: 0, session: null },
      })
    }

    it('gives the captain the turn', () => {
      liveSessionOnMyTeam()
      const mounted = mountLobby(ref(true))
      unmount = mounted.unmount

      expect(mounted.lobby.isMyTurn.value).toBe(true)
    })

    it('does not hand the turn to a roster member the API would refuse', () => {
      liveSessionOnMyTeam()
      const mounted = mountLobby(ref(false))
      unmount = mounted.unmount
      authAs('spectator')

      expect(mounted.lobby.isMyTeamsTurn.value).toBe(true)
      expect(mounted.lobby.isMyTurn.value).toBe(false)
      expect(mounted.lobby.canActInVeto.value).toBe(false)
    })

    it('trusts the socket role when the server classed the viewer as a participant', () => {
      liveSessionOnMyTeam()
      const mounted = mountLobby(ref(false))
      unmount = mounted.unmount
      authAs('participant')

      expect(mounted.lobby.isMyTurn.value).toBe(true)
    })

    it('keeps the old behaviour where no permission is supplied (PUG lobbies)', () => {
      liveSessionOnMyTeam()
      const mounted = mountLobby()
      unmount = mounted.unmount

      expect(mounted.lobby.isMyTurn.value).toBe(true)
    })
  })
})
