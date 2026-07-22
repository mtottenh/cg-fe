import { describe, it, expect } from 'vitest'
import {
  allowsAnyRosterChanges,
  allowsPrimaryRosterChanges,
  allowsSubstituteChanges,
  parseRosterLock,
  rosterLockColor,
  rosterLockHint,
  rosterLockLabel,
} from '../rosterLock'

/**
 * These mirror the backend truth table in
 * `portal-core/src/types/league_team.rs:119-137` (and its own unit test at
 * :487-495). If the two ever diverge again we get COVERAGE-PLAN §9b P-11 back.
 */
describe('rosterLock', () => {
  describe('parseRosterLock', () => {
    it('passes through the three real backend values', () => {
      expect(parseRosterLock('open')).toBe('open')
      expect(parseRosterLock('soft_lock')).toBe('soft_lock')
      expect(parseRosterLock('hard_lock')).toBe('hard_lock')
    })

    it('treats a missing value as open (no season joined / not reported)', () => {
      expect(parseRosterLock(null)).toBe('open')
      expect(parseRosterLock(undefined)).toBe('open')
      expect(parseRosterLock('')).toBe('open')
    })

    it("fails CLOSED on an unrecognised value — including the bogus 'locked'", () => {
      // 'locked' is the string the UI used to compare against; the DB CHECK
      // constraint cannot produce it. If it ever appears, deny rather than
      // silently permit every mutation.
      expect(parseRosterLock('locked')).toBe('hard_lock')
      expect(parseRosterLock('whatever_comes_next')).toBe('hard_lock')
    })
  })

  it('matches the backend allow-matrix', () => {
    expect(allowsPrimaryRosterChanges('open')).toBe(true)
    expect(allowsSubstituteChanges('open')).toBe(true)
    expect(allowsAnyRosterChanges('open')).toBe(true)

    // soft_lock: "minor changes allowed (substitutes only)"
    expect(allowsPrimaryRosterChanges('soft_lock')).toBe(false)
    expect(allowsSubstituteChanges('soft_lock')).toBe(true)
    expect(allowsAnyRosterChanges('soft_lock')).toBe(true)

    // hard_lock: "no roster changes allowed"
    expect(allowsPrimaryRosterChanges('hard_lock')).toBe(false)
    expect(allowsSubstituteChanges('hard_lock')).toBe(false)
    expect(allowsAnyRosterChanges('hard_lock')).toBe(false)
  })

  it('renders a chip only when the roster is not open', () => {
    expect(rosterLockLabel('open')).toBeNull()
    expect(rosterLockLabel(null)).toBeNull()
    expect(rosterLockLabel('soft_lock')).toBe('Roster Soft-Locked')
    expect(rosterLockLabel('hard_lock')).toBe('Roster Locked')

    expect(rosterLockColor('soft_lock')).toBe('warning')
    expect(rosterLockColor('hard_lock')).toBe('error')
  })

  it('explains the restriction in the hint', () => {
    expect(rosterLockHint('open')).toBeNull()
    expect(rosterLockHint('soft_lock')).toMatch(/substitute changes only/i)
    expect(rosterLockHint('hard_lock')).toMatch(/no roster changes/i)
  })
})
