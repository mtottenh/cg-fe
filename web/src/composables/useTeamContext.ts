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

  // P-112 surfaced this: `isManager` compared `role` to `'manager'`, and
  // `LeagueTeamRole` is `captain | player | substitute` — there is no manager
  // role on a league team and never has been. So `isManager` was permanently
  // `false` and `isLeadership` was a synonym for `isCaptain` that merely LOOKED
  // broader. Neither had a consumer, so nothing shipped wrong; had one been
  // wired, every manager-gated control would have been invisible with no error.
  // Deleted rather than corrected, because there is no correct value to compare
  // against. Typing the DTO turned an always-false comparison into a compile
  // error, which is the entire point of the finding.

  return {
    myMembership,
    isMember,
    role,
    isCaptain,
  }
}
