import type { components } from '@/api/types'
import type { StatusMap } from '@/utils/statusMaps'

type S = components['schemas']

export type UpdateOperation = S['UpdateOperation']
export type StartUpdateOperation = S['StartUpdateOperation']
export type UpdateJobStatus = S['UpdateJobStatus']
export type UpdateJobTrigger = S['UpdateJobTrigger']
export type UpdateVersions = S['UpdateVersions']
export type UpdateSafety = S['UpdateSafety']
export type UpdateJobSummary = S['UpdateJobSummary']
export type UpdateJobResponse = S['UpdateJobResponse']
export type GameServerUpdates = S['GameServerUpdatesResponse']
export type OverridesDelivery = S['OverridesDelivery']

/**
 * Game-server updates through LinuxGSM (docs/gameserver-lgsm-updates-design.md
 * §8): the presentation rules the Updates modal and the server list share.
 */

export const updateJobStatusMap: StatusMap<UpdateJobStatus> = {
  queued: { color: 'grey', label: 'Queued', icon: 'mdi-timer-sand' },
  running: { color: 'info', label: 'Running', icon: 'mdi-progress-wrench' },
  succeeded: { color: 'success', label: 'Succeeded', icon: 'mdi-check-circle' },
  failed: { color: 'error', label: 'Failed', icon: 'mdi-alert-octagon' },
  rolled_back: { color: 'warning', label: 'Rolled back', icon: 'mdi-undo-variant' },
  lost: { color: 'error', label: 'Lost', icon: 'mdi-help-circle' },
}

export const updateOperationMap: StatusMap<UpdateOperation> = {
  lgsm: { color: 'default', label: 'LinuxGSM', icon: 'mdi-console-line' },
  game: { color: 'default', label: 'CS2 server', icon: 'mdi-controller' },
  mods: { color: 'default', label: 'Plugins', icon: 'mdi-puzzle' },
  all: { color: 'default', label: 'Everything', icon: 'mdi-update' },
  'repair-config': { color: 'default', label: 'Repair config', icon: 'mdi-wrench' },
  check: { color: 'default', label: 'Check', icon: 'mdi-magnify' },
}

export const updateTriggerMap: StatusMap<UpdateJobTrigger> = {
  portal: { color: 'default', label: 'Portal', icon: 'mdi-account' },
  overrides: { color: 'default', label: 'Overrides saved', icon: 'mdi-tune' },
  auto_repair: { color: 'default', label: 'Auto-repair', icon: 'mdi-robot' },
  local: { color: 'default', label: 'On the host', icon: 'mdi-server' },
}

export const overridesDeliveryMap: StatusMap<OverridesDelivery> = {
  applying: { color: 'info', label: 'Applying now', icon: 'mdi-progress-wrench' },
  written: { color: 'warning', label: 'Written; applied by the next update', icon: 'mdi-content-save' },
  pending: { color: 'warning', label: 'Pending; sent when the agent connects', icon: 'mdi-timer-sand' },
}

/** Statuses after which a job never changes again. */
export function isTerminalStatus(status: UpdateJobStatus): boolean {
  return status !== 'queued' && status !== 'running'
}

