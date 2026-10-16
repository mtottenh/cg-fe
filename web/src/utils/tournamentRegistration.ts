/**
 * Tournament-registration rules, mirrored from the backend so a UI gate says
 * exactly what the API enforces.
 *
 * Source of truth: `TournamentRegistrationStatus` in
 * `portal-core/src/types/tournament.rs` (`is_terminal`, `can_withdraw`), the
 * re-registration path in `portal-domain/src/services/tournament/service.rs`
 * (`register_team` / `register_player` replace a terminal row), and the
 * withdraw endpoint `portal-api/src/handlers/forfeit.rs`, which forfeits the
 * remaining matches — so withdrawing mid-cup is allowed.
 */

/** Statuses after which the entry no longer takes part — and may re-register. */
const TERMINAL = ['eliminated', 'disqualified', 'withdrawn', 'no_show'] as const

/** Statuses from which a participant may withdraw (`can_withdraw`). */
const WITHDRAWABLE = ['pending', 'approved', 'checked_in', 'active'] as const

/** Tournament statuses with nothing left to withdraw from. */
const NO_WITHDRAW_TOURNAMENT = ['completed', 'finalized', 'cancelled'] as const

/** Backend `is_terminal`: the registration is over and does not block a new one. */
export function isTerminalRegistration(status: string | null | undefined): boolean {
  return (TERMINAL as readonly string[]).includes(status ?? '')
}

/** A registration that still represents taking part (anything not terminal). */
export function isLiveRegistration(r: { status: string }): boolean {
  return !isTerminalRegistration(r.status)
}

/** Backend `can_withdraw`, while the tournament still has matches to forfeit. */
export function canWithdrawRegistration(
  registrationStatus: string | null | undefined,
  tournamentStatus: string | null | undefined,
): boolean {
  if (!(WITHDRAWABLE as readonly string[]).includes(registrationStatus ?? '')) return false
  return !(NO_WITHDRAW_TOURNAMENT as readonly string[]).includes(tournamentStatus ?? '')
}

/**
 * Players a team must have on its active roster (captain, players and
 * substitutes) to register for a cup: the cup's lineup size or the season's
 * roster minimum, whichever is larger. The season's roster *cap* is not part
 * of it — that only limits adding members. `0` means no requirement.
 */
export function rosterNeededForCup(
  tournamentTeamSize: number | null | undefined,
  seasonTeamSizeMin: number | null | undefined,
): number {
  return Math.max(tournamentTeamSize ?? 0, seasonTeamSizeMin ?? 0)
}
