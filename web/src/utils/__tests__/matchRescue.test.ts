import { describe, it, expect, vi } from 'vitest'
import {
  bumpDeadline, checkInWindowLabel, describeRelative, isLiveReservation, mergeGameServerSettings,
  readGameServerSettings, runGuidedReopen, stuckHint, suggestedActionCopy, toolState,
  type RescueTool,
} from '@/utils/matchRescue'

const ALL_STATUSES = [
  'pending', 'ready', 'scheduled', 'checking_in', 'pick_ban', 'in_progress',
  'awaiting_result', 'completed', 'cancelled', 'forfeit', 'disputed',
]

/** The statuses each tool is offered in; everything else must be disabled with a reason. */
const ENABLED_IN: Record<RescueTool, string[]> = {
  set_time: ['ready', 'scheduled'],
  check_in_window: ['ready', 'scheduled', 'checking_in'],
  check_in_team: ['checking_in'],
  start_veto: ['checking_in'],
  skip_veto: ['pick_ban'],
  reset_veto: ['checking_in', 'pick_ban', 'in_progress'],
  reset: ['scheduled', 'checking_in', 'pick_ban', 'in_progress', 'awaiting_result', 'forfeit', 'cancelled', 'disputed'],
  reopen: ['forfeit', 'cancelled'],
  retry_completion: ['completed', 'forfeit'],
}

describe('toolState', () => {
  for (const [tool, enabledIn] of Object.entries(ENABLED_IN) as [RescueTool, string[]][]) {
    it(`${tool} is offered exactly in: ${enabledIn.join(', ')}`, () => {
      for (const status of ALL_STATUSES) {
        const state = toolState(tool, status)
        expect(state.enabled, `${tool} in ${status}`).toBe(enabledIn.includes(status))
        // A disabled tool always says why; an enabled one has nothing to explain.
        if (state.enabled) expect(state.why).toBeNull()
        else expect(state.why, `${tool} in ${status}`).toBeTruthy()
      }
    })
  }

  it('points a decided match at the guided reopen instead of the bare window tool', () => {
    expect(toolState('check_in_window', 'forfeit').why).toContain('Reopen match and check-in')
    expect(toolState('check_in_window', 'cancelled').why).toContain('Reopen match and check-in')
  })

  it('tells the admin where a completed match is corrected instead of reset', () => {
    expect(toolState('reset', 'completed').why).toContain('Results tab')
  })
})

describe('suggestedActionCopy', () => {
  it('has a button for every action the diagnostics endpoint can suggest', () => {
    const actions = [
      'set_time', 'extend_checkin', 'reset_veto', 'reset', 'assign_server',
      'reload_server', 'clear_server', 'roster_check', 'retry_completion', 'set_result',
    ]
    for (const action of actions) {
      const copy = suggestedActionCopy(action)
      expect(copy, action).not.toBeNull()
      expect(copy!.action).toBe(action)
      expect(copy!.label).toBeTruthy()
    }
    expect(new Set(actions.map((a) => suggestedActionCopy(a)!.label)).size).toBe(actions.length)
  })

  it('gives an unknown action no button rather than one that cannot act', () => {
    expect(suggestedActionCopy('teleport_players')).toBeNull()
  })
})

describe('check-in deadline arithmetic', () => {
  const now = new Date('2032-04-17T19:00:00Z')

  it('counts from now when there is no deadline or it has expired', () => {
    expect(bumpDeadline(null, 20, now).toISOString()).toBe('2032-04-17T19:20:00.000Z')
    expect(bumpDeadline('2032-04-17T18:30:00Z', 10, now).toISOString()).toBe('2032-04-17T19:10:00.000Z')
  })

  it('adds to a deadline that still has time left', () => {
    expect(bumpDeadline('2032-04-17T19:05:00Z', 30, now).toISOString()).toBe('2032-04-17T19:35:00.000Z')
  })

  it('describes a deadline relative to now', () => {
    expect(describeRelative('2032-04-17T19:08:00Z', now)).toBe('in 8 min')
    expect(describeRelative('2032-04-17T18:48:00Z', now)).toBe('expired 12 min ago')
    expect(describeRelative('2032-04-17T15:00:00Z', now)).toBe('expired 4 h ago')
    expect(describeRelative(null, now)).toBe('')
  })

  it('labels the window tool by whether a window is already open', () => {
    expect(checkInWindowLabel('checking_in')).toBe('Extend check-in')
    expect(checkInWindowLabel('ready')).toBe('Open check-in now')
    expect(checkInWindowLabel('scheduled')).toBe('Open check-in now')
  })
})

