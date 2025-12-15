import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * @deprecated The old standalone team invitation system has been replaced with league team invitations.
 * Team invitations are now managed through league-team-invitation endpoints.
 * Use the admin league management UI for team invitation operations.
 *
 * This store is kept as a stub for backwards compatibility but does not function.
 */

// Stub types for backwards compatibility
interface TeamInvitation {
  id: string
  team_id?: string
  team_name?: string
  team_tag?: string
  team_logo_url?: string | null
  player_id?: string
  invited_by?: string
  invited_by_name?: string
  role: string
  status: string
  message?: string | null
  expires_at?: string
  created_at: string
}

interface TeamMember {
  player_id: string
  display_name: string
  avatar_url?: string | null
  role: string
  joined_at: string
}

interface InvitePlayerRequest {
  player_id: string
  role?: string
  message?: string
}

export const useInvitationsStore = defineStore('invitations', () => {
  const invitations = ref<TeamInvitation[]>([])
  const teamInvitations = ref<TeamInvitation[]>([])
  const pendingCount = ref(0)
  const loading = ref(false)
  const error = ref<string | null>('The standalone invitation system has been deprecated. Invitations are now managed through league teams.')

  const hasPendingInvitations = computed(() => pendingCount.value > 0)

  async function fetchMyInvitations(): Promise<TeamInvitation[]> {
    console.warn('[DEPRECATED] useInvitationsStore.fetchMyInvitations - Invitations are now managed through league teams')
    error.value = 'Invitations are now managed through league teams. Please use the league team management UI.'
    return []
  }

  async function fetchPendingCount(): Promise<number> {
    console.warn('[DEPRECATED] useInvitationsStore.fetchPendingCount - Invitations are now managed through league teams')
    return 0
  }

  async function acceptInvitation(_invitationId: string): Promise<TeamMember | null> {
    console.warn('[DEPRECATED] useInvitationsStore.acceptInvitation - Invitations are now managed through league teams')
    error.value = 'Invitations are now managed through league teams. Please use the league team management UI.'
    return null
  }

  async function declineInvitation(_invitationId: string): Promise<TeamInvitation | null> {
    console.warn('[DEPRECATED] useInvitationsStore.declineInvitation - Invitations are now managed through league teams')
    error.value = 'Invitations are now managed through league teams. Please use the league team management UI.'
    return null
  }

  async function invitePlayer(
    _teamId: string,
    _playerId: string,
    _role = 'player',
    _message?: string
  ): Promise<TeamInvitation | null> {
    console.warn('[DEPRECATED] useInvitationsStore.invitePlayer - Invitations are now managed through league teams')
    error.value = 'Invitations are now managed through league teams. Please use the league team management UI.'
    return null
  }

  async function fetchTeamInvitations(_teamId: string): Promise<TeamInvitation[]> {
    console.warn('[DEPRECATED] useInvitationsStore.fetchTeamInvitations - Invitations are now managed through league teams')
    error.value = 'Invitations are now managed through league teams. Please use the league team management UI.'
    return []
  }

  async function cancelInvitation(_invitationId: string): Promise<void> {
    console.warn('[DEPRECATED] useInvitationsStore.cancelInvitation - Invitations are now managed through league teams')
    error.value = 'Invitations are now managed through league teams. Please use the league team management UI.'
  }

  function clearInvitations() {
    invitations.value = []
    teamInvitations.value = []
    pendingCount.value = 0
    error.value = null
  }

  return {
    invitations,
    teamInvitations,
    pendingCount,
    loading,
    error,
    hasPendingInvitations,
    fetchMyInvitations,
    fetchPendingCount,
    acceptInvitation,
    declineInvitation,
    invitePlayer,
    fetchTeamInvitations,
    cancelInvitation,
    clearInvitations,
  }
})

// Re-export types for convenience
export type { TeamInvitation, TeamMember, InvitePlayerRequest }
