import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, createLatestGuard } from '@/stores/helpers'

// Use generated types
type LeagueTeamResponse = components['schemas']['LeagueTeamResponse']
type LeagueTeamSummaryResponse = components['schemas']['LeagueTeamSummaryResponse']
type LeagueTeamSeasonResponse = components['schemas']['LeagueTeamSeasonResponse']
type LeagueTeamWithSeasonResponse = components['schemas']['LeagueTeamWithSeasonResponse']
type LeagueTeamInvitationResponse = components['schemas']['LeagueTeamInvitationResponse']
type LeagueTeamInvitationWithTeamResponse = components['schemas']['LeagueTeamInvitationWithTeamResponse']
type PlayerLeagueTeamMembershipResponse = components['schemas']['PlayerLeagueTeamMembershipResponse']
type CreateLeagueTeamRequest = components['schemas']['CreateLeagueTeamRequest']
type UpdateLeagueTeamRequest = components['schemas']['UpdateLeagueTeamRequest']
type AddLeagueTeamMemberRequest = components['schemas']['AddLeagueTeamMemberRequest']
type InviteToLeagueTeamRequest = components['schemas']['InviteToLeagueTeamRequest']
type PaginationMeta = components['schemas']['PaginationMeta']

// Members response type (with player info)
interface LeagueTeamMemberWithPlayer {
  avatar_url?: string | null
  display_name: string
  id: string
  jersey_number?: number | null
  joined_at: string
  left_at?: string | null
  player_id: string
  position?: string | null
  role: string
  status: string
  team_season_id: string
}

