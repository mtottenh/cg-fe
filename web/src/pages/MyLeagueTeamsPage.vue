<template>
  <v-container>
    <v-row align="center" class="mb-6">
      <v-col>
        <h1 class="text-h3">My Teams</h1>
        <p class="text-medium-emphasis">Your league team memberships</p>
      </v-col>
      <v-col cols="auto">
        <v-btn color="primary" to="/leagues">
          <v-icon start>mdi-trophy</v-icon>
          Browse Leagues
        </v-btn>
      </v-col>
    </v-row>

    <ErrorAlert
      :error="loadError"
      retryable
      @clear="clearLoadError"
      @retry="fetchData"
    />

    <v-progress-linear v-if="loadingData" indeterminate class="mb-4" />

    <!-- League memberships without teams -->
    <template v-if="leaguesWithoutTeams.length > 0">
      <h2 class="text-h5 mb-4">
        <v-icon start>mdi-trophy</v-icon>
        My Leagues
      </h2>
      <v-row class="mb-8">
        <v-col v-for="membership in leaguesWithoutTeams" :key="membership.league_id" cols="12" sm="6" md="4">
          <v-card class="h-100">
            <v-card-item>
              <template v-slot:prepend>
                <v-avatar color="warning" size="48" rounded="lg">
                  <v-img alt="" v-if="membership.league_logo_url" :src="membership.league_logo_url" />
                  <v-icon v-else>mdi-trophy</v-icon>
                </v-avatar>
              </template>
              <v-card-title>{{ membership.league_name }}</v-card-title>
              <v-card-subtitle>
                <!--
                  P-133: this is a LEAGUE membership, so it must go through
                  `leagueRoleMap` — `getRoleColor`/`teamRoleMap` above is for
                  the team roster chip and shares no values with it.
                -->
                <v-chip size="x-small" :color="getMembershipColor(membership.membership_type)" variant="flat" class="mr-1">
                  {{ getMembershipLabel(membership.membership_type) }}
                </v-chip>
              </v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <div class="text-caption text-medium-emphasis">
                <v-icon size="small" class="mr-1">mdi-calendar</v-icon>
                Joined {{ formatJoinDate(membership.joined_at) }}
              </div>
              <v-alert type="info" variant="tonal" density="compact" class="mt-2">
                You haven't joined a team yet. Visit the league to create or join one.
              </v-alert>
            </v-card-text>
            <v-card-actions>
              <v-btn color="primary" variant="tonal" :to="`/leagues/${membership.league_id}`">
                View League
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Team memberships grouped by league -->
    <template v-if="teamsByLeague.length > 0">
      <h2 v-if="leaguesWithoutTeams.length > 0" class="text-h5 mb-4">
        <v-icon start>mdi-shield-account</v-icon>
        My Teams
      </h2>
      <div v-for="group in teamsByLeague" :key="group.leagueId" class="mb-6">
        <div class="d-flex align-center mb-3">
          <v-icon size="20" class="mr-2">mdi-trophy</v-icon>
          <span class="text-subtitle-1 font-weight-medium">{{ group.leagueName }}</span>
          <v-chip size="small" class="ml-2" color="primary" variant="tonal">
            {{ group.teams.length }} {{ group.teams.length === 1 ? 'team' : 'teams' }}
          </v-chip>
        </div>

        <v-row>
          <v-col v-for="membership in group.teams" :key="membership.team_id" cols="12" sm="6" md="4">
            <v-card class="h-100">
              <v-card-item>
                <template v-slot:prepend>
                  <v-avatar color="primary" size="48">
                    <v-img alt="" v-if="membership.team_logo_url" :src="membership.team_logo_url" />
                    <span v-else class="text-h6">{{ membership.team_tag?.substring(0, 2) || '??' }}</span>
                  </v-avatar>
                </template>
                <v-card-title>{{ membership.team_name }}</v-card-title>
                <v-card-subtitle>[{{ membership.team_tag }}]</v-card-subtitle>
              </v-card-item>

              <v-card-text>
                <div class="d-flex align-center mb-2">
                  <v-chip
                    size="small"
                    :color="getRoleColor(membership.role)"
                    variant="flat"
                    class="mr-2"
                  >
                    {{ getRoleLabel(membership.role) }}
                  </v-chip>
                  <v-chip
                    size="small"
                    :color="getStatusColor(membership.status)"
                    variant="tonal"
                  >
                    {{ formatStatus(membership.status) }}
                  </v-chip>
                </div>
                <div v-if="membership.season_name" class="text-caption text-medium-emphasis">
                  Season: {{ membership.season_name }}
                </div>
              </v-card-text>

              <v-card-actions>
                <!--
                  P-71: "My Teams" had no link to the team itself — only to the
                  league — so every owner-side team control (register for the
                  next season, transfer ownership, disband) was unreachable from
                  the one page that lists a player's teams. The season id is
                  carried so TeamDetailPage opens on the right roster instead of
                  guessing from the 3 newest seasons.
                -->
                <v-btn
                  variant="text"
                  size="small"
                  color="primary"
                  :data-testid="`view-team-${membership.team_id}`"
                  :to="`/teams/${membership.team_id}?season=${membership.team_season_id}`"
                >
                  View Team
                </v-btn>
                <v-btn
                  variant="text"
                  size="small"
                  color="primary"
                  :to="`/leagues/${membership.league_id}`"
                >
                  View League
                </v-btn>
                <v-spacer />
                <v-btn
                  v-if="membership.status === 'active'"
                  variant="text"
                  size="small"
                  color="error"
                  @click="confirmLeaveTeam(membership)"
                >
                  Leave
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </template>

    <!-- Empty state -->
    <EmptyState
      v-else-if="!loadingData && !loadError"
      icon="mdi-account-group-outline"
      title="You're Not on Any Teams Yet"
      subtitle="Join a league and create or join a team to get started!"
    >
      <template #action>
        <v-btn color="primary" class="mt-4" to="/leagues">
          <v-icon start>mdi-trophy</v-icon>
          Browse Leagues
        </v-btn>
      </template>
    </EmptyState>

    <!-- Pending invitations banner -->
    <v-banner
      v-if="leagueTeamsStore.myInvitations.length > 0"
      color="info"
      class="mt-6"
      icon="mdi-email"
    >
      <template v-slot:text>
        You have {{ leagueTeamsStore.myInvitations.length }} pending team
        {{ leagueTeamsStore.myInvitations.length === 1 ? 'invitation' : 'invitations' }}
      </template>
      <template v-slot:actions>
        <v-btn variant="text" to="/invitations">View Invitations</v-btn>
      </template>
    </v-banner>

    <!-- Leave team confirmation dialog -->
    <ConfirmDialogHost :dialog="confirmDialog" />

  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useLeagueTeamsStore, type PlayerLeagueTeamMembershipResponse } from '@/stores/leagueTeams'
