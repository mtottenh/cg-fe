import { computed, type Ref } from 'vue'
import { useTournamentsStore, type TournamentMatchResponse, type TournamentResponse } from '@/stores/tournaments'
import { useTournamentContext } from './useTournamentContext'

/**
 * Reactive context for the current user's relationship to a specific match.
 * Uses `useTournamentContext` internally to resolve the user's registration,
 * then narrows to the specific match.
 */
export function useMatchContext(
  match: Ref<TournamentMatchResponse | null>,
  tournament: Ref<TournamentResponse | null>,
) {
  const tournamentsStore = useTournamentsStore()
  const { myRegistration } = useTournamentContext(tournament)

  /** The current user's registration ID, only if they are a participant in this match. */
  const userRegistrationId = computed((): string | null => {
    if (!myRegistration.value || !match.value) return null
    if (
      match.value.participant1_registration_id === myRegistration.value.id ||
      match.value.participant2_registration_id === myRegistration.value.id
    ) {
      return myRegistration.value.id
    }
    return null
  })

  const isParticipant = computed(() => !!userRegistrationId.value)

  const opponentRegistrationId = computed((): string | null => {
    if (!match.value || !userRegistrationId.value) return null
    return match.value.participant1_registration_id === userRegistrationId.value
      ? (match.value.participant2_registration_id ?? null)
      : (match.value.participant1_registration_id ?? null)
  })

  const opponentPlayerId = computed((): string | null => {
    if (!opponentRegistrationId.value) return null
    const opponentReg = tournamentsStore.registrations.find(r => r.id === opponentRegistrationId.value)
    return opponentReg?.player_id ?? null
  })

  return {
    userRegistrationId,
    isParticipant,
    opponentRegistrationId,
    opponentPlayerId,
  }
}