export const useLeagueTeamsStore = defineStore('leagueTeams', () => {
  // Team lists
  const teams = ref<LeagueTeamSummaryResponse[]>([])
  const currentTeam = ref<LeagueTeamResponse | null>(null)
  const currentTeamSeason = ref<LeagueTeamSeasonResponse | null>(null)

  // Members and invitations for current team
  const members = ref<LeagueTeamMemberWithPlayer[]>([])
  const invitations = ref<LeagueTeamInvitationResponse[]>([])

  // Current player's data
  const myTeams = ref<PlayerLeagueTeamMembershipResponse[]>([])
  const myInvitations = ref<LeagueTeamInvitationWithTeamResponse[]>([])

  // Viewed player's teams (for public profile)
  const viewedPlayerTeams = ref<PlayerLeagueTeamMembershipResponse[]>([])

  // Computed aliases wired to fetchMyTeamsState for backward compatibility
  const loading = computed(() => fetchMyTeamsState.loading)
  const error = computed({
    get: () => fetchMyTeamsState.error,
    set: (val: string | null) => { fetchMyTeamsState.error = val },
  })
  const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  // Per-action states
  const fetchTeamsInSeasonState = createActionState()
  const fetchTeamState = createActionState()
  const createTeamState = createActionState()
  const updateTeamState = createActionState()
  const registerTeamForSeasonState = createActionState()
  const fetchMembersState = createActionState()
  const addMemberState = createActionState()
  const removeMemberState = createActionState()
  const promoteToCaptainState = createActionState()
  const demoteFromCaptainState = createActionState()
  const fetchTeamInvitationsState = createActionState()
  const invitePlayerState = createActionState()
  const cancelInvitationState = createActionState()
  const fetchPlayerLeagueTeamsState = createActionState()
  const fetchMyTeamsState = createActionState()
  const fetchMyInvitationsState = createActionState()
  const acceptInvitationState = createActionState()
  const declineInvitationState = createActionState()
  const leaveTeamState = createActionState()

  // ==================== Team CRUD ====================

  async function fetchTeamsInSeason(seasonId: string, page = 1, perPage = 20): Promise<LeagueTeamSummaryResponse[]> {
    return withActionState(fetchTeamsInSeasonState, async () => {
      const result = await unwrapApi(api.GET('/v1/league-seasons/{season_id}/teams', {
        params: { path: { season_id: seasonId }, query: { page, per_page: perPage } },
      }))
      teams.value = result.data
      pagination.value = result.pagination
      return teams.value
    }, 'Failed to fetch teams')
  }

  // Latest-wins guard for `currentTeam` across rapid route changes.
  const beginCurrentTeamFetch = createLatestGuard()

  async function fetchTeam(teamId: string): Promise<LeagueTeamResponse> {
    return withActionState(fetchTeamState, async () => {
      const isCurrent = beginCurrentTeamFetch()
      const result = await unwrapApi(api.GET('/v1/league-teams/{team_id}', {
        params: { path: { team_id: teamId } },
      }))
      if (isCurrent()) currentTeam.value = result.data
      return result.data
    }, 'Failed to fetch team')
  }

  async function createTeam(seasonId: string, teamData: CreateLeagueTeamRequest): Promise<LeagueTeamWithSeasonResponse> {
    return withActionState(createTeamState, async () => {
      const result = await unwrapApi(api.POST('/v1/league-seasons/{season_id}/teams', {
        params: { path: { season_id: seasonId } },
        body: teamData,
      }))
      const created = result.data
      currentTeam.value = created.team
      currentTeamSeason.value = created.team_season
      return created
    }, 'Failed to create team')
  }

  async function updateTeam(teamId: string, teamData: UpdateLeagueTeamRequest): Promise<LeagueTeamResponse> {
    return withActionState(updateTeamState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/league-teams/{team_id}', {
        params: { path: { team_id: teamId } },
        body: teamData,
      }))
      currentTeam.value = result.data
      return currentTeam.value
    }, 'Failed to update team')
  }

  // P-62: transfer team ownership. The endpoint has existed (and been
  // e2e-proven) since before the frontend had any consumer for it —
  // `team-roster.spec.ts` drove it over raw `fetch` precisely because no store
  // action wrapped it. Authorization is the SERVICE-level owner check
  // (`LeagueTeamService::transfer_ownership`), not an RBAC permission, so the
  // UI gate is `team.owner_player_id === authStore.playerId`.
  const transferOwnershipState = createActionState()
  async function transferOwnership(teamId: string, newOwnerPlayerId: string): Promise<LeagueTeamResponse> {
    return withActionState(transferOwnershipState, async () => {
      const result = await unwrapApi(api.POST('/v1/league-teams/{team_id}/transfer-ownership', {
        params: { path: { team_id: teamId } },
        body: { new_owner_player_id: newOwnerPlayerId },
      }))
      currentTeam.value = result.data
      return currentTeam.value
    }, 'Failed to transfer team ownership')
  }

  // P-63: disband a team. `DELETE /v1/league-teams/{team_id}` returns 204 with
  // no body and flips `league_teams.status` to `disbanded` — it is a soft
  // terminal state, not a row deletion, so the team keeps its history. Local
  // state is pruned everywhere the disbanded team could still be rendered.
  const disbandTeamState = createActionState()
  async function disbandTeam(teamId: string): Promise<void> {
    return withActionState(disbandTeamState, async () => {
      await unwrapApi(api.DELETE('/v1/league-teams/{team_id}', {
        params: { path: { team_id: teamId } },
      }))
      if (currentTeam.value?.id === teamId) {
        currentTeam.value = null
        currentTeamSeason.value = null
        members.value = []
        invitations.value = []
      }
      teams.value = teams.value.filter(t => t.team_id !== teamId)
      myTeams.value = myTeams.value.filter(t => t.team_id !== teamId)
    }, 'Failed to disband team')
  }

  // ==================== Team Season Registration ====================

  async function registerTeamForSeason(seasonId: string, teamId: string): Promise<LeagueTeamSeasonResponse> {
    return withActionState(registerTeamForSeasonState, async () => {
      const result = await unwrapApi(api.POST('/v1/league-seasons/{season_id}/teams/register', {
        params: { path: { season_id: seasonId } },
        body: { team_id: teamId },
      }))
      currentTeamSeason.value = result.data
      return currentTeamSeason.value
    }, 'Failed to register team for season')
  }

  // ==================== Roster Management ====================

  async function fetchMembers(teamSeasonId: string): Promise<LeagueTeamMemberWithPlayer[]> {
    return withActionState(fetchMembersState, async () => {
      const result = await unwrapApi(api.GET('/v1/league-team-seasons/{team_season_id}/members', {
        params: { path: { team_season_id: teamSeasonId } },
      }))
      members.value = result.data
      return members.value
    }, 'Failed to fetch team members')
  }

  async function addMember(teamSeasonId: string, memberData: AddLeagueTeamMemberRequest): Promise<void> {
    return withActionState(addMemberState, async () => {
      await unwrapApi(api.POST('/v1/league-team-seasons/{team_season_id}/members', {
        params: { path: { team_season_id: teamSeasonId } },
        body: memberData,
      }))
      // Refresh members list
      await fetchMembers(teamSeasonId)
    }, 'Failed to add team member')
  }

  async function removeMember(teamSeasonId: string, playerId: string): Promise<void> {
    return withActionState(removeMemberState, async () => {
      await unwrapApi(api.DELETE('/v1/league-team-seasons/{team_season_id}/members/{player_id}', {
        params: { path: { team_season_id: teamSeasonId, player_id: playerId } },
      }))
      members.value = members.value.filter(m => m.player_id !== playerId)
    }, 'Failed to remove team member')
  }

  async function promoteToCaptain(teamSeasonId: string, playerId: string): Promise<void> {
    return withActionState(promoteToCaptainState, async () => {
      await unwrapApi(api.POST('/v1/league-team-seasons/{team_season_id}/members/{player_id}/promote', {
        params: { path: { team_season_id: teamSeasonId, player_id: playerId } },
      }))
      // Update member role in local state
      members.value = members.value.map(m =>
        m.player_id === playerId ? { ...m, role: 'captain' } : m
      )
    }, 'Failed to promote member')
  }

  async function demoteFromCaptain(teamSeasonId: string, playerId: string): Promise<void> {
    return withActionState(demoteFromCaptainState, async () => {
      await unwrapApi(api.POST('/v1/league-team-seasons/{team_season_id}/members/{player_id}/demote', {
        params: { path: { team_season_id: teamSeasonId, player_id: playerId } },
      }))
      // Update member role in local state
      members.value = members.value.map(m =>
        m.player_id === playerId ? { ...m, role: 'player' } : m
      )
    }, 'Failed to demote member')
  }

  // ==================== Invitations ====================

  async function fetchTeamInvitations(teamSeasonId: string): Promise<LeagueTeamInvitationResponse[]> {
    return withActionState(fetchTeamInvitationsState, async () => {
      const result = await unwrapApi(api.GET('/v1/league-team-seasons/{team_season_id}/invitations', {
        params: { path: { team_season_id: teamSeasonId } },
      }))
      invitations.value = result.data
      return invitations.value
    }, 'Failed to fetch team invitations')
  }

  async function invitePlayer(teamSeasonId: string, inviteData: InviteToLeagueTeamRequest): Promise<LeagueTeamInvitationResponse> {
    return withActionState(invitePlayerState, async () => {
      const result = await unwrapApi(api.POST('/v1/league-team-seasons/{team_season_id}/invitations', {
        params: { path: { team_season_id: teamSeasonId } },
        body: inviteData,
      }))
      const newInvitation = result.data
      invitations.value = [...invitations.value, newInvitation]
      return newInvitation
    }, 'Failed to invite player')
  }

  async function cancelInvitation(invitationId: string): Promise<void> {
    return withActionState(cancelInvitationState, async () => {
      await unwrapApi(api.DELETE('/v1/league-team-invitations/{invitation_id}', {
        params: { path: { invitation_id: invitationId } },
      }))
      invitations.value = invitations.value.filter(i => i.id !== invitationId)
    }, 'Failed to cancel invitation')
  }

  // Captain/admin-side acceptance of a pending team application.
  // Hits the same endpoint as accepting your own invitation but does not touch
  // myInvitations — the accepter is not the invitee. Both sides of the
  // backend's accept endpoint converge here.
  const acceptApplicationState = createActionState()
  async function acceptApplication(invitationId: string): Promise<void> {
    return withActionState(acceptApplicationState, async () => {
      await unwrapApi(api.POST('/v1/league-team-invitations/{invitation_id}/accept', {
        params: { path: { invitation_id: invitationId } },
      }))
      invitations.value = invitations.value.filter(i => i.id !== invitationId)
    }, 'Failed to accept application')
  }

  // Captain/admin-side decline of a pending team join REQUEST (P-49). The
  // backend's decline endpoint authorizes a captain for `request`-type rows
  // (invitation.rs decline_invitation), same as accept. Distinct from
  // `declineInvitation`, which is the invitee declining their own invite and
  // updates `myInvitations`; this updates the team-facing `invitations` list.
  const declineApplicationState = createActionState()
  async function declineApplication(invitationId: string, message?: string): Promise<void> {
    return withActionState(declineApplicationState, async () => {
      await unwrapApi(api.POST('/v1/league-team-invitations/{invitation_id}/decline', {
        params: { path: { invitation_id: invitationId } },
        body: { message: message ?? null },
      }))
      invitations.value = invitations.value.filter(i => i.id !== invitationId)
    }, 'Failed to decline application')
  }

  // ==================== Viewed Player's Data ====================

  async function fetchPlayerLeagueTeams(playerId: string): Promise<PlayerLeagueTeamMembershipResponse[]> {
    return withActionState(fetchPlayerLeagueTeamsState, async () => {
      const result = await unwrapApi(api.GET('/v1/players/{player_id}/league-teams', {
        params: { path: { player_id: playerId } },
      }))
      viewedPlayerTeams.value = result.data
      return viewedPlayerTeams.value
    }, 'Failed to fetch player teams')
  }

  // ==================== Current Player's Data ====================

  async function fetchMyTeams(): Promise<PlayerLeagueTeamMembershipResponse[]> {
    return withActionState(fetchMyTeamsState, async () => {
      const result = await unwrapApi(api.GET('/v1/players/me/league-teams'))
      myTeams.value = result.data
      return myTeams.value
    }, 'Failed to fetch my teams')
  }

  async function fetchMyInvitations(): Promise<LeagueTeamInvitationWithTeamResponse[]> {
    return withActionState(fetchMyInvitationsState, async () => {
      const result = await unwrapApi(api.GET('/v1/league-team-invitations/me'))
      myInvitations.value = result.data
      return myInvitations.value
    }, 'Failed to fetch my invitations')
  }

  async function acceptInvitation(invitationId: string): Promise<void> {
    return withActionState(acceptInvitationState, async () => {
      await unwrapApi(api.POST('/v1/league-team-invitations/{invitation_id}/accept', {
        params: { path: { invitation_id: invitationId } },
      }))
      // Remove from my invitations
      myInvitations.value = myInvitations.value.filter(i => i.id !== invitationId)
      // Refresh my teams
      await fetchMyTeams()
    }, 'Failed to accept invitation')
  }

  async function declineInvitation(invitationId: string, message?: string): Promise<void> {
    return withActionState(declineInvitationState, async () => {
      await unwrapApi(api.POST('/v1/league-team-invitations/{invitation_id}/decline', {
        params: { path: { invitation_id: invitationId } },
        body: { message: message ?? null },
      }))
      myInvitations.value = myInvitations.value.filter(i => i.id !== invitationId)
    }, 'Failed to decline invitation')
  }

  async function leaveTeam(teamSeasonId: string): Promise<void> {
    return withActionState(leaveTeamState, async () => {
      await unwrapApi(api.POST('/v1/league-team-seasons/{team_season_id}/leave', {
        params: { path: { team_season_id: teamSeasonId } },
      }))
      // Remove from my teams
      myTeams.value = myTeams.value.filter(t => t.team_season_id !== teamSeasonId)
    }, 'Failed to leave team')
  }

  // ==================== Team Applications ====================

  const applyToTeamState = createActionState()

  async function applyToTeam(teamSeasonId: string, message?: string): Promise<void> {
    return withActionState(applyToTeamState, async () => {
      await unwrapApi(api.POST('/v1/league-team-seasons/{team_season_id}/apply', {
        params: { path: { team_season_id: teamSeasonId } },
        body: { message: message ?? null },
      }))
    }, 'Failed to apply to team')
  }

  // ==================== Utility ====================

  function clearCurrent() {
    currentTeam.value = null
    currentTeamSeason.value = null
    members.value = []
    invitations.value = []
  }

  function clearTeams() {
    teams.value = []
  }

  return {
    // State
    teams,
    currentTeam,
    currentTeamSeason,
    members,
    invitations,
    myTeams,
    myInvitations,
    viewedPlayerTeams,
    loading,
    error,
    pagination,

    // Team CRUD
    fetchTeamsInSeason,
    fetchTeam,
    createTeam,
    updateTeam,
    transferOwnership,
    disbandTeam,

    // Season registration
    registerTeamForSeason,

    // Roster management
    fetchMembers,
    addMember,
    removeMember,
    promoteToCaptain,
    demoteFromCaptain,

    // Invitations
    fetchTeamInvitations,
    invitePlayer,
    cancelInvitation,
    acceptApplication,
    acceptApplicationState,
    declineApplication,
    declineApplicationState,

    // Viewed player
    fetchPlayerLeagueTeams,

    // Current player
    fetchMyTeams,
    fetchMyInvitations,
    acceptInvitation,
    declineInvitation,
    leaveTeam,

    // Team Applications
    applyToTeam,
    applyToTeamState,

    // Utility
    clearCurrent,
    clearTeams,

    // Per-action states
    fetchTeamsInSeasonState,
    fetchTeamState,
    createTeamState,
    updateTeamState,
    transferOwnershipState,
    disbandTeamState,
    registerTeamForSeasonState,
    fetchMembersState,
    addMemberState,
    removeMemberState,
    promoteToCaptainState,
    demoteFromCaptainState,
    fetchTeamInvitationsState,
    invitePlayerState,
    cancelInvitationState,
    fetchPlayerLeagueTeamsState,
    fetchMyTeamsState,
    fetchMyInvitationsState,
    acceptInvitationState,
    declineInvitationState,
    leaveTeamState,
  }
})

// Re-export types for convenience
export type {
  LeagueTeamResponse,
  LeagueTeamSummaryResponse,
  LeagueTeamSeasonResponse,
  LeagueTeamWithSeasonResponse,
  LeagueTeamMemberWithPlayer,
  LeagueTeamInvitationResponse,
  LeagueTeamInvitationWithTeamResponse,
  PlayerLeagueTeamMembershipResponse,
  CreateLeagueTeamRequest,
  UpdateLeagueTeamRequest,
  AddLeagueTeamMemberRequest,
  InviteToLeagueTeamRequest,
}
