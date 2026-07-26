import { describe, it, expect } from 'vitest'
import type { components } from '@/api/types'
import {
  getNextMatchStatus,
  getMatchActionLabel,
  getMatchActionColor,
} from '@/utils/matchStatus'

type MatchStatus = components['schemas']['TournamentMatchStatus']

/**
 * P-82 — "Revert to Awaiting Result" was a control that could only ever fail.
 *
 * `getNextMatchStatus` mapped `completed → awaiting_result` under a comment
 * claiming it followed the backend's allowed transitions. It did not:
 * `TournamentMatchStatus::Completed.allowed_transitions()` returns `vec![]`
 * (api/crates/portal-core/src/types/tournament.rs:472), and `admin_transition`
 * (portal-domain/src/services/tournament/match_lifecycle.rs:357) rejects it even
 * with the override flag. Both render sites gate on `getNextMatchStatus`, so
 * every completed match offered an action that 400'd — twice over.
 *
 * These tests pin the *pure* state machine. The two render sites are pinned
 * separately in `components/admin/__tests__/matchTransitionControl.test.ts`, and
 * the backend's half of the contract in `e2e/stage-formats.spec.ts`'s sibling
 * assertions — a unit test cannot see a 400.
 */

/**
 * The backend state machine, transcribed from
 * `TournamentMatchStatus::allowed_transitions()`
 * (api/crates/portal-core/src/types/tournament.rs:446-472).
 *
 * Transcribed and not imported because it lives in another repo *and* another
 * language; the frontend has no generated view of it (the API stringifies the
 * transition, so no union reaches `src/api/types.ts` — P-112). That makes this
 * table the weak link, so it is written out in full rather than spot-checked:
 * a reviewer can diff eleven lines against the Rust match arms, which is not
 * true of an assertion that only names the case it cares about.
 */
const BACKEND_ALLOWED: Record<MatchStatus, MatchStatus[]> = {
  pending: ['ready', 'cancelled'],
  ready: ['scheduled', 'cancelled'],
  scheduled: ['checking_in', 'pick_ban', 'in_progress', 'forfeit', 'cancelled'],
  checking_in: ['pick_ban', 'in_progress', 'forfeit'],
  pick_ban: ['in_progress', 'forfeit'],
  in_progress: ['awaiting_result', 'forfeit'],
  awaiting_result: ['completed', 'disputed', 'forfeit'],
  disputed: ['completed'],
  // Terminal — `Self::Completed | Self::Forfeit | Self::Cancelled => vec![]`.
  completed: [],
  forfeit: [],
  cancelled: [],
}

const ALL_STATUSES = Object.keys(BACKEND_ALLOWED) as MatchStatus[]

const TERMINAL = ALL_STATUSES.filter((s) => BACKEND_ALLOWED[s].length === 0)

describe('getNextMatchStatus', () => {
  it('never offers a transition the backend forbids', () => {
    // The general form of P-82. Written as a sweep over every status rather
    // than a `completed` special case so the NEXT bad arrow is caught too —
    // point-fixing one entry is what let this class recur (see C1).
    for (const status of ALL_STATUSES) {
      const next = getNextMatchStatus(status)
      if (next === null) continue
      expect(
        BACKEND_ALLOWED[status],
        `${status} → ${next} is not in the backend's allowed_transitions()`,
      ).toContain(next)
    }
  })

  it('offers no transition out of a terminal status', () => {
    // P-82 exactly. `completed` is the one that shipped; `forfeit` and
    // `cancelled` are equally terminal and are pinned so a future "just add a
    // revert" cannot reintroduce the bug through a different door.
    expect(TERMINAL).toEqual(['completed', 'forfeit', 'cancelled'])
    for (const status of TERMINAL) {
      expect(getNextMatchStatus(status), `${status} must be terminal`).toBeNull()
    }
  })

  it('still advances a match through the happy path', () => {
    // The fix must not cost the working transitions: this is the sequence an
    // admin actually walks, and every step is in BACKEND_ALLOWED above.
    expect(getNextMatchStatus('pending')).toBe('ready')
    expect(getNextMatchStatus('ready')).toBe('scheduled')
    expect(getNextMatchStatus('scheduled')).toBe('in_progress')
    expect(getNextMatchStatus('checking_in')).toBe('in_progress')
    expect(getNextMatchStatus('in_progress')).toBe('awaiting_result')
    expect(getNextMatchStatus('awaiting_result')).toBe('completed')
  })

  it('returns null for a status it does not know', () => {
    expect(getNextMatchStatus('not_a_status')).toBeNull()
  })
})

describe('getMatchActionLabel', () => {
  it('labels exactly the statuses that have a transition, and no others', () => {
    // A label without a transition is a button that renders and cannot act —
    // the shape of P-82. Keeping the two key sets identical means the dead
    // label cannot come back on its own.
    const labelled = ALL_STATUSES.filter((s) => getMatchActionLabel(s) !== '')
    const transitionable = ALL_STATUSES.filter((s) => getNextMatchStatus(s) !== null)
    expect(labelled).toEqual(transitionable)
  })

  it('no longer offers "Revert to Awaiting Result" for any status', () => {
    // The literal string from the bug report. Asserted across every status
    // rather than just `completed`, so moving it elsewhere still fails.
    for (const status of ALL_STATUSES) {
      expect(getMatchActionLabel(status)).not.toBe('Revert to Awaiting Result')
    }
    expect(getMatchActionLabel('completed')).toBe('')
  })
})

describe('getMatchActionColor', () => {
  it('keeps the colours of the transitions that survived', () => {
    expect(getMatchActionColor('pending')).toBe('info')
    expect(getMatchActionColor('in_progress')).toBe('success')
    expect(getMatchActionColor('awaiting_result')).toBe('success')
    expect(getMatchActionColor('ready')).toBe('primary')
  })
})
