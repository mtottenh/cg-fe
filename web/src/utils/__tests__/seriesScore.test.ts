import { describe, it, expect } from 'vitest'
import { seriesScoreProblem, winsRequired } from '@/utils/seriesScore'

describe('winsRequired', () => {
  it('maps each best-of to the wins that end it', () => {
    expect(winsRequired('bo1')).toBe(1)
    expect(winsRequired('bo3')).toBe(2)
    expect(winsRequired('bo5')).toBe(3)
    expect(winsRequired('bo7')).toBe(4)
  })

  it('does not guess at a format it does not know', () => {
    expect(winsRequired('bo2')).toBeNull()
    expect(winsRequired('round_robin')).toBeNull()
    expect(winsRequired(undefined)).toBeNull()
  })
})

describe('seriesScoreProblem', () => {
  it('accepts every way a series can end, for either side', () => {
    expect(seriesScoreProblem('bo1', 1, 0)).toBeNull()
    expect(seriesScoreProblem('bo3', 2, 0)).toBeNull()
    expect(seriesScoreProblem('bo3', 1, 2)).toBeNull()
    expect(seriesScoreProblem('bo5', 3, 2)).toBeNull()
  })

  it('refuses the scores the API refuses', () => {
    expect(seriesScoreProblem('bo3', 3, 0)).toContain('not a finished Bo3 series')
    expect(seriesScoreProblem('bo3', 1, 0)).toContain('2–0, 2–1')
    expect(seriesScoreProblem('bo3', 2, 2)).not.toBeNull()
    expect(seriesScoreProblem('bo5', 2, 1)).toContain('Bo5')
    expect(seriesScoreProblem('bo1', 16, 14)).toContain('Bo1')
  })

  it('refuses negative or fractional scores', () => {
    expect(seriesScoreProblem('bo3', -1, 2)).not.toBeNull()
    expect(seriesScoreProblem('bo3', 2, 0.5)).not.toBeNull()
  })

  it('leaves an unknown format to the API', () => {
    expect(seriesScoreProblem('custom', 7, 3)).toBeNull()
  })
})