/** Whether an operation restarts CS2 (lgsm, check and repair-config do not). */
export function restartsServer(operation: UpdateOperation): boolean {
  return operation === 'game' || operation === 'mods' || operation === 'all'
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/** Every phase the agent or the helper reports (agent README "Protocol"). */
export const PHASE_LABELS: Record<string, string> = {
  starting: 'Starting',
  init: 'Preparing',
  check: 'Checking versions',
  'lgsm-update': 'Updating LinuxGSM',
  snapshot: 'Snapshotting plugins',
  stop: 'Stopping CS2',
  'game-update': 'Updating CS2',
  'mods-update': 'Updating plugins',
  'reconcile-config': 'Reconciling config',
  gameinfo: 'Patching gameinfo',
  start: 'Starting CS2',
  restart: 'Restarting CS2',
  verify: 'Verifying plugins load',
  rollback: 'Rolling back',
  record: 'Recording versions',
  done: 'Done',
}

export function phaseLabel(phase: string | null | undefined): string {
  if (!phase) return '—'
  return PHASE_LABELS[phase] ?? phase
}

/**
 * The phases an operation normally walks through, in order, as the helper
 * (`portal-gs-update`) runs them. `game` skips `restart`/`verify` when the
 * build did not change; the stepper simply never reaches them.
 */
const PHASE_PLANS: Record<UpdateOperation, string[]> = {
  check: ['starting', 'init', 'check', 'done'],
  lgsm: ['starting', 'init', 'lgsm-update', 'done'],
  game: ['starting', 'init', 'game-update', 'gameinfo', 'restart', 'verify', 'done'],
  mods: [
    'starting', 'init', 'snapshot', 'stop', 'mods-update', 'reconcile-config',
    'gameinfo', 'start', 'verify', 'record', 'done',
  ],
  all: [
    'starting', 'init', 'lgsm-update', 'snapshot', 'stop', 'game-update', 'mods-update',
    'reconcile-config', 'gameinfo', 'start', 'verify', 'record', 'done',
  ],
  'repair-config': ['starting', 'init', 'reconcile-config', 'done'],
}

export type PhaseState = 'complete' | 'active' | 'pending' | 'error' | 'skipped'

export interface PhaseStep {
  phase: string
  label: string
  state: PhaseState
}

/**
 * The stepper for a job: its operation's plan, with the reported phase
 * placed in it. A phase the plan does not name (an older or newer helper)
 * is inserted before `done` rather than dropped. Outcomes:
 *  - running: everything before the phase complete, the phase active;
 *  - succeeded: all complete;
 *  - failed / lost: the phase that broke is the error, later ones skipped;
 *  - rolled_back: the phase that triggered it is the error, then a
 *    completed `rollback` step in place of `done`.
 */
export function phaseSteps(
  job: Pick<UpdateJobSummary, 'operation' | 'status' | 'phase' | 'failed_phase'>,
): PhaseStep[] {
  const plan = [...PHASE_PLANS[job.operation]]
  const insert = (phase: string | null | undefined) => {
    if (!phase || plan.includes(phase)) return
    plan.splice(plan.length - 1, 0, phase)
  }

  if (job.status === 'rolled_back') {
    plan.pop() // no `done`
    const broke = job.failed_phase ?? null
    if (broke && broke !== 'rollback' && !plan.includes(broke)) plan.push(broke)
    if (!plan.includes('rollback')) plan.push('rollback')
    const brokeAt = broke ? plan.indexOf(broke) : -1
    const rollbackAt = plan.indexOf('rollback')
    return plan.map((phase, i) => ({
      phase,
      label: phaseLabel(phase),
      state:
        phase === 'rollback'
          ? 'complete'
          : i === brokeAt
            ? 'error'
            : brokeAt >= 0 && i > brokeAt && i < rollbackAt
              ? 'skipped'
              : 'complete',
    }))
  }

  if (job.status === 'succeeded') {
    return plan.map((phase) => ({ phase, label: phaseLabel(phase), state: 'complete' }))
  }

  if (job.status === 'failed' || job.status === 'lost') {
    const broke = job.failed_phase ?? (job.phase !== 'done' ? job.phase : null) ?? null
    insert(broke)
    if (job.phase === 'rollback') insert('rollback')
    const brokeAt = broke ? plan.indexOf(broke) : -1
    return plan.map((phase, i) => ({
      phase,
      label: phaseLabel(phase),
      state:
        brokeAt < 0
          ? 'pending'
          : i < brokeAt
            ? 'complete'
            : i === brokeAt
              ? 'error'
              : phase === 'rollback' && job.phase === 'rollback'
                ? 'error'
                : 'skipped',
    }))
  }

  // queued / running
  const current = job.phase ?? (job.status === 'queued' ? null : 'starting')
  if (current === 'rollback') plan.splice(plan.length - 1, 0, 'rollback')
  else insert(current)
  const at = current ? plan.indexOf(current) : -1
  return plan.map((phase, i) => ({
    phase,
    label: phaseLabel(phase),
    state: at < 0 ? 'pending' : i < at ? 'complete' : i === at ? 'active' : 'pending',
  }))
}

// ---------------------------------------------------------------------------
// The plan shown before an update starts
// ---------------------------------------------------------------------------

export interface PlanChange {
  label: string
  installed: string | null
  latest: string | null
  /** true / false when known; null when the versions could not be compared. */
  available: boolean | null
}

export interface UpdatePlan {
  operation: StartUpdateOperation
  title: string
  changes: PlanChange[]
  restarts: boolean
  /** The restart would interrupt something: the start must be forced. */
  needsForce: boolean
  reasons: string[]
  players: string[]
  humansConnected: number | null
  reservation: UpdateSafety['reservation']
  bookings: UpdateSafety['bookings']
}

const COMPONENTS: Array<{
  key: keyof UpdateVersions
  availability: 'lgsm' | 'game' | 'metamod' | 'cssharp' | 'matchzy'
  label: string
  ops: StartUpdateOperation[]
}> = [
  { key: 'lgsm', availability: 'lgsm', label: 'LinuxGSM', ops: ['lgsm', 'all'] },
  { key: 'cs2_build', availability: 'game', label: 'CS2 build', ops: ['game', 'all'] },
  { key: 'metamod', availability: 'metamod', label: 'Metamod', ops: ['mods', 'all'] },
  { key: 'cssharp', availability: 'cssharp', label: 'CounterStrikeSharp', ops: ['mods', 'all'] },
  { key: 'matchzy', availability: 'matchzy', label: 'MatchZy', ops: ['mods', 'all'] },
]

const PLAN_TITLES: Record<StartUpdateOperation, string> = {
  lgsm: 'Update LinuxGSM',
  game: 'Update the CS2 server',
  mods: 'Update the plugins',
  all: 'Update everything',
}

/** What starting `operation` would do, from the overview the modal holds. */
export function buildUpdatePlan(
  updates: Pick<GameServerUpdates, 'installed' | 'check' | 'safety'>,
  operation: StartUpdateOperation,
): UpdatePlan {
  const restarts = restartsServer(operation)
  const latest = updates.check?.latest
  const available = updates.check?.update_available
  const changes = COMPONENTS.filter((c) => c.ops.includes(operation)).map((c) => ({
    label: c.label,
    installed: updates.installed?.[c.key] ?? null,
    latest: latest?.[c.key] ?? null,
    available: available?.[c.availability] ?? null,
  }))
  const safety = updates.safety
  return {
    operation,
    title: PLAN_TITLES[operation],
    changes,
    restarts,
    needsForce: restarts && safety.restart_needs_force,
    reasons: restarts ? safety.reasons : [],
    players: safety.players,
    humansConnected: safety.humans_connected ?? null,
    reservation: safety.reservation ?? null,
    bookings: safety.bookings,
  }
}

/** Whether the overview says anything is out of date. */
export function anyUpdateAvailable(updates: Pick<GameServerUpdates, 'check'>): boolean {
  const a = updates.check?.update_available
  if (!a) return false
  return Boolean(a.lgsm || a.game || a.mods || a.metamod || a.cssharp || a.matchzy)
}