describe('stuckHint', () => {
  const now = new Date('2032-04-17T19:00:00Z')

  it('flags a scheduled match with no time', () => {
    expect(stuckHint({ status: 'scheduled', scheduled_at: null }, now)?.severity).toBe('warning')
    expect(stuckHint({ status: 'scheduled', scheduled_at: '2032-04-18T19:00:00Z' }, now)).toBeNull()
  })

  it('flags an expired check-in window only when the row carries a deadline', () => {
    expect(stuckHint({ status: 'checking_in', check_in_deadline: '2032-04-17T18:50:00Z' }, now)?.label)
      .toContain('expired')
    expect(stuckHint({ status: 'checking_in', check_in_deadline: '2032-04-17T19:10:00Z' }, now)).toBeNull()
    expect(stuckHint({ status: 'checking_in' }, now)).toBeNull()
  })

  it('offers the rescue tools on forfeited and cancelled matches without alarm', () => {
    expect(stuckHint({ status: 'forfeit' }, now)?.severity).toBe('info')
    expect(stuckHint({ status: 'cancelled' }, now)?.severity).toBe('info')
  })

  it('leaves healthy matches alone', () => {
    for (const status of ['pending', 'ready', 'pick_ban', 'in_progress', 'awaiting_result', 'completed']) {
      expect(stuckHint({ status }, now), status).toBeNull()
    }
  })
})

describe('runGuidedReopen', () => {
  it('resets first, then opens check-in', async () => {
    const calls: string[] = []
    const result = await runGuidedReopen({
      reset: async () => { calls.push('reset') },
      openCheckIn: async () => { calls.push('check_in') },
    })
    expect(calls).toEqual(['reset', 'check_in'])
    expect(result).toMatchObject({ ok: true, failedStep: null })
  })

  it('does not open check-in when the reset is refused, and says nothing changed', async () => {
    const openCheckIn = vi.fn()
    const result = await runGuidedReopen({
      reset: async () => { throw new Error('Match has an open dispute') },
      openCheckIn,
    })
    expect(openCheckIn).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.failedStep).toBe('reset')
    expect(result.message).toContain('Nothing was changed')
    expect(result.message).toContain('Match has an open dispute')
  })

  it('reports a half-done reopen as reset-but-not-open, with the next step', async () => {
    const result = await runGuidedReopen({
      reset: async () => undefined,
      openCheckIn: async () => { throw new Error('Deadline must be in the future') },
    })
    expect(result.ok).toBe(false)
    expect(result.failedStep).toBe('check_in_window')
    expect(result.message).toContain('The match was reset to Ready')
    expect(result.message).toContain('Deadline must be in the future')
    expect(result.message).toContain('Open check-in now')
  })
})

describe('game server settings', () => {
  it('reads the card fields, treating anything but true as off', () => {
    expect(readGameServerSettings({ game_server: { enabled: true, auto_confirm_minutes: 15 } }))
      .toEqual({ enabled: true, autoConfirmMinutes: 15, minPlayersToReady: null })
    expect(readGameServerSettings({ side_selection_mode: 'knife' }))
      .toEqual({ enabled: false, autoConfirmMinutes: null, minPlayersToReady: null })
    expect(readGameServerSettings(null).enabled).toBe(false)
    expect(readGameServerSettings({ game_server: { enabled: 'yes' } }).enabled).toBe(false)
  })

  it('changes only its own keys, keeping every other setting', () => {
    const stored = {
      side_selection_mode: 'picker_choice',
      eligibility: { min_rating_per_player: 1000 },
      game_server: { enabled: false, region: 'eu', cvars: { mp_overtime_enable: '1' }, min_players_to_ready: 4 },
    }
    const merged = mergeGameServerSettings(stored, { enabled: true, autoConfirmMinutes: 30, minPlayersToReady: null })
    expect(merged).toEqual({
      side_selection_mode: 'picker_choice',
      eligibility: { min_rating_per_player: 1000 },
      game_server: { enabled: true, region: 'eu', cvars: { mp_overtime_enable: '1' }, auto_confirm_minutes: 30 },
    })
    // The stored object is not mutated.
    expect(stored.game_server.enabled).toBe(false)
    expect(stored.game_server.min_players_to_ready).toBe(4)
  })

  it('creates the game_server block when the tournament has none', () => {
    expect(mergeGameServerSettings({ side_selection_mode: 'knife' }, { enabled: true, autoConfirmMinutes: null, minPlayersToReady: null }))
      .toEqual({ side_selection_mode: 'knife', game_server: { enabled: true } })
  })
})

describe('isLiveReservation', () => {
  it('is true only while the reservation holds or waits for a server', () => {
    for (const s of ['pending', 'configuring', 'ready', 'live']) expect(isLiveReservation(s)).toBe(true)
    for (const s of ['completed', 'failed', 'cancelled', null, undefined]) expect(isLiveReservation(s)).toBe(false)
  })
})
