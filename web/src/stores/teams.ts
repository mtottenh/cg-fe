import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * @deprecated The old standalone team system has been replaced with league teams.
 * Teams are now created within leagues and managed through league-team endpoints.
 * Use the admin league management UI for team operations.
 *
 * This store is kept as a stub for backwards compatibility but does not function.
 */

// Stub types for backwards compatibility
interface Team {
  id: string
  name: string
  tag: string
  description?: string | null
  logo_url?: string | null
  banner_url?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  status: string
  created_at: string
  updated_at: string
}

interface TeamMember {
  player_id: string
  display_name: string
  avatar_url?: string | null
  role: string
  joined_at: string
}

interface CreateTeamRequest {
  name: string
  tag: string
  description?: string
  primary_color?: string
  secondary_color?: string
  logo_url?: string
}

interface UpdateTeamRequest {
  name?: string
  tag?: string
  description?: string
  primary_color?: string
  secondary_color?: string
  logo_url?: string
}

interface PaginationMeta {
  page: number
  per_page: number
  total_items: number
  total_pages: number
}

export const useTeamsStore = defineStore('teams', () => {
  const teams = ref<Team[]>([])
  const currentTeam = ref<Team | null>(null)
  const members = ref<TeamMember[]>([])
  const loading = ref(false)
  const error = ref<string | null>('The standalone team system has been deprecated. Teams are now managed through leagues.')
  const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  async function fetchTeams(_page = 1, _perPage = 20): Promise<Team[]> {
    console.warn('[DEPRECATED] useTeamsStore.fetchTeams - Teams are now managed through leagues')
    error.value = 'Teams are now managed through leagues. Please use the league management UI.'
    return []
  }

  async function fetchTeam(_id: string): Promise<Team | null> {
    console.warn('[DEPRECATED] useTeamsStore.fetchTeam - Teams are now managed through leagues')
    error.value = 'Teams are now managed through leagues. Please use the league management UI.'
    return null
  }

  async function fetchMembers(_teamId: string): Promise<TeamMember[]> {
    console.warn('[DEPRECATED] useTeamsStore.fetchMembers - Teams are now managed through leagues')
    error.value = 'Teams are now managed through leagues. Please use the league management UI.'
    return []
  }

  async function createTeam(_teamData: CreateTeamRequest): Promise<Team | null> {
    console.warn('[DEPRECATED] useTeamsStore.createTeam - Teams are now managed through leagues')
    error.value = 'Teams are now managed through leagues. Please use the league management UI.'
    return null
  }

  async function updateTeam(_id: string, _teamData: UpdateTeamRequest): Promise<Team | null> {
    console.warn('[DEPRECATED] useTeamsStore.updateTeam - Teams are now managed through leagues')
    error.value = 'Teams are now managed through leagues. Please use the league management UI.'
    return null
  }

  async function updateMemberRole(_teamId: string, _playerId: string, _role: string): Promise<TeamMember | null> {
    console.warn('[DEPRECATED] useTeamsStore.updateMemberRole - Teams are now managed through leagues')
    error.value = 'Teams are now managed through leagues. Please use the league management UI.'
    return null
  }

  async function removeMember(_teamId: string, _playerId: string): Promise<void> {
    console.warn('[DEPRECATED] useTeamsStore.removeMember - Teams are now managed through leagues')
    error.value = 'Teams are now managed through leagues. Please use the league management UI.'
  }

  async function leaveTeam(_teamId: string): Promise<void> {
    console.warn('[DEPRECATED] useTeamsStore.leaveTeam - Teams are now managed through leagues')
    error.value = 'Teams are now managed through leagues. Please use the league management UI.'
  }

  return {
    teams,
    currentTeam,
    members,
    loading,
    error,
    pagination,
    fetchTeams,
    fetchTeam,
    fetchMembers,
    createTeam,
    updateTeam,
    updateMemberRole,
    removeMember,
    leaveTeam,
  }
})

// Re-export types for convenience
export type { Team, TeamMember, CreateTeamRequest, UpdateTeamRequest }
