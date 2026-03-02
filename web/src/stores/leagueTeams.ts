import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

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

  // Shared state (kept for backward compatibility)
  const loading = ref(false)
  const error = ref<string | null>(null)
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

  async function fetchTeam(teamId: string): Promise<LeagueTeamResponse> {
    return withActionState(fetchTeamState, async () => {
      const result = await unwrapApi(api.GET('/v1/league-teams/{team_id}', {
        params: { path: { team_id: teamId } },
      }))
      currentTeam.value = result.data
      return currentTeam.value
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
      const member = members.value.find(m => m.player_id === playerId)
      if (member) {
        member.role = 'captain'
      }
    }, 'Failed to promote member')
  }

  async function demoteFromCaptain(teamSeasonId: string, playerId: string): Promise<void> {
    return withActionState(demoteFromCaptainState, async () => {
      await unwrapApi(api.POST('/v1/league-team-seasons/{team_season_id}/members/{player_id}/demote', {
        params: { path: { team_season_id: teamSeasonId, player_id: playerId } },
      }))
      // Update member role in local state
      const member = members.value.find(m => m.player_id === playerId)
      if (member) {
        member.role = 'player'
      }
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
    loading,
    error,
    pagination,

    // Team CRUD
    fetchTeamsInSeason,
    fetchTeam,
    createTeam,
    updateTeam,

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

    // Current player
    fetchMyTeams,
    fetchMyInvitations,
    acceptInvitation,
    declineInvitation,
    leaveTeam,

    // Utility
    clearCurrent,
    clearTeams,

    // Per-action states
    fetchTeamsInSeasonState,
    fetchTeamState,
    createTeamState,
    updateTeamState,
    registerTeamForSeasonState,
    fetchMembersState,
    addMemberState,
    removeMemberState,
    promoteToCaptainState,
    demoteFromCaptainState,
    fetchTeamInvitationsState,
    invitePlayerState,
    cancelInvitationState,
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
