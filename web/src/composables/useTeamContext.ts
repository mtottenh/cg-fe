import { computed, type Ref } from 'vue'
import { useLeagueTeamsStore, type PlayerLeagueTeamMembershipResponse } from '@/stores/leagueTeams'

/**
 * Reactive context for the current user's relationship to a specific team season.
 * Purely reactive — callers must ensure `leagueTeamsStore.fetchMyTeams()` has been called.
 */
export function useTeamContext(teamSeasonId: Ref<string | null>) {
  const leagueTeamsStore = useLeagueTeamsStore()

  const myMembership = computed((): PlayerLeagueTeamMembershipResponse | null => {
    if (!teamSeasonId.value) return null
    return leagueTeamsStore.myTeams.find(t => t.team_season_id === teamSeasonId.value) ?? null
  })

  const isMember = computed(() => !!myMembership.value)
  const role = computed(() => myMembership.value?.role ?? null)
  const isCaptain = computed(() => role.value === 'captain')
  const isManager = computed(() => role.value === 'manager')
  const isLeadership = computed(() => isCaptain.value || isManager.value)

  return {
    myMembership,
    isMember,
    role,
    isCaptain,
    isManager,
    isLeadership,
  }
}
