import { ref, computed, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTournamentsStore, type TournamentResponse, type TournamentRegistrationResponse } from '@/stores/tournaments'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { api } from '@/api'

export function useTournamentContext(tournament: Ref<TournamentResponse | null>) {
  const authStore = useAuthStore()
  const tournamentsStore = useTournamentsStore()
  const leagueTeamsStore = useLeagueTeamsStore()

  // Scoped organizer role IDs (loaded from /v1/users/me/roles)
  const organizerScopeIds = ref<Set<string>>(new Set())

  // --- Identity ---

  const isTeamTournament = computed(() => tournament.value?.participant_type === 'team')

  /** Current user's active registration in this tournament (handles both individual and team). */
  const myRegistration = computed((): TournamentRegistrationResponse | null => {
    if (!authStore.playerId || !tournament.value) return null

    const regs = tournamentsStore.registrations

    // Individual tournaments: match by player_id
    if (!isTeamTournament.value) {
      return regs.find(
        r => r.player_id === authStore.playerId
          && r.status !== 'withdrawn' && r.status !== 'disqualified'
      ) ?? null
    }

    // Team tournaments: match by team_season_id against user's teams
    const myTeamSeasonIds = leagueTeamsStore.myTeams.map(t => t.team_season_id)
    return regs.find(
      r => r.team_season_id && myTeamSeasonIds.includes(r.team_season_id)
        && r.status !== 'withdrawn' && r.status !== 'disqualified'
    ) ?? null
  })

  const isParticipant = computed(() => !!myRegistration.value)

  /** Whether the current user has eligible teams they could register (captain/manager, not already registered). */
  const hasEligibleTeams = computed((): boolean | undefined => {
    if (!isTeamTournament.value || !tournament.value) return undefined
    if (!authStore.isAuthenticated) return false
    const registeredIds = tournamentsStore.registrations
      .filter(r => r.status !== 'withdrawn' && r.status !== 'disqualified')
      .map(r => r.team_season_id)
    return leagueTeamsStore.myTeams.some(team => {
      if (!['captain', 'manager'].includes(team.role)) return false
      if (registeredIds.includes(team.team_season_id)) return false
      if (tournament.value!.league_id && team.league_id !== tournament.value!.league_id) return false
      if (tournament.value!.season_id && team.season_id !== tournament.value!.season_id) return false
      if (team.status !== 'active') return false
      return true
    })
  })

  // --- Organizer ---

  const isOrganizer = computed(() => {
    if (!authStore.isAuthenticated || !tournament.value) return false
    if (authStore.isAdmin) return true
    if (tournament.value.created_by === authStore.user?.id) return true
    return organizerScopeIds.value.has(tournament.value.id)
  })

  // Status-based visibility flags
  const canPublish = computed(() => isOrganizer.value && tournament.value?.status === 'draft')
  const canOpenRegistration = computed(() => isOrganizer.value && tournament.value?.status === 'published')
  const canCloseRegistration = computed(() => isOrganizer.value && tournament.value?.status === 'registration')
  const canReopenRegistration = computed(() => isOrganizer.value && tournament.value?.status === 'scheduled')
  const canStart = computed(() => isOrganizer.value && tournament.value?.status === 'scheduled')
  const canCancel = computed(() =>
    isOrganizer.value && tournament.value && !['completed', 'finalized', 'cancelled'].includes(tournament.value.status)
  )
  const canComplete = computed(() => isOrganizer.value && tournament.value?.status === 'in_progress')
  const canFinalize = computed(() => isOrganizer.value && tournament.value?.status === 'completed')

  // Swiss round advancement
  const isSwissFormat = computed(() => tournament.value?.format === 'swiss')
  const swissBracket = computed(() => tournamentsStore.brackets.length > 0 ? tournamentsStore.brackets[0] : null)
  const allCurrentRoundMatchesCompleted = computed(() => {
    if (!swissBracket.value) return false
    const bracket = swissBracket.value as Record<string, unknown>
    const currentRound = bracket.current_round as number | undefined
    if (!currentRound) return false
    const roundMatches = tournamentsStore.matches.filter(m => m.round === currentRound)
    return roundMatches.length > 0 && roundMatches.every(m => m.status === 'completed')
  })
  const canAdvanceRound = computed(() => {
    if (!isSwissFormat.value || tournament.value?.status !== 'in_progress') return false
    const bracket = swissBracket.value as Record<string, unknown> | null
    if (!bracket) return false
    const currentRound = bracket.current_round as number | undefined
    const totalRounds = bracket.total_rounds as number | undefined
    if (!currentRound || !totalRounds) return false
    return currentRound < totalRounds && allCurrentRoundMatchesCompleted.value
  })

  // Pending registrations count
  const pendingRegistrationCount = computed(() =>
    tournamentsStore.registrations.filter(r => r.status === 'pending').length
  )

  // Load organizer scoped roles (for non-admin organizers)
  async function loadOrganizerRoles() {
    if (!authStore.isAuthenticated) return
    try {
      const res = await api.GET('/v1/users/me/roles')
      if (res.data) {
        const data = (res.data as { data?: Array<{ scope_type?: string | null; scope_id?: string | null }> }).data
        if (data) {
          const ids = new Set<string>()
          for (const assignment of data) {
            if (assignment.scope_type === 'tournament' && assignment.scope_id) {
              ids.add(assignment.scope_id)
            }
          }
          organizerScopeIds.value = ids
        }
      }
    } catch {
      // Silently fail - user simply won't see organizer tools
    }
  }

  return {
    // Identity
    isTeamTournament,
    myRegistration,
    isParticipant,
    hasEligibleTeams,

    // Organizer
    isOrganizer,
    canPublish,
    canOpenRegistration,
    canCloseRegistration,
    canReopenRegistration,
    canStart,
    canCancel,
    canComplete,
    canFinalize,
    isSwissFormat,
    canAdvanceRound,
    pendingRegistrationCount,
    loadOrganizerRoles,
  }
}
