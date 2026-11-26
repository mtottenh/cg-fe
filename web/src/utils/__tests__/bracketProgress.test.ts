import { describe, it, expect } from 'vitest'
import { bracketProgress, formatBracketProgress } from '@/utils/bracketProgress'

const m = (status: string) => ({ status })

describe('bracketProgress', () => {
  it('counts a forfeit as played', () => {
    const p = bracketProgress([m('completed'), m('forfeit'), m('ready')])
    expect(p).toEqual({ played: 2, total: 3, cancelled: 0 })
    expect(formatBracketProgress(p)).toBe('2/3 played')
  })

  it('takes a cancelled match out of the total and reports it separately', () => {
    const p = bracketProgress([m('completed'), m('forfeit'), m('cancelled')])
    expect(p).toEqual({ played: 2, total: 2, cancelled: 1 })
    expect(formatBracketProgress(p)).toBe('2/2 played · 1 cancelled')
  })

  it('does not count a live or disputed match as played', () => {
    expect(bracketProgress([m('in_progress'), m('awaiting_result'), m('disputed')]).played).toBe(0)
  })
})
