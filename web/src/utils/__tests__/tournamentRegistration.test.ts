import { describe, it, expect } from 'vitest'
import {
  canWithdrawRegistration,
  isLiveRegistration,
  isTerminalRegistration,
  rosterNeededForCup,
} from '@/utils/tournamentRegistration'

// Mirrors `TournamentRegistrationStatus::{is_terminal, can_withdraw}` in
// portal-core/src/types/tournament.rs.
describe('tournamentRegistration', () => {
  it('treats eliminated, disqualified, withdrawn and no_show as terminal', () => {
    for (const s of ['eliminated', 'disqualified', 'withdrawn', 'no_show']) {
      expect(isTerminalRegistration(s)).toBe(true)
      expect(isLiveRegistration({ status: s })).toBe(false)
    }
    for (const s of ['pending', 'approved', 'checked_in', 'active']) {
      expect(isTerminalRegistration(s)).toBe(false)
      expect(isLiveRegistration({ status: s })).toBe(true)
    }
  })

  it('allows withdrawing from pending/approved/checked_in/active only', () => {
    for (const s of ['pending', 'approved', 'checked_in', 'active']) {
      expect(canWithdrawRegistration(s, 'registration')).toBe(true)
    }
    for (const s of ['eliminated', 'disqualified', 'withdrawn', 'no_show']) {
      expect(canWithdrawRegistration(s, 'registration')).toBe(false)
    }
  })

  it('allows withdrawing mid-cup but not once the cup is over', () => {
    expect(canWithdrawRegistration('approved', 'scheduled')).toBe(true)
    expect(canWithdrawRegistration('active', 'in_progress')).toBe(true)
    expect(canWithdrawRegistration('approved', 'completed')).toBe(false)
    expect(canWithdrawRegistration('approved', 'finalized')).toBe(false)
    expect(canWithdrawRegistration('approved', 'cancelled')).toBe(false)
  })

  it('needs the larger of the cup lineup and the season minimum, never the cap', () => {
    expect(rosterNeededForCup(5, 6)).toBe(6)
    expect(rosterNeededForCup(5, 2)).toBe(5)
    expect(rosterNeededForCup(5, null)).toBe(5)
    expect(rosterNeededForCup(null, 4)).toBe(4)
    expect(rosterNeededForCup(null, undefined)).toBe(0)
  })
})
