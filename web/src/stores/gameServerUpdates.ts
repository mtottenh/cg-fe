import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ApiError, api } from '@/api'
import type { components } from '@/api/types'
import {
  aggregateActionStates,
  createActionState,
  unwrapApi,
  withActionState,
} from '@/stores/helpers'
import {
  isTerminalStatus,
  type GameServerUpdates,
  type StartUpdateOperation,
  type UpdateJobResponse,
} from '@/utils/gameServerUpdates'

type UpdateCheckStarted = components['schemas']['UpdateCheckStartedResponse']
type MatchzyOverrides = components['schemas']['MatchzyOverridesResponse']
type SetMatchzyOverridesResult = components['schemas']['SetMatchzyOverridesResponse']

/** Job progress is read this often while a job runs (design §8). */
export const JOB_POLL_MS = 2_000
/** A check gives up waiting for its result after this long. */
export const CHECK_POLL_LIMIT_MS = 180_000
/**
 * `agent_job` moves only with heartbeats (every 30 s), so "the agent is not
 * running a check" means nothing until at least one heartbeat has passed.
 */
export const CHECK_AGENT_IDLE_TRUST_MS = 40_000
/** A job still `queued` after this long is read less often… */
export const JOB_QUEUED_SLOWDOWN_MS = 120_000
/** …at this interval (the agent may be away; the lost-job pass takes 20 min). */
export const JOB_SLOW_POLL_MS = 5_000
/** Following a job stops after this long whatever happens (lost after 20 min without progress). */
export const JOB_POLL_LIMIT_MS = 30 * 60_000
/** Consecutive failed polls before giving up (a 403/404 does not heal). */
export const POLL_MAX_FAILURES = 5
/** Backoff after failures doubles the interval up to this. */
export const POLL_MAX_BACKOFF_MS = 30_000

/**
 * Web-driven LinuxGSM updates of a game server
 * (docs/gameserver-lgsm-updates-design.md §7–§8): the per-server overview,
 * the job an admin is watching, and the portal-managed MatchZy overrides.
 *
 * Polling is owned here so the modal only has to start and stop it: one
 * timer, never overlapping requests, stopped by `stopPolling()` (the modal
 * calls it when it closes or unmounts) or when the job reaches a terminal
 * status.
 */
