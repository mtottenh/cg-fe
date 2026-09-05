import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLeaguesStore } from '@/stores/leagues'
import { useLeagueSeasonsStore } from '@/stores/leagueSeasons'
import { useLeagueTeamsStore, type LeagueTeamSummaryResponse, type LeagueTeamMemberWithPlayer } from '@/stores/leagueTeams'
import { useTournamentsStore } from '@/stores/tournaments'
import { useGamesStore } from '@/stores/games'
import { pickCurrentSeason } from '@/utils/seasons'

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
  /** Join/apply rejections — rendered inline at the CTA, not as a page error. */
  const joinError = ref<string | null>(null)

  // Selection state
  const selectedSeasonId = ref<string | null>(null)
  const selectedTeam = ref<LeagueTeamSummaryResponse | null>(null)
  const teamMembers = ref<LeagueTeamMemberWithPlayer[]>([])

  // Composed state from stores
  const league = computed(() => leaguesStore.currentLeague)
  const seasons = computed(() => seasonsStore.seasons)
  const teams = computed(() => teamsStore.teams)

  // Tournaments obey the season selector like every other section on the
  // page. The store holds the whole league's list (a tournament may be tied
  // to no season at all); those unscoped ones stay visible under every season.
  const tournaments = computed(() =>
    tournamentsStore.tournaments.filter(
      t => !t.season_id || t.season_id === selectedSeasonId.value,
    ),
  )

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

  // Draft seasons are the organiser's workbench: players never see them in
  // the selector, and never land on one by default.
  const canSeeDraftSeasons = computed(
    () => authStore.isAdmin || ['admin', 'moderator'].includes(membershipType.value ?? ''),
  )
  const visibleSeasons = computed(() =>
    canSeeDraftSeasons.value ? seasons.value : seasons.value.filter(s => s.status !== 'draft'),
  )
  const selectedSeason = computed(
    () => seasons.value.find(s => s.id === selectedSeasonId.value) ?? null,
  )
  /** Teams can be created only while the selected season is taking registrations. */
  const canCreateTeamInSeason = computed(
    () => isLeagueMember.value && selectedSeason.value?.status === 'registration' && !hasTeamInSeason.value,
  )

  /**
   * The season a league opens on — see `pickCurrentSeason`: the one being
   * played, else the one taking sign-ups, else the league's own
   * `current_season_id`, else the most recent finished one. Never a draft.
   * The old rule ("active, else first in the list") opened a league with an
   * open season and a draft next season on the empty draft, because the list
   * is newest-created-first; deferring to `current_season_id` first pinned
   * every league to Season 1, which the API stamps at creation and never
   * moves.
   */
  function defaultSeasonId(): string | null {
    const pick = pickCurrentSeason(visibleSeasons.value, league.value?.current_season_id) ?? seasons.value[0]
    return pick?.id ?? null
  }

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

        selectedSeasonId.value = defaultSeasonId()

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
    joinError.value = null
    try {
      await leaguesStore.joinLeague(league.value.id)
    } catch (e) {
      // Deliberately NOT `error` — that renders at the top of the page as a
      // retryable page-load failure. A join rejection (e.g. entry
      // requirements) belongs next to the button that was clicked.
      joinError.value = leaguesStore.joinLeagueState.error || 'Failed to join league'
      throw e
    } finally {
      joiningLeague.value = false
    }
  }

  async function applyToLeague(message?: string) {
    if (!league.value) return
    applyingToLeague.value = true
    joinError.value = null
    try {
      await leaguesStore.applyToLeague(league.value.id, message)
    } catch (e) {
      joinError.value = leaguesStore.applyToLeagueState.error || 'Failed to apply to league'
      throw e
    } finally {
      applyingToLeague.value = false
    }
  }

  function clearJoinError() {
    joinError.value = null
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
    visibleSeasons,
    selectedSeason,
    canCreateTeamInSeason,
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
    joinError,
    clearJoinError,

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
