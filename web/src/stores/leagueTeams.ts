import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

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
type ApiErrorResponse = components['schemas']['ApiError']

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

  // State
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  // ==================== Team CRUD ====================

  async function fetchTeamsInSeason(seasonId: string, page = 1, perPage = 20): Promise<LeagueTeamSummaryResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/league-seasons/{season_id}/teams', {
        params: { path: { season_id: seasonId }, query: { page, per_page: perPage } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      teams.value = data!.data
      pagination.value = data!.pagination
      return teams.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch teams'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchTeam(teamId: string): Promise<LeagueTeamResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/league-teams/{team_id}', {
        params: { path: { team_id: teamId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentTeam.value = data!.data
      return currentTeam.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch team'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createTeam(seasonId: string, teamData: CreateLeagueTeamRequest): Promise<LeagueTeamWithSeasonResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/league-seasons/{season_id}/teams', {
        params: { path: { season_id: seasonId } },
        body: teamData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const result = data!.data
      currentTeam.value = result.team
      currentTeamSeason.value = result.team_season
      return result
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to create team'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateTeam(teamId: string, teamData: UpdateLeagueTeamRequest): Promise<LeagueTeamResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.PATCH('/v1/league-teams/{team_id}', {
        params: { path: { team_id: teamId } },
        body: teamData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentTeam.value = data!.data
      return currentTeam.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to update team'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // ==================== Team Season Registration ====================

  async function registerTeamForSeason(seasonId: string, teamId: string): Promise<LeagueTeamSeasonResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/league-seasons/{season_id}/teams/register', {
        params: { path: { season_id: seasonId } },
        body: { team_id: teamId },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentTeamSeason.value = data!.data
      return currentTeamSeason.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to register team for season'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // ==================== Roster Management ====================

  async function fetchMembers(teamSeasonId: string): Promise<LeagueTeamMemberWithPlayer[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/league-team-seasons/{team_season_id}/members', {
        params: { path: { team_season_id: teamSeasonId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      members.value = data!.data
      return members.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch team members'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function addMember(teamSeasonId: string, memberData: AddLeagueTeamMemberRequest): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.POST('/v1/league-team-seasons/{team_season_id}/members', {
        params: { path: { team_season_id: teamSeasonId } },
        body: memberData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      // Refresh members list
      await fetchMembers(teamSeasonId)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to add team member'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function removeMember(teamSeasonId: string, playerId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.DELETE('/v1/league-team-seasons/{team_season_id}/members/{player_id}', {
        params: { path: { team_season_id: teamSeasonId, player_id: playerId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      members.value = members.value.filter(m => m.player_id !== playerId)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to remove team member'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function promoteToCaptain(teamSeasonId: string, playerId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.POST('/v1/league-team-seasons/{team_season_id}/members/{player_id}/promote', {
        params: { path: { team_season_id: teamSeasonId, player_id: playerId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      // Update member role in local state
      const member = members.value.find(m => m.player_id === playerId)
      if (member) {
        member.role = 'captain'
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to promote member'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function demoteFromCaptain(teamSeasonId: string, playerId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.POST('/v1/league-team-seasons/{team_season_id}/members/{player_id}/demote', {
        params: { path: { team_season_id: teamSeasonId, player_id: playerId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      // Update member role in local state
      const member = members.value.find(m => m.player_id === playerId)
      if (member) {
        member.role = 'player'
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to demote member'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // ==================== Invitations ====================

  async function fetchTeamInvitations(teamSeasonId: string): Promise<LeagueTeamInvitationResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/league-team-seasons/{team_season_id}/invitations', {
        params: { path: { team_season_id: teamSeasonId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      invitations.value = data!.data
      return invitations.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch team invitations'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function invitePlayer(teamSeasonId: string, inviteData: InviteToLeagueTeamRequest): Promise<LeagueTeamInvitationResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/league-team-seasons/{team_season_id}/invitations', {
        params: { path: { team_season_id: teamSeasonId } },
        body: inviteData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const newInvitation = data!.data
      invitations.value = [...invitations.value, newInvitation]
      return newInvitation
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to invite player'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function cancelInvitation(invitationId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.DELETE('/v1/league-team-invitations/{invitation_id}', {
        params: { path: { invitation_id: invitationId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      invitations.value = invitations.value.filter(i => i.id !== invitationId)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to cancel invitation'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // ==================== Current Player's Data ====================

  async function fetchMyTeams(): Promise<PlayerLeagueTeamMembershipResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/players/me/league-teams')

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      myTeams.value = data!.data
      return myTeams.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch my teams'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMyInvitations(): Promise<LeagueTeamInvitationWithTeamResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/league-team-invitations/me')

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      myInvitations.value = data!.data
      return myInvitations.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch my invitations'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function acceptInvitation(invitationId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.POST('/v1/league-team-invitations/{invitation_id}/accept', {
        params: { path: { invitation_id: invitationId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      // Remove from my invitations
      myInvitations.value = myInvitations.value.filter(i => i.id !== invitationId)
      // Refresh my teams
      await fetchMyTeams()
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to accept invitation'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function declineInvitation(invitationId: string, message?: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.POST('/v1/league-team-invitations/{invitation_id}/decline', {
        params: { path: { invitation_id: invitationId } },
        body: { message: message ?? null },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      myInvitations.value = myInvitations.value.filter(i => i.id !== invitationId)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to decline invitation'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function leaveTeam(teamSeasonId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.POST('/v1/league-team-seasons/{team_season_id}/leave', {
        params: { path: { team_season_id: teamSeasonId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      // Remove from my teams
      myTeams.value = myTeams.value.filter(t => t.team_season_id !== teamSeasonId)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to leave team'
      }
      throw e
    } finally {
      loading.value = false
    }
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
