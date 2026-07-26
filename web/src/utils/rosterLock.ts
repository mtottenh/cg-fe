/**
 * Roster-lock semantics for league seasons.
 *
 * Mirrored from the backend's single source of truth,
 * `portal-core/src/types/league_team.rs:83-137` (`RosterLockStatus`), and the
 * DB CHECK constraint in `migrations/0025_league_teams_and_seasons.sql:46,69`:
 *
 *   open       every roster change is allowed
 *   soft_lock  "minor changes allowed (substitutes only)" — primary roster
 *              (captain / player) additions and removals are blocked
 *   hard_lock  "no roster changes allowed"
 *
 * The value `'locked'` — which the frontend compared against in three places
 * (COVERAGE-PLAN §9b P-11) — exists nowhere in the schema or the domain, so
 * every one of those comparisons was dead code.
 *
 * Unknown values fail CLOSED (treated as `hard_lock`). The whole P-4/P-10/P-11
 * family of defects is a hand-rolled comparison silently drifting away from the
 * backend's vocabulary; for a control whose job is to *block* mutations, an
 * unrecognised state must not silently mean "everything is permitted". A
 * missing value (`null`/`undefined`/`''`) is different: it means "no season
 * joined / not reported", and maps to `open`, matching the backend, which
 * defaults an absent value to `Open`
 * (`portal-db/src/adapters/league_team/conversions.rs:34`).
 */

export type RosterLockStatus = 'open' | 'soft_lock' | 'hard_lock'

const KNOWN: readonly RosterLockStatus[] = ['open', 'soft_lock', 'hard_lock']

/** Normalise a raw backend string into a known lock state. See module docs. */
export function parseRosterLock(value: string | null | undefined): RosterLockStatus {
  if (value === null || value === undefined || value === '') return 'open'
  const normalised = value.toLowerCase() as RosterLockStatus
  return KNOWN.includes(normalised) ? normalised : 'hard_lock'
}

/**
 * Can captains / players be added to or removed from the roster?
 * Backend: `RosterLockStatus::allows_primary_changes` — `open` only.
 */
export function allowsPrimaryRosterChanges(value: string | null | undefined): boolean {
  return parseRosterLock(value) === 'open'
}

/**
 * Can substitutes be added to or removed from the roster?
 * Backend: `RosterLockStatus::allows_substitute_changes` — `open` or `soft_lock`.
 */
export function allowsSubstituteChanges(value: string | null | undefined): boolean {
  return parseRosterLock(value) !== 'hard_lock'
}

/**
 * Is *any* roster change allowed?
 * Backend: `RosterLockStatus::allows_any_changes` — anything but `hard_lock`.
 */
export function allowsAnyRosterChanges(value: string | null | undefined): boolean {
  return parseRosterLock(value) !== 'hard_lock'
}

/** Chip label, or `null` when the roster is open and no chip should render. */
export function rosterLockLabel(value: string | null | undefined): string | null {
  const status = parseRosterLock(value)
  if (status === 'open') return null
  return status === 'hard_lock' ? 'Roster Locked' : 'Roster Soft-Locked'
}

/** Chip colour matching `rosterLockLabel`. */
export function rosterLockColor(value: string | null | undefined): string {
  return parseRosterLock(value) === 'hard_lock' ? 'error' : 'warning'
}

/** Explanatory copy for the chip tooltip / disabled-control title. */
export function rosterLockHint(value: string | null | undefined): string | null {
  const status = parseRosterLock(value)
  if (status === 'open') return null
  return status === 'hard_lock'
    ? 'The roster is locked for this season — no roster changes are allowed.'
    : 'The roster is soft-locked for this season — substitute changes only.'
}
