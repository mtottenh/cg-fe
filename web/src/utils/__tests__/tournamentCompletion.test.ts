import { describe, it, expect } from 'vitest'
import { completeTournamentPrompt, completionReadiness } from '@/utils/tournamentCompletion'

const m = (status: string, tournament_id = 't1') => ({ status, tournament_id })

describe('completionReadiness', () => {
  it('counts every match that can still be played as unfinished', () => {
    const r = completionReadiness(
      [m('completed'), m('forfeit'), m('cancelled'), m('ready'), m('scheduled'), m('in_progress'), m('awaiting_result'), m('disputed')],
      't1',
    )
    expect(r).toEqual({ total: 8, unfinished: 5, allFinished: false })
  })

  it('is finished only when there are matches and all are settled', () => {
    expect(completionReadiness([m('completed'), m('forfeit'), m('cancelled')], 't1').allFinished).toBe(true)
    expect(completionReadiness([], 't1').allFinished).toBe(false)
  })

  it("ignores another tournament's matches left in the store", () => {
    expect(completionReadiness([m('ready', 't2'), m('completed')], 't1')).toEqual({
      total: 1,
      unfinished: 0,
      allFinished: true,
    })
  })
})

describe('completeTournamentPrompt', () => {
  it('warns, with the count, when matches remain', () => {
    const p = completeTournamentPrompt({ total: 10, unfinished: 3, allFinished: false })
    expect(p.color).toBe('error')
    expect(p.message).toContain('3 of 10 matches have not been played')
    expect(p.message).toContain('cannot be undone')
    expect(p.action).toBe('Complete with 3 unfinished')
  })

  it('asks plainly when everything is finished', () => {
    const p = completeTournamentPrompt({ total: 10, unfinished: 0, allFinished: true })
    expect(p.color).toBe('warning')
    expect(p.message).toContain('All 10 matches are finished')
    expect(p.action).toBe('Complete')
  })
})
