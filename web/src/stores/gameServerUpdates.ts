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
    return withActionState(
      checkState,
      async () => {
        const since = overviews.value[serverId]?.check?.checked_at ?? null
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/updates/check', {
            params: { path: { server_id: serverId } },
          }),
        )
        watchCheck(serverId, since)
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
    return withActionState(
      startState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/updates', {
            params: { path: { server_id: serverId } },
            body: force ? { operation, force: true } : { operation },
          }),
        ).catch((e: unknown) => adoptUnansweredJob(serverId, e))
        job.value = result.data
        watchJob(serverId, result.data.id)
        return result.data
      },
      'Failed to start the update',
    )
  }

  async function repairConfig(serverId: string): Promise<UpdateJobResponse> {
    return withActionState(
      repairState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/updates/repair-config', {
            params: { path: { server_id: serverId } },
          }),
        ).catch((e: unknown) => adoptUnansweredJob(serverId, e))
        job.value = result.data
        watchJob(serverId, result.data.id)
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
  async function adoptUnansweredJob(serverId: string, e: unknown): Promise<never> {
    if (e instanceof ApiError && e.status === 502) {
      try {
        const overview = await fetchUpdates(serverId)
        const active = overview.active_job
        if (active) {
          await fetchJob(serverId, active.id)
          watchJob(serverId, active.id)
        }
      } catch {
        // The start's own error is what the admin needs to see.
      }
    }
    throw e
  }

  async function fetchJob(serverId: string, jobId: string): Promise<UpdateJobResponse> {
    return withActionState(
      fetchJobState,
      async () => {
        const result = await unwrapApi(
          api.GET('/v1/admin/game-servers/{server_id}/updates/{job_id}', {
            params: { path: { server_id: serverId, job_id: jobId } },
          }),
        )
        job.value = result.data
        return result.data
      },
      'Failed to load the update job',
    )
  }

  /** Open a job: load it, and follow it if it is still running. */
  async function openJob(serverId: string, jobId: string): Promise<UpdateJobResponse> {
    stopPolling()
    const loaded = await fetchJob(serverId, jobId)
    if (!isTerminalStatus(loaded.status)) watchJob(serverId, jobId)
    return loaded
  }

  async function fetchOverrides(serverId: string): Promise<MatchzyOverrides> {
    return withActionState(
      fetchOverridesState,
      async () => {
        const result = await unwrapApi(
          api.GET('/v1/admin/game-servers/{server_id}/matchzy-overrides', {
            params: { path: { server_id: serverId } },
          }),
        )
        overrides.value = result.data
        return result.data
      },
      'Failed to load the MatchZy overrides',
    )
  }

  async function saveOverrides(
    serverId: string,
    values: Record<string, string | number | boolean>,
  ): Promise<SetMatchzyOverridesResult> {
    return withActionState(
      saveOverridesState,
      async () => {
        const result = await unwrapApi(
          api.PUT('/v1/admin/game-servers/{server_id}/matchzy-overrides', {
            params: { path: { server_id: serverId } },
            body: { overrides: values },
          }),
        )
        overridesSave.value = result.data
        overrides.value = {
          overrides: result.data.overrides,
          applied: overrides.value?.applied ?? null,
          pending: result.data.delivery === 'pending',
        }
        // `applying` started a repair-config job: follow it.
        if (result.data.delivery === 'applying' && result.data.job_id) {
          void openJob(serverId, result.data.job_id).catch(() => undefined)
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

  function schedule(gen: number, tick: () => Promise<boolean>) {
    timer = setTimeout(async () => {
      timer = null
      if (gen !== generation) return
      let again = true
      try {
        again = await tick()
      } catch {
        // A failed poll is retried on the next tick; the action state
        // already carries the error for the UI.
      }
      if (again && gen === generation) schedule(gen, tick)
    }, JOB_POLL_MS)
  }

  /** Follow a job every 2 s until it is terminal, then refresh the overview. */
  function watchJob(serverId: string, jobId: string) {
    stopPolling()
    const gen = generation
    schedule(gen, async () => {
      const current = await fetchJob(serverId, jobId)
      if (!isTerminalStatus(current.status)) return true
      await fetchUpdates(serverId).catch(() => undefined)
      return false
    })
  }

  /**
   * After a check: re-read the overview every 2 s until its `check` is
   * newer than `since` (or the agent no longer reports a check in flight
   * and nothing changed after a few ticks), with an upper bound.
   */
  function watchCheck(serverId: string, since: string | null) {
    stopPolling()
    const gen = generation
    const started = Date.now()
    let ticks = 0
    checking.value = true
    schedule(gen, async () => {
      ticks += 1
      const overview = await fetchUpdates(serverId)
      const checkedAt = overview.check?.checked_at ?? null
      const arrived = checkedAt !== null && checkedAt !== since
      const agentIdle = overview.agent_job?.operation !== 'check'
      const done =
        arrived || (agentIdle && ticks >= 3) || Date.now() - started > CHECK_POLL_LIMIT_MS
      if (done) checking.value = false
      return !done
    })
  }

  function stopPolling() {
    generation += 1
    checking.value = false
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  /** Forget the job and overrides the modal showed (overviews stay for badges). */
  function reset() {
    stopPolling()
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
    reset,
  }
})

export type { MatchzyOverrides, SetMatchzyOverridesResult, UpdateCheckStarted }
