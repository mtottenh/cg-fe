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
