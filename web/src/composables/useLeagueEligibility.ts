/**
 * League access types offered by the create/edit modals. Kept as a module
 * constant (not a composable) so both modals share the exact same list
 * instead of each declaring their own.
 */
export const LEAGUE_ACCESS_TYPES = [
  { value: 'open', label: 'Open', description: 'Anyone can join immediately' },
  { value: 'invite_only', label: 'Invite Only', description: 'Members can only join via invitation' },
  { value: 'application', label: 'Application', description: 'Users apply, admins approve/reject' },
] as const

export type LeagueAccessType = (typeof LEAGUE_ACCESS_TYPES)[number]['value']

/**
 * Eligibility fields surfaced in the league form. Nulls indicate "no rule set"
 * — the serializer drops them when producing the settings payload, and the
 * deserializer reads `null` for any missing/undefined key.
 */
export interface LeagueEligibilityForm {
  min_rating: number | null
  max_rating: number | null
  max_peak_rating: number | null
  min_matches: number | null
}

export function emptyEligibilityForm(): LeagueEligibilityForm {
  return {
    min_rating: null,
    max_rating: null,
    max_peak_rating: null,
    min_matches: null,
  }
}

/**
 * Read the four eligibility fields out of a league's `settings` JSONB.
 * Takes `unknown` because the OpenAPI spec types `settings` that way — the
 * helper narrows internally without forcing callers to cast.
 */
export function extractEligibilityForm(settings: unknown): LeagueEligibilityForm {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>
  const rawEligibility = s.eligibility
  const eligibility = (rawEligibility && typeof rawEligibility === 'object'
    ? rawEligibility
    : {}) as Record<string, unknown>
  return {
    min_rating: (eligibility.min_rating_per_player as number | undefined) ?? null,
    max_rating: (eligibility.max_rating_per_player as number | undefined) ?? null,
    max_peak_rating: (eligibility.max_peak_rating_per_player as number | undefined) ?? null,
    min_matches: (eligibility.min_matches_played as number | undefined) ?? null,
  }
}

/**
 * Build the `settings` payload for a league create/update request.
 *
 * - Drops `null`/falsy fields so only real rules end up in the JSONB.
 * - Returns an empty object (not undefined) so callers can diff against
 *   existing settings; TournamentEditModal-style "send only if changed"
 *   check still works.
 */
export function buildEligibilitySettings(form: LeagueEligibilityForm): { eligibility?: Record<string, number> } {
  const eligibility: Record<string, number> = {}
  if (form.min_rating) eligibility.min_rating_per_player = form.min_rating
  if (form.max_rating) eligibility.max_rating_per_player = form.max_rating
  if (form.max_peak_rating) eligibility.max_peak_rating_per_player = form.max_peak_rating
  if (form.min_matches) eligibility.min_matches_played = form.min_matches
  return Object.keys(eligibility).length > 0 ? { eligibility } : {}
}
