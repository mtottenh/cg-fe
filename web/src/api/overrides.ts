/**
 * Narrow view types for OpenAPI fields that the spec types as `unknown`.
 *
 * The backend returns these as freeform JSONB, so the generated types can't
 * describe the shape. These interfaces declare the specific keys the frontend
 * reads, while `[key: string]: unknown` leaves room for additional keys.
 *
 * When a field moves from freeform JSONB to a real structured response in the
 * backend spec, delete the corresponding shim here and use the generated type.
 */

import type { components } from './types'

/**
 * Tournament `settings` JSONB. The spec types this as `unknown`; the frontend
 * reads `side_selection_mode` from it (set by the create/edit forms).
 */
export interface TournamentSettings {
  side_selection_mode?: string
  [key: string]: unknown
}

/**
 * League `settings` JSONB. Holds eligibility rules and other league-level
 * configuration; the spec types this as `unknown`.
 */
export interface LeagueSettings {
  eligibility?: {
    min_rating_per_player?: number
    max_rating_per_player?: number
    max_peak_rating_per_player?: number
    min_matches_played?: number
    allowed_rank_tiers?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Short alias for the bracket-standings row — used by TournamentBracket. */
export type BracketStandingsRow = components['schemas']['TournamentStandingResponse']

/**
 * Alias for the stage-create body — some call sites reference the shorter
 * `CreateStageRequest` name while the generated schema calls it
 * `CreateTournamentStageRequest`.
 */
export type CreateStageRequest = components['schemas']['CreateTournamentStageRequest']
