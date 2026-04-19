/**
 * Supplementary types for API responses that the OpenAPI generator produces
 * incompletely or not at all.
 *
 * Regenerating `src/api/types.ts` requires a live backend (`npm run generate:api`).
 * Until that round-trip happens, declare the missing bits here so call sites don't
 * have to sprinkle `as Record<string, unknown>` / `as any[]` casts.
 *
 * Treat this file as temporary — when the spec is fixed upstream, its definitions
 * should be replaced by the generated ones.
 */

import type { components } from './types'

/**
 * Swiss and round-robin brackets carry round-progress metadata that the spec
 * does not yet surface. These fields are populated by the backend for those
 * formats and are `null`/absent for single/double-elimination.
 */
export interface BracketProgress {
  current_round?: number | null
  total_rounds?: number | null
}

export type TournamentBracketResponse =
  components['schemas']['TournamentBracketResponse'] & BracketProgress

/** Re-export of the generated standing row for convenience. */
export type BracketStandingsRow = components['schemas']['TournamentStandingResponse']

/**
 * Tournament `settings` JSONB on the backend — the spec types this as `unknown`
 * but our code reads `side_selection_mode`. Declared explicitly here.
 */
export interface TournamentSettings {
  side_selection_mode?: string
  // Additional keys are allowed — settings is a freeform JSONB container.
  [key: string]: unknown
}

/**
 * `GameDetailResponse.map_pool` — the list of default map IDs for a game.
 * Missing from the generated schema.
 */
export interface GameDetailWithMapPool {
  map_pool?: string[]
  [key: string]: unknown
}

/**
 * `LeagueResponse`/`CreateLeagueRequest`.settings — eligibility rules and other
 * league-level JSONB configuration.
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

/**
 * Convenience alias for the stage-create body. The generated spec calls it
 * `CreateTournamentStageRequest`; some call sites still reference the short
 * `CreateStageRequest` name.
 */
export type CreateStageRequest = components['schemas']['CreateTournamentStageRequest']

/**
 * Rank-tier lookup endpoint response.
 */
export interface RankTier {
  id: string
  display_name: string
  sort_order: number
}
