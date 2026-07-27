/**
 * League access types offered by the create/edit modals. Kept as a module
 * constant (not a composable) so both modals share the exact same list
 * instead of each declaring their own.
 *
 * The eligibility form serializers that used to live here moved to
 * `useEligibilityRules.ts`, which speaks the same typed vocabulary as
 * tournaments (and the backend's `EligibilityRestrictionsInput`).
 */
export const LEAGUE_ACCESS_TYPES = [
  { value: 'open', label: 'Open', description: 'Anyone can join immediately' },
  { value: 'invite_only', label: 'Invite Only', description: 'Members can only join via invitation' },
  { value: 'application', label: 'Application', description: 'Users apply, admins approve/reject' },
] as const

export type LeagueAccessType = (typeof LEAGUE_ACCESS_TYPES)[number]['value']
