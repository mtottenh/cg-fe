import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, getAuthToken } from '@/api'
import { createActionState, unwrapApi, withActionState } from '@/stores/helpers/apiAction'
import type { components } from '@/api/types'

type S = components['schemas']

/**
 * These were five hand-written re-declarations of types the generated client
 * already carries — the same defect P-112 is about, one layer up: three of them
 * were status unions transcribed from Rust by hand, which is exactly how P-79
 * (`critical` vs `urgent`) happened. `LineupStatus`, `LineupSource` and
 * `ParticipationStatus` are all registered in `openapi.rs`, so they are aliased
 * rather than restated and can no longer drift from the backend.
 */
/** Provenance of a lineup player row. */
export type LineupSource = S['LineupSource']
/** Lineup lifecycle status. */
export type LineupStatus = S['LineupStatus']
export type ParticipationStatus = S['ParticipationStatus']

export type MatchLineupPlayer = S['MatchLineupPlayerResponse']
export type MatchLineup = S['MatchLineupResponse']
export type DeclareLineupPayload = S['DeclareLineupRequest']

/**
 * Store for match lineups (who actually played) — distinct from the roster
 * (who is eligible). Two-phase: a captain declares a provisional lineup at
 * check-in; the authoritative per-map lineup is derived from the demo. A
 * lineup is opponent-visible only once locked.
 */
export const useLineupsStore = defineStore('lineups', () => {
  const lineups = ref<MatchLineup[]>([])

  const fetchState = createActionState()
  const declareState = createActionState()

  /** Fetch all lineups for a match. */
  async function fetchLineups(tournamentId: string, matchId: string): Promise<void> {
    if (!getAuthToken()) return
    await withActionState(
      fetchState,
      async () => {
        // P-65: the `as never` casts here were believed to mirror the
        // action-items gap, but both lineup operations HAVE been registered in
        // `openapi.rs` all along (`tournaments::declare_lineup`,
        // `tournaments::get_match_lineups`) — the casts were simply stale, and
        // they suppressed the very type checking the registration bought.
        const result = await unwrapApi(
          api.GET('/v1/tournaments/{tournament_id}/matches/{match_id}/lineups', {
            params: { path: { tournament_id: tournamentId, match_id: matchId } },
          })
        )
        lineups.value = result.data
      },
      'Failed to load lineups'
    )
  }

  /** Declare (or replace) the provisional lineup for a registration. */
  async function declareLineup(
    tournamentId: string,
    matchId: string,
    payload: DeclareLineupPayload
  ): Promise<MatchLineup | null> {
    return withActionState(
      declareState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/lineup', {
            params: { path: { tournament_id: tournamentId, match_id: matchId } },
            body: payload,
          })
        )
        const declared = result.data
        // Reflect the update locally.
        const idx = lineups.value.findIndex((l) => l.registration_id === declared.registration_id)
        if (idx >= 0) lineups.value[idx] = declared
        else lineups.value.push(declared)
        return declared
      },
      'Failed to declare lineup'
    )
  }

  /** The lineup for a given registration, if loaded. */
  function lineupFor(registrationId: string | null | undefined): MatchLineup | undefined {
    if (!registrationId) return undefined
    return lineups.value.find((l) => l.registration_id === registrationId)
  }

  function reset(): void {
    lineups.value = []
  }

  return {
    lineups,
    fetchState,
    declareState,
    fetchLineups,
    declareLineup,
    lineupFor,
    reset,
  }
})
