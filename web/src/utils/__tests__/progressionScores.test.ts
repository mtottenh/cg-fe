import { describe, it, expect } from 'vitest'
import { planProgressionScores, winsRequired, type PlanInput } from '@/utils/progressionScores'

function plan(overrides: Partial<PlanInput>) {
  return planProgressionScores({
    matchFormat: 'bo3',
    winnerIsParticipant1: true,
    winnerName: 'Alpha',
    loserName: 'Bravo',
    participant1Input: '',
    participant2Input: '',
    storedParticipant1: 0,
    storedParticipant2: 0,
    ...overrides,
  })
}

describe('winsRequired', () => {
  it('maps best-of formats to games needed', () => {
    expect(winsRequired('bo1')).toBe(1)
    expect(winsRequired('bo3')).toBe(2)
    expect(winsRequired('bo5')).toBe(3)
    expect(winsRequired('bo7')).toBe(4)
    expect(winsRequired('weird')).toBe(1)
    expect(winsRequired(undefined)).toBe(1)
  })
})

describe('planProgressionScores', () => {
  it('refuses a tied stored score with no input (unplayed / reverted forfeit)', () => {
    const p = plan({})
    expect(p.kind).toBe('invalid')
    expect(p.kind === 'invalid' && p.message).toMatch(/0–0 does not determine a winner/)
  })

  it('refuses a tied stored score re-entered unchanged', () => {
    expect(plan({ participant1Input: '0', participant2Input: '0' }).kind).toBe('invalid')
  })

  it('keeps a stored score that already favours the winner', () => {
    expect(plan({ storedParticipant1: 2, storedParticipant2: 1, participant1Input: '2', participant2Input: '1' }))
      .toEqual({ kind: 'stored', swap: false })
  })

  it('flags a stored score naming the other side as a swap', () => {
    expect(plan({ storedParticipant1: 1, storedParticipant2: 2, participant1Input: '1', participant2Input: '2' }))
      .toEqual({ kind: 'stored', swap: true })
    expect(plan({ storedParticipant1: 1, storedParticipant2: 2 })).toEqual({ kind: 'stored', swap: true })
  })

  it('accepts a finished series naming the winner', () => {
    expect(plan({ participant1Input: '2', participant2Input: '1' }))
      .toEqual({ kind: 'explicit', scores: { participant1Score: 2, participant2Score: 1 } })
    expect(plan({ winnerIsParticipant1: false, participant1Input: 0, participant2Input: 2 }))
      .toEqual({ kind: 'explicit', scores: { participant1Score: 0, participant2Score: 2 } })
    expect(plan({ matchFormat: 'bo1', participant1Input: '1', participant2Input: '0' }).kind).toBe('explicit')
  })

  it('requires both scores or neither', () => {
    const p = plan({ participant1Input: '2' })
    expect(p.kind === 'invalid' && p.message).toMatch(/both participants/)
  })

  it('rejects negative and fractional scores', () => {
    expect(plan({ participant1Input: '-1', participant2Input: '0' }).kind).toBe('invalid')
    expect(plan({ participant1Input: '1.5', participant2Input: '0' }).kind).toBe('invalid')
  })

  it('rejects a score where the selected winner has fewer games', () => {
    const p = plan({ participant1Input: '1', participant2Input: '2' })
    expect(p.kind === 'invalid' && p.message).toMatch(/Alpha is the selected winner/)
    expect(plan({ participant1Input: '1', participant2Input: '1' }).kind).toBe('invalid')
  })

  it('requires the winner to have exactly the wins for the best-of', () => {
    const short = plan({ participant1Input: '1', participant2Input: '0' })
    expect(short.kind === 'invalid' && short.message).toMatch(/Bo3 the winner must have exactly 2 games/)
    expect(plan({ participant1Input: '3', participant2Input: '0' }).kind).toBe('invalid')
    expect(plan({ matchFormat: 'bo5', participant1Input: '2', participant2Input: '1' }).kind).toBe('invalid')
    expect(plan({ matchFormat: 'bo1', participant1Input: '2', participant2Input: '0' }).kind).toBe('invalid')
  })
})
