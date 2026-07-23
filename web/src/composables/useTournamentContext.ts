import { ref, computed, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTournamentsStore, type TournamentResponse, type TournamentRegistrationResponse } from '@/stores/tournaments'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { api } from '@/api'
import { useTournamentLifecycleGuards } from '@/composables/useTournamentAdminActions'
import { useSwissBracketProgress } from '@/composables/useSwissBracketProgress'

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

  /**
   * P-51: whether the current viewer holds a pending invitation to this
   * tournament. Backed by `GET /v1/tournaments/{id}/invitations`, which now
   * self-scopes (a non-organiser sees only invitations addressed to them). We
   * still match against the viewer's own identity so this stays correct even
   * when an organiser loads the full list: a pending row is "mine" when it
   * targets my user_id, or a team-season I captain/manage.
   *
   * `undefined` when the answer is not yet knowable (not invite-only) so callers
   * can distinguish "not invited" from "unknown". This is the signal the
   * registration-card gate needs to turn the invite-only precondition from a
   * soft prompt (P-47) into a hard block.
   */
  const isInvited = computed((): boolean | undefined => {
    if (tournament.value?.registration_type !== 'invite_only') return undefined
    if (!authStore.isAuthenticated) return false
    const myTeamSeasonIds = new Set(
      leagueTeamsStore.myTeams
        .filter(t => ['captain', 'manager'].includes(t.role))
        .map(t => t.team_season_id),
    )
    return tournamentsStore.invitations.some(inv => {
      if (inv.status !== 'pending') return false
      if (inv.user_id && inv.user_id === authStore.user?.id) return true
      if (inv.team_season_id && myTeamSeasonIds.has(inv.team_season_id)) return true
      return false
    })
  })

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

  // Status-based lifecycle guards sourced from the single-source-of-truth
  // `useTournamentLifecycleGuards`, then gated on organizer role.
  const lifecycleGuards = useTournamentLifecycleGuards(tournament)
  const withOrganizer = (flag: Ref<boolean>) => computed(() => isOrganizer.value && flag.value)
  const canPublish = withOrganizer(lifecycleGuards.canPublish)
  const canOpenRegistration = withOrganizer(lifecycleGuards.canOpenRegistration)
  const canCloseRegistration = withOrganizer(lifecycleGuards.canCloseRegistration)
  const canReopenRegistration = withOrganizer(lifecycleGuards.canReopenRegistration)
  const canStart = withOrganizer(lifecycleGuards.canStart)
  const canCancel = withOrganizer(lifecycleGuards.canCancel)
  const canComplete = withOrganizer(lifecycleGuards.canComplete)
  const canFinalize = withOrganizer(lifecycleGuards.canFinalize)

  // Swiss round advancement — delegated to useSwissBracketProgress so the
  // logic lives in one place (AdminTournamentDetailPage consumes it directly).
  const swissProgress = useSwissBracketProgress(tournament)
  const isSwissFormat = swissProgress.isSwissFormat
  const canAdvanceRound = swissProgress.canAdvanceRound

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
    isInvited,
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
