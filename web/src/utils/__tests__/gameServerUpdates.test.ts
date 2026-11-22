import { describe, expect, it } from 'vitest'
import {
  anyUpdateAvailable,
  buildUpdatePlan,
  isTerminalStatus,
  phaseLabel,
  phaseSteps,
  restartsServer,
  type GameServerUpdates,
  type PhaseStep,
} from '@/utils/gameServerUpdates'

function states(steps: PhaseStep[]): string {
  return steps.map((s) => `${s.phase}:${s.state}`).join(' ')
}

describe('status helpers', () => {
  it('only queued and running are in flight', () => {
    expect(isTerminalStatus('queued')).toBe(false)
    expect(isTerminalStatus('running')).toBe(false)
    for (const s of ['succeeded', 'failed', 'rolled_back', 'lost'] as const) {
      expect(isTerminalStatus(s)).toBe(true)
    }
  })

  it('lgsm, check and repair-config do not restart CS2', () => {
    expect(restartsServer('lgsm')).toBe(false)
    expect(restartsServer('check')).toBe(false)
    expect(restartsServer('repair-config')).toBe(false)
    expect(restartsServer('game')).toBe(true)
    expect(restartsServer('mods')).toBe(true)
    expect(restartsServer('all')).toBe(true)
  })

  it('labels unknown phases with the raw name', () => {
    expect(phaseLabel('mods-update')).toBe('Updating plugins')
    expect(phaseLabel('future-phase')).toBe('future-phase')
    expect(phaseLabel(null)).toBe('—')
  })
})

describe('phaseSteps', () => {
  it('marks a running lgsm job at its phase', () => {
    expect(states(phaseSteps({ operation: 'lgsm', status: 'running', phase: 'lgsm-update' }))).toBe(
      'starting:complete init:complete lgsm-update:active done:pending',
    )
  })

  it('a queued job with no phase is all pending', () => {
    const steps = phaseSteps({ operation: 'repair-config', status: 'queued', phase: null })
    expect(steps.every((s) => s.state === 'pending')).toBe(true)
  })

  it('a succeeded job is complete throughout', () => {
    const steps = phaseSteps({ operation: 'mods', status: 'succeeded', phase: 'done' })
    expect(steps.every((s) => s.state === 'complete')).toBe(true)
    expect(steps[steps.length - 1]?.phase).toBe('done')
  })

  it('a failed job marks the phase that broke and skips the rest', () => {
    expect(
      states(
        phaseSteps({ operation: 'game', status: 'failed', phase: 'verify', failed_phase: 'game-update' }),
      ),
    ).toBe(
      'starting:complete init:complete game-update:error gameinfo:skipped restart:skipped verify:skipped done:skipped',
    )
  })

  it('a lost job without failed_phase breaks at its last phase', () => {
    const steps = phaseSteps({ operation: 'lgsm', status: 'lost', phase: 'lgsm-update' })
    expect(steps.find((s) => s.phase === 'lgsm-update')?.state).toBe('error')
  })

  it('a rolled-back job ends in a completed rollback instead of done', () => {
    expect(
      states(
        phaseSteps({ operation: 'mods', status: 'rolled_back', phase: 'rollback', failed_phase: 'verify' }),
      ),
    ).toBe(
      'starting:complete init:complete snapshot:complete stop:complete mods-update:complete ' +
        'reconcile-config:complete gameinfo:complete start:complete verify:error record:skipped rollback:complete',
    )
  })

  it('a running rollback is shown as the active step', () => {
    const steps = phaseSteps({ operation: 'mods', status: 'running', phase: 'rollback' })
    expect(steps[steps.length - 2]).toMatchObject({ phase: 'rollback', state: 'active' })
    expect(steps[steps.length - 1]).toMatchObject({ phase: 'done', state: 'pending' })
  })

  it('keeps a phase the plan does not know, before done', () => {
    const steps = phaseSteps({ operation: 'lgsm', status: 'running', phase: 'something-new' })
    expect(steps.map((s) => s.phase)).toEqual(['starting', 'init', 'lgsm-update', 'something-new', 'done'])
    expect(steps[3]?.state).toBe('active')
  })
})

function updates(overrides: Partial<GameServerUpdates> = {}): GameServerUpdates {
  return {
    server_id: 's',
    agent_connected: true,
    supported: true,
    capabilities: ['lgsm_update'],
    installed: { lgsm: 'v26.5.0', cs2_build: '100', metamod: null, cssharp: '1.0.379', matchzy: '0.9.3' },
    check: {
      checked_at: '2026-11-22T10:00:00Z',
      latest: { lgsm: 'v26.6.0', cs2_build: '100', metamod: '2.0.0-git1491', cssharp: '1.0.380', matchzy: '0.9.3' },
      update_available: { lgsm: true, game: false, metamod: null, cssharp: true, matchzy: false, mods: true },
    },
    reload_pending: false,
    recent_jobs: [],
    safety: {
      humans_connected: 3,
      players: ['a', 'b', 'c'],
      reservation: null,
      bookings: [],
      restart_needs_force: true,
      reasons: ['3 players connected'],
    },
    ...overrides,
  }
}

describe('buildUpdatePlan', () => {
  it('lgsm: one change, no restart, so no force even with players on', () => {
    const plan = buildUpdatePlan(updates(), 'lgsm')
    expect(plan.changes).toEqual([
      { label: 'LinuxGSM', installed: 'v26.5.0', latest: 'v26.6.0', available: true },
    ])
    expect(plan.restarts).toBe(false)
    expect(plan.needsForce).toBe(false)
    expect(plan.reasons).toEqual([])
    expect(plan.players).toEqual(['a', 'b', 'c'])
  })

  it('mods: the three plugins, restart, force needed with the reasons', () => {
    const plan = buildUpdatePlan(updates(), 'mods')
    expect(plan.changes.map((c) => c.label)).toEqual(['Metamod', 'CounterStrikeSharp', 'MatchZy'])
    expect(plan.changes[0]).toMatchObject({ installed: null, latest: '2.0.0-git1491', available: null })
    expect(plan.restarts).toBe(true)
    expect(plan.needsForce).toBe(true)
    expect(plan.reasons).toEqual(['3 players connected'])
  })

  it('all: every component', () => {
    expect(buildUpdatePlan(updates(), 'all').changes).toHaveLength(5)
  })

  it('no force when nothing would be interrupted', () => {
    const safe = updates({
      safety: { humans_connected: 0, players: [], bookings: [], restart_needs_force: false, reasons: [] },
    })
    expect(buildUpdatePlan(safe, 'game').needsForce).toBe(false)
  })

  it('works before the first check', () => {
    const plan = buildUpdatePlan(updates({ check: null, installed: null }), 'game')
    expect(plan.changes).toEqual([{ label: 'CS2 build', installed: null, latest: null, available: null }])
  })
})

describe('anyUpdateAvailable', () => {
  it('is false without a check and true when any component is out of date', () => {
    expect(anyUpdateAvailable({ check: null })).toBe(false)
    expect(anyUpdateAvailable(updates())).toBe(true)
    expect(
      anyUpdateAvailable({
        check: { latest: {}, update_available: { lgsm: false, game: null } },
      }),
    ).toBe(false)
  })
})
