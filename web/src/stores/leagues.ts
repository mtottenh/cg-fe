import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, createLatestGuard } from '@/stores/helpers'
import { replaceById } from '@/utils/collections'

// Use generated types
type LeagueResponse = components['schemas']['LeagueResponse']
type CreateLeagueRequest = components['schemas']['CreateLeagueRequest']
type UpdateLeagueRequest = components['schemas']['UpdateLeagueRequest']
type UserLeagueMembership = components['schemas']['UserLeagueMembershipResponse']
type PaginationMeta = components['schemas']['PaginationMeta']
type LeagueMemberResponse = components['schemas']['LeagueMemberResponse']
type LeagueInvitationResponse = components['schemas']['LeagueInvitationResponse']

export const useLeaguesStore = defineStore('leagues', () => {
  const leagues = ref<LeagueResponse[]>([])
  const currentLeague = ref<LeagueResponse | null>(null)
  const myLeagues = ref<UserLeagueMembership[]>([])
  const members = ref<LeagueMemberResponse[]>([])
  const myLeagueInvitations = ref<LeagueInvitationResponse[]>([])
  const myApplications = ref<LeagueInvitationResponse[]>([])
  const applications = ref<LeagueInvitationResponse[]>([])
  const leagueInvitations = ref<LeagueInvitationResponse[]>([])
  const loading = computed(() => fetchLeaguesState.loading)
  const error = computed({
    get: () => fetchLeaguesState.error,
    set: (val: string | null) => { fetchLeaguesState.error = val },
  })
  const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  // Per-action states
  const fetchLeaguesState = createActionState()
  const fetchLeagueState = createActionState()
  const fetchLeagueBySlugState = createActionState()
  const createLeagueState = createActionState()
  const updateLeagueState = createActionState()
  const fetchMyLeaguesState = createActionState()
  const joinLeagueState = createActionState()
  const leaveLeagueState = createActionState()
  const applyToLeagueState = createActionState()
  const fetchMembersState = createActionState()
  const updateMemberRoleState = createActionState()
  const removeMemberState = createActionState()
  const fetchMyLeagueInvitationsState = createActionState()
  const acceptLeagueInvitationState = createActionState()
  const declineLeagueInvitationState = createActionState()
  const fetchMyApplicationsState = createActionState()
  const fetchApplicationsState = createActionState()
  const approveApplicationState = createActionState()
  const rejectApplicationState = createActionState()
  const fetchLeagueInvitationsState = createActionState()
  const sendInvitationState = createActionState()

  async function fetchLeagues(page = 1, perPage = 20, gameId?: string, search?: string): Promise<LeagueResponse[]> {
    return withActionState(fetchLeaguesState, async () => {
      const result = await unwrapApi(api.GET('/v1/leagues', {
        params: { query: { page, per_page: perPage, game_id: gameId, search } },
      }))
      leagues.value = result.data
      pagination.value = result.pagination
      return leagues.value
    }, 'Failed to fetch leagues')
  }

  // Shared guard: both fetchers write `currentLeague` — latest wins.
  const beginCurrentLeagueFetch = createLatestGuard()

  async function fetchLeague(leagueId: string): Promise<LeagueResponse> {
    return withActionState(fetchLeagueState, async () => {
      const isCurrent = beginCurrentLeagueFetch()
      const result = await unwrapApi(api.GET('/v1/leagues/{league_id}', {
        params: { path: { league_id: leagueId } },
      }))
      if (isCurrent()) currentLeague.value = result.data
      return result.data
    }, 'Failed to fetch league')
  }

  async function fetchLeagueBySlug(slug: string): Promise<LeagueResponse> {
    return withActionState(fetchLeagueBySlugState, async () => {
      const isCurrent = beginCurrentLeagueFetch()
      const result = await unwrapApi(api.GET('/v1/leagues/by-slug/{slug}', {
        params: { path: { slug } },
      }))
      if (isCurrent()) currentLeague.value = result.data
      return result.data
    }, 'Failed to fetch league')
  }

  async function createLeague(leagueData: CreateLeagueRequest): Promise<LeagueResponse> {
    return withActionState(createLeagueState, async () => {
      const result = await unwrapApi(api.POST('/v1/leagues', {
        body: leagueData,
      }))
      const newLeague = result.data
      leagues.value = [...leagues.value, newLeague]
      currentLeague.value = newLeague
      return newLeague
    }, 'Failed to create league')
  }

  async function updateLeague(leagueId: string, leagueData: UpdateLeagueRequest): Promise<LeagueResponse> {
    return withActionState(updateLeagueState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/leagues/{league_id}', {
        params: { path: { league_id: leagueId } },
        body: leagueData,
      }))
      const updatedLeague = result.data
      replaceById(leagues.value, updatedLeague)
      currentLeague.value = updatedLeague
      return updatedLeague
    }, 'Failed to update league')
  }

  async function fetchMyLeagues(): Promise<UserLeagueMembership[]> {
    return withActionState(fetchMyLeaguesState, async () => {
      const result = await unwrapApi(api.GET('/v1/users/me/leagues'))
      myLeagues.value = result
      return myLeagues.value
    }, 'Failed to fetch my leagues')
  }

  async function joinLeague(leagueId: string): Promise<void> {
    return withActionState(joinLeagueState, async () => {
      await unwrapApi(api.POST('/v1/leagues/{league_id}/join', {
        params: { path: { league_id: leagueId } },
      }))
      await fetchMyLeagues()
    }, 'Failed to join league')
  }

  async function leaveLeague(leagueId: string): Promise<void> {
    return withActionState(leaveLeagueState, async () => {
      await unwrapApi(api.POST('/v1/leagues/{league_id}/leave', {
        params: { path: { league_id: leagueId } },
      }))
      myLeagues.value = myLeagues.value.filter(m => m.league_id !== leagueId)
    }, 'Failed to leave league')
  }

  // ==================== Applications ====================

  async function applyToLeague(leagueId: string, message?: string): Promise<void> {
    return withActionState(applyToLeagueState, async () => {
      await unwrapApi(api.POST('/v1/leagues/{league_id}/apply', {
        params: { path: { league_id: leagueId } },
        body: { message: message ?? null },
      }))
      // Refresh applications to show pending state
      await fetchMyApplications()
    }, 'Failed to apply to league')
  }

  // ==================== Player League Invitations & Applications ====================

  async function fetchMyLeagueInvitations(): Promise<LeagueInvitationResponse[]> {
    return withActionState(fetchMyLeagueInvitationsState, async () => {
      const result = await unwrapApi(api.GET('/v1/users/me/league-invitations'))
      myLeagueInvitations.value = result.filter(i => i.invitation_type === 'invite' && i.status === 'pending')
      myApplications.value = result.filter(i => i.invitation_type === 'application' && i.status === 'pending')
      return result
    }, 'Failed to fetch league invitations')
  }

  async function fetchMyApplications(): Promise<LeagueInvitationResponse[]> {
    // Reuses the same endpoint, just filters differently
    await fetchMyLeagueInvitations()
    return myApplications.value
  }

  function hasPendingApplicationForLeague(leagueId: string): boolean {
    return myApplications.value.some(a => a.league_id === leagueId)
  }

  async function acceptLeagueInvitation(invitationId: string): Promise<void> {
    return withActionState(acceptLeagueInvitationState, async () => {
      await unwrapApi(api.POST('/v1/league-invitations/{invitation_id}/accept', {
        params: { path: { invitation_id: invitationId } },
      }))
      myLeagueInvitations.value = myLeagueInvitations.value.filter(i => i.id !== invitationId)
      await fetchMyLeagues()
    }, 'Failed to accept league invitation')
  }

  async function declineLeagueInvitation(invitationId: string): Promise<void> {
    return withActionState(declineLeagueInvitationState, async () => {
      await unwrapApi(api.POST('/v1/league-invitations/{invitation_id}/decline', {
        params: { path: { invitation_id: invitationId } },
      }))
      myLeagueInvitations.value = myLeagueInvitations.value.filter(i => i.id !== invitationId)
    }, 'Failed to decline league invitation')
  }

  // ==================== Admin: Applications & Invitations ====================

  async function fetchApplications(leagueId: string): Promise<LeagueInvitationResponse[]> {
    return withActionState(fetchApplicationsState, async () => {
      // Endpoint returns the array directly, not wrapped in a DataResponse envelope.
      const result = await unwrapApi(api.GET('/v1/leagues/{league_id}/applications', {
        params: { path: { league_id: leagueId } },
      }))
      applications.value = result
      return applications.value
    }, 'Failed to fetch applications')
  }

  async function approveApplication(leagueId: string, applicationId: string): Promise<void> {
    return withActionState(approveApplicationState, async () => {
      await unwrapApi(api.POST('/v1/leagues/{league_id}/applications/{application_id}/approve', {
        params: { path: { league_id: leagueId, application_id: applicationId } },
      }))
      applications.value = applications.value.filter(a => a.id !== applicationId)
    }, 'Failed to approve application')
  }

  async function rejectApplication(leagueId: string, applicationId: string): Promise<void> {
    return withActionState(rejectApplicationState, async () => {
      await unwrapApi(api.POST('/v1/leagues/{league_id}/applications/{application_id}/reject', {
        params: { path: { league_id: leagueId, application_id: applicationId } },
      }))
      applications.value = applications.value.filter(a => a.id !== applicationId)
    }, 'Failed to reject application')
  }

  async function fetchLeagueInvitationsAdmin(leagueId: string): Promise<LeagueInvitationResponse[]> {
    return withActionState(fetchLeagueInvitationsState, async () => {
      // Endpoint returns the array directly, not wrapped in a DataResponse envelope.
      const result = await unwrapApi(api.GET('/v1/leagues/{league_id}/invitations', {
        params: { path: { league_id: leagueId } },
      }))
      leagueInvitations.value = result
      return leagueInvitations.value
    }, 'Failed to fetch league invitations')
  }

  async function sendInvitation(leagueId: string, userId: string): Promise<void> {
    return withActionState(sendInvitationState, async () => {
      await unwrapApi(api.POST('/v1/leagues/{league_id}/invitations', {
        params: { path: { league_id: leagueId } },
        body: { user_id: userId },
      }))
    }, 'Failed to send invitation')
  }

  // ==================== Member Management ====================

  async function fetchMembers(leagueId: string): Promise<LeagueMemberResponse[]> {
    return withActionState(fetchMembersState, async () => {
      // Endpoint returns the array directly, not wrapped in a DataResponse envelope.
      const result = await unwrapApi(api.GET('/v1/leagues/{league_id}/members', {
        params: { path: { league_id: leagueId } },
      }))
      members.value = result
      return members.value
    }, 'Failed to fetch league members')
  }

  /**
   * Update a league member's role. The backend field is `membership_type`; the
   * parameter name stays `role` for the store's public API because that's the
   * UI-facing concept (the modal passes 'admin'/'moderator'/'member' strings).
   */
  async function updateMemberRole(leagueId: string, userId: string, role: string): Promise<void> {
    return withActionState(updateMemberRoleState, async () => {
      await unwrapApi(api.PATCH('/v1/leagues/{league_id}/members/{user_id}', {
        params: { path: { league_id: leagueId, user_id: userId } },
        body: { membership_type: role },
      }))
      const member = members.value.find(m => m.user_id === userId)
      if (member) member.membership_type = role
    }, 'Failed to update member role')
  }

  async function removeMember(leagueId: string, userId: string): Promise<void> {
    return withActionState(removeMemberState, async () => {
      await unwrapApi(api.DELETE('/v1/leagues/{league_id}/members/{user_id}', {
        params: { path: { league_id: leagueId, user_id: userId } },
      }))
      members.value = members.value.filter(m => m.user_id !== userId)
    }, 'Failed to remove league member')
  }

  function clearCurrent() {
    currentLeague.value = null
    members.value = []
    applications.value = []
    leagueInvitations.value = []
  }

  return {
    leagues,
    currentLeague,
    myLeagues,
    members,
    loading,
    error,
    pagination,
    fetchLeagues,
    fetchLeague,
    fetchLeagueBySlug,
    createLeague,
    updateLeague,
    fetchMyLeagues,
    joinLeague,
    leaveLeague,
    applyToLeague,
    // Player invitations & applications
    myLeagueInvitations,
    myApplications,
    fetchMyLeagueInvitations,
    fetchMyApplications,
    hasPendingApplicationForLeague,
    acceptLeagueInvitation,
    declineLeagueInvitation,
    // Admin: applications & invitations
    applications,
    leagueInvitations,
    fetchApplications,
    approveApplication,
    rejectApplication,
    fetchLeagueInvitationsAdmin,
    sendInvitation,
    // Member management
    fetchMembers,
    updateMemberRole,
    removeMember,
    clearCurrent,
    // Per-action states
    fetchLeaguesState,
    fetchLeagueState,
    fetchLeagueBySlugState,
    createLeagueState,
    updateLeagueState,
    fetchMyLeaguesState,
    joinLeagueState,
    leaveLeagueState,
    applyToLeagueState,
    fetchMembersState,
    updateMemberRoleState,
    removeMemberState,
    fetchMyLeagueInvitationsState,
    acceptLeagueInvitationState,
    declineLeagueInvitationState,
    fetchMyApplicationsState,
    fetchApplicationsState,
    approveApplicationState,
    rejectApplicationState,
    fetchLeagueInvitationsState,
    sendInvitationState,
  }
})

// Re-export types for convenience
export type { LeagueResponse, CreateLeagueRequest, UpdateLeagueRequest, UserLeagueMembership, LeagueInvitationResponse, LeagueMemberResponse }
