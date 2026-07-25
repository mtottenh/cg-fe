import { computed, type Ref } from 'vue'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import type { components } from '@/api/types'

type TournamentRegistrationResponse = components['schemas']['TournamentRegistrationResponse']

/**
 * The current user's relationship to a specific match.
 *
 * # Why this no longer scans the registrations list (P-53 / P-56)
 *
 * This used to resolve the caller's registration via `useTournamentContext`,
 * which searches `tournamentsStore.registrations` for a row matching the
 * caller's `player_id` (or one of their team-seasons). That list is paginated
 * and the API clamps `per_page` at 100 (`PaginationParams::limit`), so the
 * search could only ever see the first 100 rows. In any tournament with more
 * than 100 participants, everyone sorting past row 100 resolved to `null` —
 * and `canSubmitResult`, `showConfirmationPanel`, `showSchedulingPanel` and
 * `showCheckInPanel` are ALL gated on that value. Those players could not
 * submit a result, confirm one, or schedule, and nothing told them why: the
 * controls simply never rendered. 128-player CS2 events are routine.
 *
 * Raising the page size only moved the ceiling from 20 to 100. The answer now
 * comes from `GET /v1/tournaments/{id}/matches/{id}/participants`, which reads
 * both registrations straight off the match row and reports which one is the
 * caller's — O(1), and independent of participant count. There is deliberately
 * no fallback to the old scan: a fallback that works only below 100
 * participants IS the defect.
 */
export function useMatchContext(match: Ref<TournamentMatchResponse | null>) {
  const tournamentsStore = useTournamentsStore()

  /** Server-resolved participants for this match, or null before they load. */
  const participants = computed(() => {
    const resolved = tournamentsStore.matchParticipants
    // Guard against a stale resolution surviving a navigation between matches.
    if (!resolved || !match.value || resolved.match_id !== match.value.id) return null
    return resolved
  })

  /** The current user's registration in this match, if they are in it. */
  const myRegistration = computed((): TournamentRegistrationResponse | null => {
    const resolved = participants.value
    if (!resolved?.my_registration_id) return null
    for (const p of [resolved.participant1, resolved.participant2]) {
      if (p && p.id === resolved.my_registration_id) return p
    }
    return null
  })

  /** The current user's registration ID, only if they are a participant in this match. */
  const userRegistrationId = computed(
    (): string | null => participants.value?.my_registration_id ?? null,
  )

  const isParticipant = computed(() => !!userRegistrationId.value)

  const opponentRegistration = computed((): TournamentRegistrationResponse | null => {
    const resolved = participants.value
    if (!resolved || !userRegistrationId.value) return null
    return (
      [resolved.participant1, resolved.participant2].find(
        (p) => p && p.id !== userRegistrationId.value,
      ) ?? null
    )
  })

  const opponentRegistrationId = computed(
    (): string | null => opponentRegistration.value?.id ?? null,
  )

  const opponentPlayerId = computed(
    (): string | null => opponentRegistration.value?.player_id ?? null,
  )

  return {
    myRegistration,
    userRegistrationId,
    isParticipant,
    opponentRegistrationId,
    opponentPlayerId,
  }
}