import { useLeaguesStore, isLeagueLive } from '@/stores/leagues'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import { teamRoleMap, teamStatusMap, leagueRoleMap, getStatusColor as mapStatusColor, getStatusLabel } from '@/utils/statusMaps'

const leagueTeamsStore = useLeagueTeamsStore()
const leaguesStore = useLeaguesStore()

// State
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

// Group teams by league
interface LeagueGroup {
  leagueId: string
  leagueName: string
  teams: PlayerLeagueTeamMembershipResponse[]
}

const teamsByLeague = computed((): LeagueGroup[] => {
  const groups = new Map<string, LeagueGroup>()

  for (const membership of leagueTeamsStore.myTeams) {
    const leagueId = membership.league_id
    if (!groups.has(leagueId)) {
      groups.set(leagueId, {
        leagueId,
        leagueName: membership.league_name,
        teams: [],
      })
    }
    groups.get(leagueId)!.teams.push(membership)
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.leagueName.localeCompare(b.leagueName)
  )
})

// Leagues where user is a member but has no team.
// Memberships are returned for archived and suspended leagues too (a league
// admin has to be able to restore one) — but you cannot form a team in a
// league that is not running, so they are not offered here.
const leaguesWithoutTeams = computed(() => {
  const leagueIdsWithTeams = new Set(leagueTeamsStore.myTeams.map(t => t.league_id))
  return leaguesStore.myLeagues.filter(
    m => !leagueIdsWithTeams.has(m.league_id) && isLeagueLive(m)
  )
})

function formatJoinDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Helpers
//
// P-133 — TWO different role enums are rendered on this page and both were fed
// through `teamRoleMap`.
//
// `membership.role` on a TEAM card is `LeagueTeamRole`
// (captain | player | substitute) and was right. `membership.membership_type`
// on a LEAGUE card is `LeagueMembershipType` (admin | moderator | member) and
// shares not one value with it, so every lookup missed and
// `getStatusColor`'s `?? 'grey'` fallback fired for every league membership
// that has ever rendered here — a league admin's chip was styled identically
// to a plain member's. Nothing looked broken at the call site, which is
// exactly why a map that silently returns undefined is worse than no map: the
// wrong answer arrives already dressed as the right one.
//
// The label was papered over separately: `formatRole` is a bare
// capitalise-first-letter, so it produced plausible text ("Admin") without ever
// consulting a map — which is why the miss never surfaced as a raw wire value
// and the ratchet's regex could not see it either.
const getRoleColor = (role: string) => mapStatusColor(teamRoleMap, role)
const getRoleLabel = (role: string) => getStatusLabel(teamRoleMap, role)
const getMembershipColor = (type: string) => mapStatusColor(leagueRoleMap, type)
const getMembershipLabel = (type: string) => getStatusLabel(leagueRoleMap, type)
const formatStatus = (status: string) => getStatusLabel(teamStatusMap, status)
const getStatusColor = (status: string) => mapStatusColor(teamStatusMap, status)

// Actions
function confirmLeaveTeam(membership: PlayerLeagueTeamMembershipResponse) {
  confirmDialog.confirm({
    title: 'Leave Team?',
    message: `Are you sure you want to leave ${membership.team_name}? You'll need to be re-invited to rejoin.`,
    action: 'Leave Team',
    color: 'error',
    handler: async () => {
      await leagueTeamsStore.leaveTeam(membership.team_season_id)
      snackbar.show(`Left ${membership.team_name}`, 'success')
    },
  })
}

/**
 * P-124 — the alert used to bind `leagueTeamsStore.error`, a computed alias
 * over `fetchMyTeamsState` (stores/leagueTeams.ts:55). That is one of the
 * three calls `fetchData` makes, so the page reported a failed team fetch and
 * stayed silent for the other two: a failed `fetchMyLeagues` left the "My
 * Leagues" section empty with nothing on screen to say why, which reads as
 * "you are in no leagues" — a wrong answer, not a missing one.
 *
 * All three legs run concurrently and any of them can fail, so this reports
 * the first one that did, in the order they are listed.
 */
const loadError = computed(
  () =>
    leagueTeamsStore.fetchMyTeamsState.error ||
    leagueTeamsStore.fetchMyInvitationsState.error ||
    leaguesStore.fetchMyLeaguesState.error,
)

/**
 * Same alias defect on the LOADING side: the spinner and the "You're Not on
 * Any Teams Yet" empty state were gated on `leagueTeamsStore.loading`, which
 * covers only `fetchMyTeams`. An empty state is an assertion about the data,
 * so it must not render while the data is unknown or failed.
 */
const loadingData = computed(
  () =>
    leagueTeamsStore.fetchMyTeamsState.loading ||
    leagueTeamsStore.fetchMyInvitationsState.loading ||
    leaguesStore.fetchMyLeaguesState.loading,
)

function clearLoadError() {
  leagueTeamsStore.fetchMyTeamsState.error = null
  leagueTeamsStore.fetchMyInvitationsState.error = null
  leaguesStore.fetchMyLeaguesState.error = null
}

async function fetchData() {
  try {
    await Promise.all([
      leagueTeamsStore.fetchMyTeams(),
      leagueTeamsStore.fetchMyInvitations(),
      leaguesStore.fetchMyLeagues(),
    ])
  } catch {
    // Errors are captured in stores
  }
}

onMounted(() => { fetchData() })
</script>
