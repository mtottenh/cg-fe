import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock only the `api` client; keep ApiError & friends real so the store
// helpers (unwrapApi/withActionState) behave exactly as in production.
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      GET: vi.fn(),
      POST: vi.fn(),
      PUT: vi.fn(),
      DELETE: vi.fn(),
      PATCH: vi.fn(),
    },
  }
})

import { ApiError, api } from '@/api'
import { useServerConsoleStore } from '@/stores/serverConsole'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock

const SERVER = 'server-1'

function ok<T>(data: T) {
  return { data: { data, meta: { request_id: 'test' } }, error: undefined }
}

function failure(status: number, detail: string) {
  return { data: undefined, error: { status, detail } }
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    server_id: SERVER,
    server_name: 'eu-west-1',
    server_status: 'available',
    agent: { connected: true, version: '0.2.0', heartbeat_at: null, rcon_ok: true, reports_status: true },
    gamestate: 'none',
    status: null,
    raw_status: null,
    status_at: null,
    live: false,
    live_error: null,
    reservation: null,
    holds: [],
    ...overrides,
  }
}

describe('serverConsole store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
  })

  it('fetchSnapshot passes live through as a query flag and keeps the result', async () => {
    mockGet.mockResolvedValueOnce(ok(snapshot({ live: true })))
    const store = useServerConsoleStore()

    const result = await store.fetchSnapshot(SERVER, true)

    expect(mockGet).toHaveBeenCalledWith('/v1/admin/game-servers/{server_id}/console', {
      params: { path: { server_id: SERVER }, query: { live: true } },
    })
    expect(result.live).toBe(true)
    expect(store.snapshot?.server_name).toBe('eu-west-1')
  })

  it('fetchSnapshot defaults to the stored heartbeat', async () => {
    mockGet.mockResolvedValueOnce(ok(snapshot()))
    const store = useServerConsoleStore()

    await store.fetchSnapshot(SERVER)

    expect(mockGet.mock.calls[0]?.[1]).toEqual({
      params: { path: { server_id: SERVER }, query: { live: false } },
    })
  })

  it('fetchHistory stores the audit rows newest first as returned', async () => {
    const rows = [
      { id: 'b', kind: 'raw', command: 'css_pause', output: 'paused', ok: true, force: false, created_at: '2026-09-05T12:01:00Z', server_id: SERVER, reservation_id: null, admin_user_id: 'u', admin_username: 'max' },
      { id: 'a', kind: 'map_change', command: 'changelevel de_mirage', output: '', ok: true, force: false, created_at: '2026-09-05T12:00:00Z', server_id: SERVER, reservation_id: null, admin_user_id: 'u', admin_username: 'max' },
    ]
    mockGet.mockResolvedValueOnce(ok(rows))
    const store = useServerConsoleStore()

    await store.fetchHistory(SERVER, 10)

    expect(mockGet).toHaveBeenCalledWith('/v1/admin/game-servers/{server_id}/console/history', {
      params: { path: { server_id: SERVER }, query: { limit: 10 } },
    })
    expect(store.history.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('changeMap posts the target and force flag verbatim', async () => {
    mockPost.mockResolvedValueOnce(
      ok({
        command: 'changelevel de_mirage',
        ok: true,
        output: '',
        target: { map_id: 'de_mirage', display_name: 'Mirage', engine_name: 'de_mirage', workshop: false },
        cancelled_match_id: null,
        hold_until: '2026-09-05T12:05:00Z',
      }),
    )
    const store = useServerConsoleStore()

    const result = await store.changeMap(SERVER, { map_id: 'de_mirage', force: true })

    expect(mockPost).toHaveBeenCalledWith('/v1/admin/game-servers/{server_id}/console/map', {
      params: { path: { server_id: SERVER } },
      body: { map_id: 'de_mirage', force: true },
    })
    expect(result.command).toBe('changelevel de_mirage')
  })

  it('runAction sends action, args and confirm in one body', async () => {
    mockPost.mockResolvedValueOnce(
      ok({ action: 'kick_player', commands: ['kickid 3 "bye"'], ok: true, output: '', cancelled_match_id: null, hold_until: null }),
    )
    const store = useServerConsoleStore()

    await store.runAction(SERVER, 'kick_player', { userid: 3, reason: 'bye' }, true)

    expect(mockPost).toHaveBeenCalledWith('/v1/admin/game-servers/{server_id}/console/action', {
      params: { path: { server_id: SERVER } },
      body: { action: 'kick_player', args: { userid: 3, reason: 'bye' }, confirm: true },
    })
  })

  it('runCommand surfaces a refusal as an ApiError carrying the reason', async () => {
    mockPost.mockResolvedValueOnce(failure(400, 'rcon_password is portal-owned'))
    const store = useServerConsoleStore()

    await expect(store.runCommand(SERVER, 'rcon_password x')).rejects.toMatchObject({
      status: 400,
      detail: 'rcon_password is portal-owned',
    })
    expect(store.runCommandState.error).toBe('rcon_password is portal-owned')
  })

  it('runCommand returns the agent output and ok flag', async () => {
    mockPost.mockResolvedValueOnce(ok({ ok: false, output: 'Unknown command' }))
    const store = useServerConsoleStore()

    const result = await store.runCommand(SERVER, 'nope')

    expect(result).toEqual({ ok: false, output: 'Unknown command' })
    expect(mockPost.mock.calls[0]?.[1]).toEqual({
      params: { path: { server_id: SERVER } },
      body: { command: 'nope' },
    })
  })

  it('reset forgets the open server', async () => {
    mockGet.mockResolvedValueOnce(ok(snapshot()))
    const store = useServerConsoleStore()
    await store.fetchSnapshot(SERVER)
    expect(store.snapshot).not.toBeNull()

    store.reset()

    expect(store.snapshot).toBeNull()
    expect(store.history).toEqual([])
  })

  it('a 409 from the agent being offline is an ApiError, not a swallowed failure', async () => {
    mockPost.mockResolvedValueOnce(failure(409, 'no agent connected for this server'))
    const store = useServerConsoleStore()

    await expect(store.runAction(SERVER, 'pause')).rejects.toBeInstanceOf(ApiError)
  })
})
