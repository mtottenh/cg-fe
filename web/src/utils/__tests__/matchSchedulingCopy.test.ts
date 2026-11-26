import { describe, it, expect } from 'vitest'
import {
  noTimeLabel,
  waitingForTimeHeading,
  waitingForTimeNote,
  type MatchTimeContext,
} from '@/utils/matchSchedulingCopy'

function ctx(overrides: Partial<MatchTimeContext>): MatchTimeContext {
  return { status: 'ready', hasTime: false, selfScheduled: false, canAgreeTime: false, ...overrides }
}

describe('noTimeLabel', () => {
  it('only says the time is "to be agreed" where players agree it', () => {
    expect(noTimeLabel(true)).toBe('Time to be agreed')
    expect(noTimeLabel(false)).toBe('Time not set yet')
  })
})

describe('a ready match', () => {
  it('tells players in an admin-scheduled tournament that an admin sets the time', () => {
    const c = ctx({})
    expect(waitingForTimeHeading(c)).toBe('Waiting for a match time')
    expect(waitingForTimeNote(c)).toContain('An admin will set the time')
  })

  it('asks a self-scheduling participant to agree a time, and leaves the rest to the panel', () => {
    const c = ctx({ selfScheduled: true, canAgreeTime: true })
    expect(waitingForTimeHeading(c)).toBe('Agree a time with your opponent')
    expect(waitingForTimeNote(c)).toBeNull()
  })

  it('tells a spectator of a self-scheduled match that the teams agree it', () => {
    const c = ctx({ selfScheduled: true })
    expect(waitingForTimeHeading(c)).toBe('Waiting for the teams to agree a time')
    expect(waitingForTimeNote(c)).toContain('agree a time between themselves')
  })
})

describe('a scheduled match', () => {
  it('says so when it has no time, instead of promising a check-in window', () => {
    for (const selfScheduled of [true, false]) {
      const c = ctx({ status: 'scheduled', selfScheduled, canAgreeTime: selfScheduled })
      expect(waitingForTimeHeading(c)).toBe('Match time not set yet')
      expect(waitingForTimeNote(c)).toContain('An admin needs to set one')
    }
  })

  it('defers to the page once it has a time', () => {
    const c = ctx({ status: 'scheduled', hasTime: true })
    expect(waitingForTimeHeading(c)).toBeNull()
    expect(waitingForTimeNote(c)).toBeNull()
  })
})

describe('any other status', () => {
  it('has nothing to say', () => {
    for (const status of ['pending', 'checking_in', 'pick_ban', 'in_progress', 'completed']) {
      expect(waitingForTimeHeading(ctx({ status })), status).toBeNull()
      expect(waitingForTimeNote(ctx({ status })), status).toBeNull()
    }
  })
})
