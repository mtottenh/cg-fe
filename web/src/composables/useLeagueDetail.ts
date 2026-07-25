import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLeaguesStore } from '@/stores/leagues'
import { useLeagueSeasonsStore } from '@/stores/leagueSeasons'
import { useLeagueTeamsStore, type LeagueTeamSummaryResponse, type LeagueTeamMemberWithPlayer } from '@/stores/leagueTeams'
import { useTournamentsStore } from '@/stores/tournaments'
import { useGamesStore } from '@/stores/games'

export function useLeagueDetail() {
  const route = useRoute()
  const authStore = useAuthStore()
  const leaguesStore = useLeaguesStore()
  const seasonsStore = useLeagueSeasonsStore()
  const teamsStore = useLeagueTeamsStore()
  const tournamentsStore = useTournamentsStore()
  const gamesStore = useGamesStore()

  // Loading states
  const loading = ref(false)
  const loadingSeasons = ref(false)
  const loadingTeams = ref(false)
  const loadingTournaments = ref(false)
  const loadingMembers = ref(false)
  const creatingTeam = ref(false)
  const joiningLeague = ref(false)
  const applyingToLeague = ref(false)
  const error = ref<string | null>(null)

  // Selection state
  const selectedSeasonId = ref<string | null>(null)
  const selectedTeam = ref<LeagueTeamSummaryResponse | null>(null)
  const teamMembers = ref<LeagueTeamMemberWithPlayer[]>([])

  // Composed state from stores
  const league = computed(() => leaguesStore.currentLeague)
  const seasons = computed(() => seasonsStore.seasons)
  const teams = computed(() => teamsStore.teams)
  const tournaments = computed(() => tournamentsStore.tournaments)

  const gameName = computed(() => {
    if (!league.value) return ''
    const game = gamesStore.games.find(g => g.id === league.value!.game_id)
    return game?.display_name || game?.slug || 'Unknown Game'
  })

  // League membership
  const isLeagueMember = computed(() => {
    if (!league.value || !authStore.isAuthenticated) return false
    return leaguesStore.myLeagues.some(m => m.league_id === league.value!.id)
  })

  const membershipType = computed(() => {
    if (!league.value) return null
    const membership = leaguesStore.myLeagues.find(m => m.league_id === league.value!.id)
    return membership?.membership_type ?? null
  })

  const hasPendingApplication = computed(() => {
    if (!league.value) return false
    return leaguesStore.hasPendingApplicationForLeague(league.value.id)
  })

  const hasTeamInSeason = computed(() => {
    if (!selectedSeasonId.value || !isLeagueMember.value) return false
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
          // These are non-critical — don't let failures block the page
          await Promise.all([
            teamsStore.fetchMyTeams().catch(() => {}),
            leaguesStore.fetchMyLeagues().catch(() => {}),
            leaguesStore.fetchMyLeagueInvitations().catch(() => {}),
          ])
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

  // Prefixed with _ because we accept the season id for API symmetry + future
  // filtering, but currently fetch by league_id only (not all tournaments are
  // pinned to a specific season).
  async function fetchTournamentsForSeason(_seasonId: string) {
    if (!league.value) return
    loadingTournaments.value = true
    try {
      // Fetch tournaments for this league. We filter by league_id only
      // (not season_id) because tournaments may be linked to the league
      // without a specific season. The season_id on a tournament is optional.
      await tournamentsStore.fetchTournaments({
        league_id: league.value.id,
      })
    } catch (e) {
      console.error('Failed to load tournaments:', e)
    } finally {
      loadingTournaments.value = false
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
      // P-124: `teamsStore.error` aliases `fetchMyTeamsState`
      // (stores/leagueTeams.ts:55). That is one of the three calls in this
      // block, but the LAST and least interesting one — so the refusal that
      // actually matters ("team name 'X' is already taken in this league",
      // "you already have a team in this season") was never the message shown.
      //
      // Unlike the single-action handlers, this block genuinely spans three
      // actions, so it reads them in the order they run rather than picking
      // one: if the create failed nothing else ran, and if a refresh failed
      // the team DOES exist — saying "Failed to create team" would be a lie.
      error.value =
        teamsStore.createTeamState.error ||
        teamsStore.fetchTeamsInSeasonState.error ||
        teamsStore.fetchMyTeamsState.error ||
        'Failed to create team'
      throw e
    } finally {
      creatingTeam.value = false
    }
  }

  async function joinLeague() {
    if (!league.value) return
    joiningLeague.value = true
    try {
      await leaguesStore.joinLeague(league.value.id)
    } catch (e) {
      error.value = leaguesStore.joinLeagueState.error || 'Failed to join league'
      throw e
    } finally {
      joiningLeague.value = false
    }
  }

  async function applyToLeague(message?: string) {
    if (!league.value) return
    applyingToLeague.value = true
    try {
      await leaguesStore.applyToLeague(league.value.id, message)
    } catch (e) {
      error.value = leaguesStore.applyToLeagueState.error || 'Failed to apply to league'
      throw e
    } finally {
      applyingToLeague.value = false
    }
  }

  async function leaveLeague() {
    if (!league.value) return
    try {
      await leaguesStore.leaveLeague(league.value.id)
    } catch (e) {
      error.value = 'Failed to leave league'
      throw e
    }
  }

  function clearError() {
    error.value = null
  }

  // Re-fetch when route param changes (component reuse between leagues)
  watch(() => route.params.id, (newId, oldId) => {
    if (newId && newId !== oldId) {
      fetchAll()
    }
  })

  // Watch season changes to load teams
  watch(selectedSeasonId, (newSeasonId) => {
    if (newSeasonId) {
      fetchTeamsForSeason(newSeasonId)
      fetchTournamentsForSeason(newSeasonId)
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
    tournaments,
    gameName,
    hasTeamInSeason,
    isLeagueMember,
    membershipType,
    hasPendingApplication,
    selectedSeasonId,
    selectedTeam,
    teamMembers,

    // Loading/Error
    loading,
    loadingSeasons,
    loadingTeams,
    loadingTournaments,
    loadingMembers,
    creatingTeam,
    joiningLeague,
    applyingToLeague,
    error,
    clearError,

    // Auth (pass through for template)
    isAuthenticated: computed(() => authStore.isAuthenticated),

    // Actions
    fetchAll,
    fetchTeamMembers,
    createTeam,
    joinLeague,
    applyToLeague,
    leaveLeague,
  }
}
