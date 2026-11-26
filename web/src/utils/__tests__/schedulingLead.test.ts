import { describe, it, expect } from 'vitest'
import {
  MIN_PROPOSAL_LEAD_MINUTES,
  earliestProposableTime,
  givesEnoughNotice,
} from '@/utils/schedulingLead'

const now = new Date('2026-11-27T18:00:00Z')
const minutesFromNow = (m: number) => new Date(now.getTime() + m * 60_000).toISOString()

describe('schedulingLead', () => {
  it('requires more notice than the 15-minute check-in lead', () => {
    expect(MIN_PROPOSAL_LEAD_MINUTES).toBeGreaterThan(15)
    expect(earliestProposableTime(now).toISOString()).toBe(minutesFromNow(MIN_PROPOSAL_LEAD_MINUTES))
  })

  it('refuses past times and times inside the lead', () => {
    expect(givesEnoughNotice(minutesFromNow(-60), now)).toBe(false)
    expect(givesEnoughNotice(minutesFromNow(1), now)).toBe(false)
    expect(givesEnoughNotice(minutesFromNow(MIN_PROPOSAL_LEAD_MINUTES - 1), now)).toBe(false)
  })

  it('accepts a time exactly at the lead or later', () => {
    expect(givesEnoughNotice(minutesFromNow(MIN_PROPOSAL_LEAD_MINUTES), now)).toBe(true)
    expect(givesEnoughNotice(minutesFromNow(24 * 60), now)).toBe(true)
  })

  it('refuses an unparseable value', () => {
    expect(givesEnoughNotice('not a date', now)).toBe(false)
  })
})
