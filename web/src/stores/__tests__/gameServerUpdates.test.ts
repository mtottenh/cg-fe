import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
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
import { JOB_POLL_MS, useGameServerUpdatesStore } from '@/stores/gameServerUpdates'
import type { GameServerUpdates, UpdateJobResponse } from '@/utils/gameServerUpdates'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock
const mockPut = api.PUT as unknown as Mock

const SERVER = 'server-1'
const JOB_PATH = '/v1/admin/game-servers/{server_id}/updates/{job_id}'
const OVERVIEW_PATH = '/v1/admin/game-servers/{server_id}/updates'

function ok<T>(data: T) {
  return { data: { data, meta: { request_id: 'test' } }, error: undefined }
}

function failure(status: number, detail: string) {
  return { data: undefined, error: { type: 'about:blank', title: 'Conflict', status, detail } }
}

function job(overrides: Partial<UpdateJobResponse> = {}): UpdateJobResponse {
  return {
    id: 'job-1',
    server_id: SERVER,
    operation: 'mods',
    status: 'running',
    trigger: 'portal',
    requested_by: 'u-1',
    requested_by_username: 'max',
    forced: false,
    phase: 'mods-update',
    failed_phase: null,
    error: null,
    restarted: null,
    agent_synthesized: false,
    blocks_allocation: true,
    created_at: '2026-11-22T10:00:00Z',
    started_at: '2026-11-22T10:00:01Z',
    finished_at: null,
    updated_at: '2026-11-22T10:00:05Z',
    before: null,
    after: null,
    load: null,
    config_report: null,
    log_tail: null,
    ...overrides,
  }
}

function overview(overrides: Partial<GameServerUpdates> = {}): GameServerUpdates {
  return {
    server_id: SERVER,
    agent_connected: true,
    agent_version: '0.3.0',
    supported: true,
    capabilities: ['lgsm_update'],
    installed: null,
    check: null,
    load: null,
    demo_upload_wired: true,
    overrides_applied: null,
    reload_pending: false,
    agent_job: null,
    active_job: null,
    recent_jobs: [],
    safety: {
      humans_connected: 0,
      players: [],
      reservation: null,
      bookings: [],
      restart_needs_force: false,
      reasons: [],
    },
    ...overrides,
  }
}

/** Calls made to one path. */
function callsTo(mock: Mock, path: string) {
  return mock.mock.calls.filter((c) => c[0] === path)
}