export const useGameServerUpdatesStore = defineStore('gameServerUpdates', () => {
  /** Overviews by server id; the server list reads its badges from here. */
  const overviews = ref<Record<string, GameServerUpdates>>({})
  /** The job the modal is showing (progress or result). */
  const job = ref<UpdateJobResponse | null>(null)
  const overrides = ref<MatchzyOverrides | null>(null)
  /** The answer to the last overrides save: how it was delivered. */
  const overridesSave = ref<SetMatchzyOverridesResult | null>(null)
  /** A check was started and its result has not arrived yet. */
  const checking = ref(false)
  /** Why following a job stopped early (repeated errors, or the time cap). */
  const pollError = ref<string | null>(null)
  /** Why the last check produced no result (it failed, or never reported). */
  const checkError = ref<string | null>(null)
  /**
   * The server the modal has open, or null when it is closed. `job`,
   * `overrides` and every poll belong to it: a response for another server,
   * or one that lands after the modal closed or re-opened (a new session),
   * is dropped instead of being shown — or followed — in the wrong place.
   */
  const currentServerId = ref<string | null>(null)
  let session = 0

  /** Whether work begun in `sess` for `serverId` may still touch the modal's state. */
  function isCurrent(serverId: string, sess: number): boolean {
    return sess === session && currentServerId.value === serverId
  }

  const fetchUpdatesState = createActionState()
  const checkState = createActionState()
  const startState = createActionState()
  const repairState = createActionState()
  const fetchJobState = createActionState()
  const fetchOverridesState = createActionState()
  const saveOverridesState = createActionState()

  const { loading, error } = aggregateActionStates([
    fetchUpdatesState,
    checkState,
    startState,
    repairState,
    fetchJobState,
    fetchOverridesState,
    saveOverridesState,
  ])

  async function fetchUpdates(serverId: string): Promise<GameServerUpdates> {
    return withActionState(
      fetchUpdatesState,
      async () => {
        const result = await unwrapApi(
          api.GET('/v1/admin/game-servers/{server_id}/updates', {
            params: { path: { server_id: serverId } },
          }),
        )
        overviews.value = { ...overviews.value, [serverId]: result.data }
        return result.data
      },
      'Failed to load the update status',
    )
  }

  /**
   * Overviews for the server list's badges. Failures are swallowed per
   * server: a badge is a hint, and the modal reports errors properly.
   */
  async function fetchUpdatesQuietly(serverIds: string[], concurrency = 4): Promise<void> {
    const queue = [...serverIds]
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        try {
          const result = await unwrapApi(
            api.GET('/v1/admin/game-servers/{server_id}/updates', {
              params: { path: { server_id: id } },
            }),
          )
          overviews.value = { ...overviews.value, [id]: result.data }
        } catch {
          // Leave the server without a badge.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  }

  /** Ask the host for installed vs latest; the result lands in the overview. */
  async function checkNow(serverId: string): Promise<UpdateCheckStarted> {
    const sess = session
    return withActionState(
      checkState,
      async () => {
        const before = overviews.value[serverId]
        const since = before?.check?.checked_at ?? null
        const known = new Set((before?.recent_jobs ?? []).map((j) => j.id))
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/updates/check', {
            params: { path: { server_id: serverId } },
          }),
        )
        if (isCurrent(serverId, sess)) watchCheck(serverId, since, known)
        return result.data
      },
      'Failed to start the check',
    )
  }

  /**
   * Start an update. `force` only when the admin ticked "interrupt anyway";
   * a 409 without it carries the reasons in `detail`.
   */
  async function startUpdate(
    serverId: string,
    operation: StartUpdateOperation,
    force = false,
  ): Promise<UpdateJobResponse> {
    const sess = session
    return withActionState(
      startState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/updates', {
            params: { path: { server_id: serverId } },
            body: force ? { operation, force: true } : { operation },
          }),
        ).catch((e: unknown) => adoptUnansweredJob(serverId, sess, e))
        if (isCurrent(serverId, sess)) {
          job.value = result.data
          watchJob(serverId, result.data.id)
        }
        return result.data
      },
      'Failed to start the update',
    )
  }

  async function repairConfig(serverId: string): Promise<UpdateJobResponse> {
    const sess = session
    return withActionState(
      repairState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/updates/repair-config', {
            params: { path: { server_id: serverId } },
          }),
        ).catch((e: unknown) => adoptUnansweredJob(serverId, sess, e))
        if (isCurrent(serverId, sess)) {
          job.value = result.data
          watchJob(serverId, result.data.id)
        }
        return result.data
      },
      'Failed to start the config repair',
    )
  }

  /**
   * A 502 from a start means the agent did not answer: the job row stays
   * `queued` until the agent reports (or the lost-job pass gives up after
   * 20 minutes). Re-read the overview and, if a job is active, show and
   * follow it — while still raising the error so its `detail` is shown.
   */
  async function adoptUnansweredJob(serverId: string, sess: number, e: unknown): Promise<never> {
    if (e instanceof ApiError && e.status === 502 && isCurrent(serverId, sess)) {
      try {
        const overview = await fetchUpdates(serverId)
        const active = overview.active_job
        if (active && isCurrent(serverId, sess)) await openJob(serverId, active.id)
      } catch {
        // The start's own error is what the admin needs to see.
      }
    }
    throw e
  }

  async function fetchJob(serverId: string, jobId: string): Promise<UpdateJobResponse> {
    const sess = session
    return withActionState(
      fetchJobState,
      async () => {
        const result = await unwrapApi(
          api.GET('/v1/admin/game-servers/{server_id}/updates/{job_id}', {
            params: { path: { server_id: serverId, job_id: jobId } },
          }),
        )
        if (isCurrent(serverId, sess)) job.value = result.data
        return result.data
      },
      'Failed to load the update job',
    )
  }

  /** Open a job: load it, and follow it if it is still running. */
  async function openJob(serverId: string, jobId: string): Promise<UpdateJobResponse> {
    const sess = session
    if (isCurrent(serverId, sess)) stopPolling()
    const loaded = await fetchJob(serverId, jobId)
    if (isCurrent(serverId, sess) && !isTerminalStatus(loaded.status)) watchJob(serverId, jobId)
    return loaded
  }

  async function fetchOverrides(serverId: string): Promise<MatchzyOverrides> {
    const sess = session
    return withActionState(
      fetchOverridesState,
      async () => {
        const result = await unwrapApi(
          api.GET('/v1/admin/game-servers/{server_id}/matchzy-overrides', {
            params: { path: { server_id: serverId } },
          }),
        )
        if (isCurrent(serverId, sess)) overrides.value = result.data
        return result.data
      },
      'Failed to load the MatchZy overrides',
    )
  }

  async function saveOverrides(
    serverId: string,
    values: Record<string, string | number | boolean>,
  ): Promise<SetMatchzyOverridesResult> {
    const sess = session
    return withActionState(
      saveOverridesState,
      async () => {
        const result = await unwrapApi(
          api.PUT('/v1/admin/game-servers/{server_id}/matchzy-overrides', {
            params: { path: { server_id: serverId } },
            body: { overrides: values },
          }),
        )
        if (!isCurrent(serverId, sess)) return result.data
        overridesSave.value = result.data
        overrides.value = {
          overrides: result.data.overrides,
          applied: overrides.value?.applied ?? null,
          pending: result.data.delivery === 'pending',
        }
        // `applying` started a repair-config job: follow it. Its row exists
        // only once the agent sends its first progress, so a 404 is expected
        // at first.
        if (result.data.delivery === 'applying' && result.data.job_id) {
          watchJob(serverId, result.data.job_id, { awaitingFirstReport: true })
        }
        return result.data
      },
      'Failed to save the MatchZy overrides',
    )
  }

  // -------------------------------------------------------------------------
  // Polling: one chained timer, so a slow response never overlaps the next.
  // -------------------------------------------------------------------------

  let timer: ReturnType<typeof setTimeout> | null = null
  /** Bumped on every (re)start and stop; a stale tick sees a mismatch and quits. */
  let generation = 0

  interface PollOptions {
    /** The interval while things go well, given the time since the poll began. */
    interval: (elapsedMs: number) => number
    /** Stop after this long, whether requests succeed or not. */
    limitMs: number
    onLimit: () => void
    /** `POLL_MAX_FAILURES` requests in a row failed. */
    onGiveUp: (detail: string) => void
  }

  /**
   * Run `tick` until it returns false. Each run is scheduled after the
   * previous one finished. A tick that throws is retried with exponential
   * backoff and, after `POLL_MAX_FAILURES` in a row, the poll gives up.
   * While the tab is hidden nothing is fetched, but the time cap still runs.
   */
  function schedule(gen: number, tick: () => Promise<boolean>, opts: PollOptions) {
    const started = Date.now()
    let failures = 0
    const run = (delay: number) => {
      timer = setTimeout(async () => {
        timer = null
        if (gen !== generation) return
        const elapsed = Date.now() - started
        if (elapsed >= opts.limitMs) {
          opts.onLimit()
          return
        }
        if (typeof document !== 'undefined' && document.hidden) {
          run(opts.interval(elapsed))
          return
        }
        let again = true
        try {
          again = await tick()
          failures = 0
        } catch (e) {
          failures += 1
          if (failures >= POLL_MAX_FAILURES) {
            if (gen === generation) {
              opts.onGiveUp(e instanceof ApiError ? e.detail : 'the request failed')
            }
            return
          }
        }
        if (!again || gen !== generation) return
        const base = opts.interval(Date.now() - started)
        run(failures ? Math.min(base * 2 ** failures, POLL_MAX_BACKOFF_MS) : base)
      }, delay)
    }
    run(opts.interval(0))
  }

  /**
   * Follow a job every 2 s until it is terminal, then refresh the overview.
   * With `awaitingFirstReport` (a job the agent started on its own, e.g.
   * the repair after an overrides save) a 404 means "no row yet": the
   * overview's `active_job` is followed instead if there is one, otherwise
   * the 404 counts as a failure and is retried with backoff.
   */
  function watchJob(serverId: string, jobId: string, opts: { awaitingFirstReport?: boolean } = {}) {
    if (currentServerId.value !== serverId) return
    stopPolling()
    const gen = generation
    let queued = false
    let followed = jobId
    let seen = !opts.awaitingFirstReport
    const read = async () => {
      if (seen) return fetchJob(serverId, followed)
      try {
        const found = await fetchJob(serverId, followed)
        seen = true
        return found
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e
        const active = (await fetchUpdates(serverId)).active_job
        if (!active) throw e
        followed = active.id
        seen = true
        return fetchJob(serverId, followed)
      }
    }
    schedule(
      gen,
      async () => {
        const current = await read()
        queued = current.status === 'queued'
        if (!isTerminalStatus(current.status)) return true
        await fetchUpdates(serverId).catch(() => undefined)
        return false
      },
      {
        interval: (elapsed) =>
          queued && elapsed >= JOB_QUEUED_SLOWDOWN_MS ? JOB_SLOW_POLL_MS : JOB_POLL_MS,
        limitMs: JOB_POLL_LIMIT_MS,
        onLimit: () => {
          pollError.value = 'Stopped following the job after 30 minutes; reopen it to look again'
        },
        onGiveUp: (detail) => {
          pollError.value = seen
            ? `Stopped following the job: ${detail}`
            : 'The agent has not reported on the job yet; it will show under Jobs once it does'
        },
      },
    )
  }

  /**
   * After a check: re-read the overview every 2 s until
   *  - its `check.checked_at` moves past `since` (the result arrived), or
   *  - a `check` job not in `known` finishes (a failed check is recorded as
   *    a failed check job: its error is the answer), or
   *  - the agent reports no check in flight — trusted only once a heartbeat
   *    has had time to say so (`CHECK_AGENT_IDLE_TRUST_MS`), or
   *  - `CHECK_POLL_LIMIT_MS` passes.
   */
  function watchCheck(serverId: string, since: string | null, known: Set<string> = new Set()) {
    if (currentServerId.value !== serverId) return
    stopPolling()
    const gen = generation
    const started = Date.now()
    checking.value = true
    checkError.value = null
    const finish = (message: string | null) => {
      checking.value = false
      checkError.value = message
      return false
    }
    schedule(gen, async () => {
      const elapsed = Date.now() - started
      const overview = await fetchUpdates(serverId)
      const checkedAt = overview.check?.checked_at ?? null
      if (checkedAt !== null && (since === null || Date.parse(checkedAt) > Date.parse(since))) {
        return finish(null)
      }
      const checkJob = overview.recent_jobs.find(
        (j) => j.operation === 'check' && !known.has(j.id) && isTerminalStatus(j.status),
      )
      if (checkJob) {
        return finish(
          checkJob.status === 'succeeded' ? null : (checkJob.error ?? 'The check failed on the host'),
        )
      }
      if (elapsed >= CHECK_AGENT_IDLE_TRUST_MS && overview.agent_job?.operation !== 'check') {
        return finish('The host finished without reporting a result; try again')
      }
      return true
    }, {
      interval: () => JOB_POLL_MS,
      limitMs: CHECK_POLL_LIMIT_MS,
      onLimit: () => finish('No result from the host after 3 minutes'),
      onGiveUp: (detail) => finish(`Stopped waiting for the check: ${detail}`),
    })
  }

  function stopPolling() {
    generation += 1
    checking.value = false
    checkError.value = null
    pollError.value = null
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  /** The modal opened on `serverId`: a new session, nothing carried over. */
  function open(serverId: string) {
    reset()
    currentServerId.value = serverId
  }

  /** The modal closed: forget its job and overrides (overviews stay for badges). */
  function reset() {
    stopPolling()
    session += 1
    currentServerId.value = null
    job.value = null
    overrides.value = null
    overridesSave.value = null
  }

  return {
    overviews,
    job,
    overrides,
    overridesSave,
    checking,
    checkError,
    pollError,
    currentServerId,
    loading,
    error,
    fetchUpdatesState,
    checkState,
    startState,
    repairState,
    fetchJobState,
    fetchOverridesState,
    saveOverridesState,
    fetchUpdates,
    fetchUpdatesQuietly,
    checkNow,
    startUpdate,
    repairConfig,
    fetchJob,
    openJob,
    fetchOverrides,
    saveOverrides,
    stopPolling,
    open,
    reset,
  }
})

export type { MatchzyOverrides, SetMatchzyOverridesResult, UpdateCheckStarted }
