import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLeaguesStore } from '@/stores/leagues'
import { useLeagueSeasonsStore } from '@/stores/leagueSeasons'
import { useLeagueTeamsStore, type LeagueTeamSummaryResponse, type LeagueTeamMemberWithPlayer } from '@/stores/leagueTeams'
import { useGamesStore } from '@/stores/games'

export function useLeagueDetail() {
  const route = useRoute()
  const authStore = useAuthStore()
  const leaguesStore = useLeaguesStore()
  const seasonsStore = useLeagueSeasonsStore()
  const teamsStore = useLeagueTeamsStore()
  const gamesStore = useGamesStore()

  // Loading states
  const loading = ref(false)
  const loadingSeasons = ref(false)
  const loadingTeams = ref(false)
  const loadingMembers = ref(false)
  const creatingTeam = ref(false)
  const error = ref<string | null>(null)

  // Selection state
  const selectedSeasonId = ref<string | null>(null)
  const selectedTeam = ref<LeagueTeamSummaryResponse | null>(null)
  const teamMembers = ref<LeagueTeamMemberWithPlayer[]>([])

  // Composed state from stores
  const league = computed(() => leaguesStore.currentLeague)
  const seasons = computed(() => seasonsStore.seasons)
  const teams = computed(() => teamsStore.teams)

  const gameName = computed(() => {
    if (!league.value) return ''
    const game = gamesStore.games.find(g => g.id === league.value!.game_id)
    return game?.display_name || game?.slug || 'Unknown Game'
  })

  const hasTeamInSeason = computed(() => {
    if (!selectedSeasonId.value || !authStore.isAuthenticated) return false
    return teamsStore.myTeams.some(t => t.season_id === selectedSeasonId.value)
  })

  // Data fetching
  async function fetchAll() {
    const leagueId = route.params.id as string

    loading.value = true
    try {
      await gamesStore.fetchGames()
      await leaguesStore.fetchLeague(leagueId)

      if (league.value) {
        loadingSeasons.value = true
        await seasonsStore.fetchSeasons(leagueId)
        loadingSeasons.value = false

        // Auto-select active season or first available
        const activeSeason = seasons.value.find(s => s.status === 'active')
        if (activeSeason) {
          selectedSeasonId.value = activeSeason.id
        } else if (seasons.value.length > 0) {
          const firstSeason = seasons.value[0]
          if (firstSeason) {
            selectedSeasonId.value = firstSeason.id
          }
        }

        if (authStore.isAuthenticated) {
          await teamsStore.fetchMyTeams()
        }
      }
    } catch (e) {
      error.value = 'Failed to load league details'
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  async function fetchTeamsForSeason(seasonId: string) {
    loadingTeams.value = true
    try {
      await teamsStore.fetchTeamsInSeason(seasonId)
    } catch (e) {
      console.error('Failed to load teams:', e)
    } finally {
      loadingTeams.value = false
    }
  }

  async function fetchTeamMembers(team: LeagueTeamSummaryResponse) {
    selectedTeam.value = team
    teamMembers.value = []

    if (team.team_season_id) {
      loadingMembers.value = true
      try {
        teamMembers.value = await teamsStore.fetchMembers(team.team_season_id)
      } catch (e) {
        console.error('Failed to load team members:', e)
      } finally {
        loadingMembers.value = false
      }
    }
  }

  async function createTeam(seasonId: string, data: { name: string; tag: string; description?: string }) {
    creatingTeam.value = true
    try {
      await teamsStore.createTeam(seasonId, data)

      await Promise.all([
        teamsStore.fetchTeamsInSeason(seasonId),
        teamsStore.fetchMyTeams(),
      ])
    } catch (e) {
      console.error('Failed to create team:', e)
      error.value = teamsStore.error || 'Failed to create team'
      throw e
    } finally {
      creatingTeam.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  // Watch season changes to load teams
  watch(selectedSeasonId, (newSeasonId) => {
    if (newSeasonId) {
      fetchTeamsForSeason(newSeasonId)
    }
  })

  // Cleanup
  onUnmounted(() => {
    leaguesStore.clearCurrent()
    seasonsStore.clearSeasons()
    teamsStore.clearTeams()
  })

  return {
    // State
    league,
    seasons,
    teams,
    gameName,
    hasTeamInSeason,
    selectedSeasonId,
    selectedTeam,
    teamMembers,

    // Loading/Error
    loading,
    loadingSeasons,
    loadingTeams,
    loadingMembers,
    creatingTeam,
    error,
    clearError,

    // Auth (pass through for template)
    isAuthenticated: computed(() => authStore.isAuthenticated),

    // Actions
    fetchAll,
    fetchTeamMembers,
    createTeam,
  }
}