describe('gameServerUpdates store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetchUpdates keeps the overview under its server id', async () => {
    mockGet.mockResolvedValueOnce(ok(overview()))
    const store = useGameServerUpdatesStore()

    await store.fetchUpdates(SERVER)

    expect(mockGet).toHaveBeenCalledWith(OVERVIEW_PATH, {
      params: { path: { server_id: SERVER } },
    })
    expect(store.overviews[SERVER]?.supported).toBe(true)
  })

  it('startUpdate sends no force flag unless asked', async () => {
    mockPost.mockResolvedValueOnce(ok(job()))
    const store = useGameServerUpdatesStore()

    await store.startUpdate(SERVER, 'mods')
    store.stopPolling()

    expect(mockPost).toHaveBeenCalledWith(OVERVIEW_PATH, {
      params: { path: { server_id: SERVER } },
      body: { operation: 'mods' },
    })
  })

  it('startUpdate with force sends force: true', async () => {
    mockPost.mockResolvedValueOnce(ok(job({ forced: true })))
    const store = useGameServerUpdatesStore()

    const started = await store.startUpdate(SERVER, 'all', true)
    store.stopPolling()

    expect(mockPost.mock.calls[0]?.[1]).toEqual({
      params: { path: { server_id: SERVER } },
      body: { operation: 'all', force: true },
    })
    expect(started.forced).toBe(true)
  })

  it('surfaces the 409 detail when a restart would interrupt players', async () => {
    const detail =
      '`mods` restarts CS2 and would interrupt: 3 players connected. Send force: true to go ahead anyway'
    mockPost.mockResolvedValueOnce(failure(409, detail))
    const store = useGameServerUpdatesStore()

    const err = await store.startUpdate(SERVER, 'mods').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(409)
    expect(store.startState.error).toBe(detail)
    expect(store.error).toBe(detail)
    // Nothing to follow: no job was created.
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 3)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('surfaces the 502 detail when the agent did not answer', async () => {
    mockPost.mockResolvedValueOnce(failure(502, 'the agent did not answer'))
    mockGet.mockResolvedValueOnce(ok(overview()))
    const store = useGameServerUpdatesStore()

    await expect(store.repairConfig(SERVER)).rejects.toBeInstanceOf(ApiError)
    expect(store.repairState.error).toBe('the agent did not answer')
  })

  it('after a 502 shows and follows the job the agent left queued', async () => {
    const detail =
      'the agent did not answer; the outcome is unknown and job job-7 stays queued until the agent reports'
    mockPost.mockResolvedValueOnce(failure(502, detail))
    const queued = job({ id: 'job-7', status: 'queued', phase: null })
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(
        path === OVERVIEW_PATH
          ? ok(overview({ active_job: queued }))
          : ok(callsTo(mockGet, JOB_PATH).length < 3 ? queued : job({ id: 'job-7', status: 'succeeded', phase: 'done' })),
      ),
    )
    const store = useGameServerUpdatesStore()

    const err = await store.startUpdate(SERVER, 'game').catch((e: unknown) => e)

    expect((err as ApiError).status).toBe(502)
    expect(store.startState.error).toBe(detail)
    expect(store.job?.id).toBe('job-7')
    expect(store.job?.status).toBe('queued')

    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 2)
    expect(store.job?.status).toBe('succeeded')
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 3)
    expect(callsTo(mockGet, JOB_PATH)).toHaveLength(3)
  })

  it('a 409 does not re-read the overview', async () => {
    mockPost.mockResolvedValueOnce(failure(409, 'update job x (mods) is already running on this server'))
    const store = useGameServerUpdatesStore()

    await expect(store.repairConfig(SERVER)).rejects.toBeInstanceOf(ApiError)
    expect(mockGet).not.toHaveBeenCalled()
    expect(store.job).toBeNull()
  })

  it('polls the job every 2 s until it is terminal, then refreshes the overview', async () => {
    mockPost.mockResolvedValueOnce(ok(job({ status: 'queued', phase: 'starting' })))
    mockGet.mockImplementation((path: string) => {
      if (path === OVERVIEW_PATH) return Promise.resolve(ok(overview()))
      const n = callsTo(mockGet, JOB_PATH).length
      return Promise.resolve(
        ok(n < 3 ? job({ phase: 'verify' }) : job({ status: 'succeeded', phase: 'done' })),
      )
    })
    const store = useGameServerUpdatesStore()

    await store.startUpdate(SERVER, 'mods')
    expect(callsTo(mockGet, JOB_PATH)).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect(callsTo(mockGet, JOB_PATH)).toHaveLength(1)
    expect(store.job?.phase).toBe('verify')

    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 2)
    expect(callsTo(mockGet, JOB_PATH)).toHaveLength(3)
    expect(store.job?.status).toBe('succeeded')
    expect(callsTo(mockGet, OVERVIEW_PATH)).toHaveLength(1)

    // Terminal: no more polling.
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 5)
    expect(callsTo(mockGet, JOB_PATH)).toHaveLength(3)
  })

  it('stopPolling (modal closed) ends the job poll', async () => {
    mockPost.mockResolvedValueOnce(ok(job()))
    mockGet.mockResolvedValue(ok(job()))
    const store = useGameServerUpdatesStore()

    await store.startUpdate(SERVER, 'game')
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect(callsTo(mockGet, JOB_PATH)).toHaveLength(1)

    store.stopPolling()
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 5)
    expect(callsTo(mockGet, JOB_PATH)).toHaveLength(1)
  })

  it('keeps polling through a failed tick', async () => {
    mockPost.mockResolvedValueOnce(ok(job()))
    mockGet
      .mockResolvedValueOnce(failure(500, 'boom'))
      .mockResolvedValue(ok(job({ status: 'rolled_back', phase: 'rollback', failed_phase: 'verify' })))
    const store = useGameServerUpdatesStore()

    await store.startUpdate(SERVER, 'mods')
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect(store.fetchJobState.error).toBe('boom')
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect(store.job?.status).toBe('rolled_back')
  })

  it('openJob follows a running job but not a finished one', async () => {
    mockGet.mockResolvedValue(ok(job({ status: 'failed', failed_phase: 'game-update' })))
    const store = useGameServerUpdatesStore()

    await store.openJob(SERVER, 'job-1')
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 3)

    expect(callsTo(mockGet, JOB_PATH)).toHaveLength(1)
    expect(store.job?.failed_phase).toBe('game-update')
  })

  it('checkNow polls the overview until a newer check arrives', async () => {
    const store = useGameServerUpdatesStore()
    mockGet.mockResolvedValueOnce(
      ok(overview({ check: { checked_at: '2026-11-22T09:00:00Z', latest: {}, update_available: {} } })),
    )
    await store.fetchUpdates(SERVER)

    mockPost.mockResolvedValueOnce(ok({ job_id: 'chk-1', operation: 'check' }))
    mockGet
      .mockResolvedValueOnce(
        ok(overview({
          agent_job: { job_id: 'chk-1', operation: 'check', phase: 'check', status: 'running' },
          check: { checked_at: '2026-11-22T09:00:00Z', latest: {}, update_available: {} },
        })),
      )
      .mockResolvedValueOnce(
        ok(overview({
          check: {
            checked_at: '2026-11-22T10:00:00Z',
            latest: { matchzy: '0.9.4' },
            update_available: { matchzy: true, mods: true },
          },
        })),
      )

    await store.checkNow(SERVER)
    expect(store.checking).toBe(true)

    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect(store.checking).toBe(true)
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect(store.checking).toBe(false)
    expect(store.overviews[SERVER]?.check?.latest.matchzy).toBe('0.9.4')

    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 3)
    expect(callsTo(mockGet, OVERVIEW_PATH)).toHaveLength(3)
  })

  it('saveOverrides records the delivery and follows an applying repair job', async () => {
    mockPut.mockResolvedValueOnce(
      ok({ overrides: { matchzy_a: '1' }, delivery: 'applying', job_id: 'job-9', detail: null }),
    )
    mockGet.mockResolvedValue(ok(job({ id: 'job-9', operation: 'repair-config', trigger: 'overrides' })))
    const store = useGameServerUpdatesStore()

    const saved = await store.saveOverrides(SERVER, { matchzy_a: '1' })

    expect(mockPut).toHaveBeenCalledWith('/v1/admin/game-servers/{server_id}/matchzy-overrides', {
      params: { path: { server_id: SERVER } },
      body: { overrides: { matchzy_a: '1' } },
    })
    expect(saved.delivery).toBe('applying')
    expect(store.overrides?.pending).toBe(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.job?.id).toBe('job-9')
    store.stopPolling()
  })

  it('saveOverrides surfaces the validation detail on 400', async () => {
    const detail = 'override "matchzy_demo_upload_url" refused: cvar is portal-owned'
    mockPut.mockResolvedValueOnce(failure(400, detail))
    const store = useGameServerUpdatesStore()

    await expect(store.saveOverrides(SERVER, { matchzy_demo_upload_url: 'x' })).rejects.toBeInstanceOf(
      ApiError,
    )
    expect(store.saveOverridesState.error).toBe(detail)
  })

  it('fetchUpdatesQuietly loads what it can and skips failures', async () => {
    mockGet.mockImplementation((_path: string, opts: { params: { path: { server_id: string } } }) =>
      Promise.resolve(
        opts.params.path.server_id === 'bad'
          ? failure(404, 'not found')
          : ok(overview({ server_id: opts.params.path.server_id })),
      ),
    )
    const store = useGameServerUpdatesStore()

    await store.fetchUpdatesQuietly(['a', 'bad', 'c'])

    expect(Object.keys(store.overviews).sort()).toEqual(['a', 'c'])
    expect(store.error).toBeNull()
  })
})
