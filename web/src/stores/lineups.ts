import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, getAuthToken } from '@/api'
import { createActionState, withActionState } from '@/stores/helpers/apiAction'

/** Provenance of a lineup player row (mirrors portal_core::LineupSource). */
export type LineupSource = 'declared' | 'demo' | 'evidence' | 'admin'
/** Lineup lifecycle status (mirrors portal_core::LineupStatus). */
export type LineupStatus = 'draft' | 'submitted' | 'locked'
export type ParticipationStatus =
  | 'confirmed'
  | 'no_show'
  | 'left_early'
  | 'substituted'
  | 'removed'

export interface MatchLineupPlayer {
  id: string
  player_id: string
  source: LineupSource
  game_number?: number | null
  is_substitute: boolean
  was_rostered: boolean
  participation_status: ParticipationStatus
}

export interface MatchLineup {
  id: string
  match_id: string
  registration_id: string
  status: LineupStatus
  declared_by?: string | null
  declared_at?: string | null
  locked_at?: string | null
  short_handed: boolean
  notes?: string | null
  /** Whether the caller may see the player list (opponent sees only once locked). */
  players_visible: boolean
  players: MatchLineupPlayer[]
}

export interface DeclareLineupPayload {
  registration_id: string
  player_ids: string[]
  submit?: boolean
  notes?: string | null
}

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
        const { data, error } = await api.GET(
          '/v1/tournaments/{tournament_id}/matches/{match_id}/lineups' as never,
          { params: { path: { tournament_id: tournamentId, match_id: matchId } } } as never
        )
        if (error) {
          throw new Error(
            (error as Record<string, string>).detail || 'Failed to load lineups'
          )
        }
        lineups.value = ((data as Record<string, unknown>)?.data as MatchLineup[]) ?? []
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
        const { data, error } = await api.POST(
          '/v1/tournaments/{tournament_id}/matches/{match_id}/lineup' as never,
          {
            params: { path: { tournament_id: tournamentId, match_id: matchId } },
            body: payload,
          } as never
        )
        if (error) {
          throw new Error(
            (error as Record<string, string>).detail || 'Failed to declare lineup'
          )
        }
        const declared = (data as Record<string, unknown>)?.data as MatchLineup
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
