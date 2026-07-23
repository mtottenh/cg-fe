import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'
import { replaceById } from '@/utils/collections'

type TournamentInvitationResponse = components['schemas']['TournamentInvitationResponse']
type CreateTournamentInvitationRequest = components['schemas']['CreateTournamentInvitationRequest']

/**
 * Invitations slice: the invite list behind `registration_type = 'invite_only'`.
 *
 * All three endpoints require `tournament.participants.manage`, so this slice
 * only ever loads for an organiser. A participant cannot read their own
 * invitation — see the FINDING note in
 * `components/tournament/TournamentRegistrationCard.vue`.
 */
export function createInvitationsSlice() {
  const invitations = ref<TournamentInvitationResponse[]>([])

  const fetchInvitationsState = createActionState()
  const createInvitationState = createActionState()
  const revokeInvitationState = createActionState()

  async function fetchInvitations(tournamentId: string): Promise<TournamentInvitationResponse[]> {
    return withActionState(fetchInvitationsState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/invitations', {
        params: { path: { tournament_id: tournamentId } },
      }))
      invitations.value = result.data
      return invitations.value
    }, 'Failed to fetch invitations')
  }

  async function createInvitation(
    tournamentId: string,
    request: CreateTournamentInvitationRequest,
  ): Promise<TournamentInvitationResponse> {
    return withActionState(createInvitationState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/invitations', {
        params: { path: { tournament_id: tournamentId } },
        body: request,
      }))
      invitations.value.unshift(result.data)
      return result.data
    }, 'Failed to send invitation')
  }

  async function revokeInvitation(
    tournamentId: string,
    invitationId: string,
  ): Promise<TournamentInvitationResponse> {
    return withActionState(revokeInvitationState, async () => {
      const result = await unwrapApi(api.DELETE('/v1/tournaments/{tournament_id}/invitations/{invitation_id}', {
        params: { path: { tournament_id: tournamentId, invitation_id: invitationId } },
      }))
      // The API returns the revoked row (status flips to `revoked`); keep it in
      // the list so the organiser sees the audit trail rather than a silent
      // disappearance.
      replaceById(invitations.value, result.data)
      return result.data
    }, 'Failed to revoke invitation')
  }

  function clear() {
    invitations.value = []
  }

  return {
    // State
    invitations,
    // Per-action states
    fetchInvitationsState,
    createInvitationState,
    revokeInvitationState,
    // Actions
    fetchInvitations,
    createInvitation,
    revokeInvitation,
    clear,
  }
}
