import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'

vi.mock('@/api/client', () => ({
  getAuthToken: () => 'test-token',
}))
const refreshAccessToken = vi.hoisted(() => vi.fn())
vi.mock('@/api/middleware', () => ({ refreshAccessToken }))
vi.mock('@/api/baseUrl', () => ({
  wsBaseUrl: () => 'ws://test.local',
}))

import { useMatchLobbySocket } from '@/composables/useMatchLobbySocket'

/** Minimal scriptable WebSocket double. Instances are collected so tests can
 * drive open/close/message events explicitly. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1
  static CONNECTING = 0

  url: string
  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
  }

  // Test drivers
  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  fail() {
    this.onclose?.()
  }

  message(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

function mountSocket() {
  let socket!: ReturnType<typeof useMatchLobbySocket>
  const app = createApp(
    defineComponent({
      setup() {
        socket = useMatchLobbySocket(() => 'match-1')
        return () => h('div')
      },
    }),
  )
  app.mount(document.createElement('div'))
  return { socket, app }
}

describe('useMatchLobbySocket reconnect behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    refreshAccessToken.mockReset()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('grows backoff across consecutive failed attempts (counter is not reset per attempt)', () => {
    const { socket, app } = mountSocket()
    socket.connect()
    expect(FakeWebSocket.instances).toHaveLength(1)

    // Attempt 1 fails → retry scheduled at 2s (1 × base delay)
    FakeWebSocket.instances[0]!.fail()
    vi.advanceTimersByTime(1_999)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2)

    // Attempt 2 fails → next retry must back off to 4s, NOT stay at 2s
    FakeWebSocket.instances[1]!.fail()
    vi.advanceTimersByTime(2_000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(2_000)
    expect(FakeWebSocket.instances).toHaveLength(3)

    app.unmount()
  })

  it('gives up after MAX_RECONNECT_ATTEMPTS and engages fallback polling', () => {
    const { socket, app } = mountSocket()
    const fallback = vi.fn()
    socket.onFallback(fallback)
    socket.connect()

    // Fail every attempt; drive timers far enough to fire each scheduled retry.
    for (let i = 0; i < 10; i++) {
      FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!.fail()
      vi.advanceTimersByTime(10_001)
    }

    // 1 initial + 10 retries; the 10th failure exhausts the budget.
    expect(FakeWebSocket.instances.length).toBe(11)
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!.fail()
    expect(socket.usingFallback.value).toBe(true)

    // Fallback polls on its interval
    vi.advanceTimersByTime(5_000)
    expect(fallback).toHaveBeenCalled()

    app.unmount()
  })

  it('resets the retry budget once the socket authenticates', () => {
    const { socket, app } = mountSocket()
    socket.connect()

    // Burn 9 attempts
    for (let i = 0; i < 9; i++) {
      FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!.fail()
      vi.advanceTimersByTime(10_001)
    }
    expect(FakeWebSocket.instances.length).toBe(10)

    // 10th connection opens AND authenticates → budget resets
    const live = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!
    live.open()
    live.message({
      type: 'auth_success',
      role: 'participant',
      registration_id: null,
      team_name: null,
      lobby_state: { session: null, participants: [], spectator_count: 0 },
    })
    expect(socket.connected.value).toBe(true)

    // A later drop starts a fresh backoff sequence (2s), not fallback
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!.fail()
    vi.advanceTimersByTime(2_000)
    expect(FakeWebSocket.instances.length).toBe(11)
    expect(socket.usingFallback.value).toBe(false)

    app.unmount()
  })

  it('refreshes the access token once and reconnects when the socket auth is refused', async () => {
    refreshAccessToken.mockResolvedValue(true)
    const { socket, app } = mountSocket()
    socket.connect()
    const first = FakeWebSocket.instances[0]!
    first.open()

    // Expired token: the server answers auth_error and closes.
    first.message({ type: 'auth_error', error: 'token expired' })
    first.fail()
    await vi.advanceTimersByTimeAsync(0)

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    // Exactly one new socket — from the recovery path, not the 2s retry too.
    expect(FakeWebSocket.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(socket.usingFallback.value).toBe(false)

    app.unmount()
  })

  it('falls back to polling instead of looping when the refresh does not help', async () => {
    refreshAccessToken.mockResolvedValue(false)
    const { socket, app } = mountSocket()
    const fallback = vi.fn()
    socket.onFallback(fallback)
    socket.connect()
    const first = FakeWebSocket.instances[0]!
    first.open()

    first.message({ type: 'auth_error', error: 'token expired' })
    first.fail()
    await vi.advanceTimersByTimeAsync(0)

    expect(socket.usingFallback.value).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    // No reconnect storm: still only the one socket.
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(fallback).toHaveBeenCalled()

    app.unmount()
  })

  it('gives up after a second refusal straight after a successful refresh', async () => {
    refreshAccessToken.mockResolvedValue(true)
    const { socket, app } = mountSocket()
    socket.onFallback(vi.fn())
    socket.connect()
    FakeWebSocket.instances[0]!.open()
    FakeWebSocket.instances[0]!.message({ type: 'auth_error', error: 'token expired' })
    await vi.advanceTimersByTimeAsync(0)

    const second = FakeWebSocket.instances[1]!
    second.open()
    second.message({ type: 'auth_error', error: 'forbidden' })
    await vi.advanceTimersByTimeAsync(0)

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(socket.usingFallback.value).toBe(true)

    app.unmount()
  })

  it('drops frames with unknown type or malformed veto session (runtime guard)', () => {
    const { socket, app } = mountSocket()
    const onUpdate = vi.fn()
    socket.onMessage({ veto_state_update: onUpdate })
    socket.connect()
    const ws = FakeWebSocket.instances[0]!
    ws.open()

    ws.message({ type: 'nonsense', session: {} })
    ws.message({ type: 'veto_state_update', session: 'not-an-object' })
    expect(onUpdate).not.toHaveBeenCalled()

    ws.message({ type: 'veto_state_update', session: { id: 's1' } })
    expect(onUpdate).toHaveBeenCalledTimes(1)

    app.unmount()
  })
})
