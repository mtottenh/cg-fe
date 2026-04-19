<template>
  <v-container class="py-8">
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

    <v-alert v-if="leagueTeamsStore.error" type="error" class="mb-4" closable>
      {{ leagueTeamsStore.error }}
    </v-alert>

    <v-progress-linear v-if="leagueTeamsStore.loading" indeterminate class="mb-4" />

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
                  <v-img v-if="membership.league_logo_url" :src="membership.league_logo_url" />
                  <v-icon v-else>mdi-trophy</v-icon>
                </v-avatar>
              </template>
              <v-card-title>{{ membership.league_name }}</v-card-title>
              <v-card-subtitle>
                <v-chip size="x-small" :color="getRoleColor(membership.membership_type)" variant="flat" class="mr-1">
                  {{ formatRole(membership.membership_type) }}
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
                    <v-img v-if="membership.team_logo_url" :src="membership.team_logo_url" />
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
                    {{ formatRole(membership.role) }}
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
    <v-row v-else-if="!leagueTeamsStore.loading">
      <v-col cols="12" class="text-center py-12">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-account-group-outline</v-icon>
        <h3 class="text-h5 text-medium-emphasis mb-2">You're Not on Any Teams Yet</h3>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Join a league and create or join a team to get started!
        </p>
        <v-btn color="primary" to="/leagues">
          <v-icon start>mdi-trophy</v-icon>
          Browse Leagues
        </v-btn>
      </v-col>
    </v-row>

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
    <ConfirmDialog
      :open="confirmDialog.state.open"
      :title="confirmDialog.state.title"
      :message="confirmDialog.state.message"
      :action-label="confirmDialog.state.actionLabel"
      :color="confirmDialog.state.color"
      :loading="confirmDialog.state.loading"
      :error="confirmDialog.state.dialogError"
      @clear-error="confirmDialog.clearError()"
      @confirm="confirmDialog.execute"
      @cancel="confirmDialog.cancel"
    />

  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useLeagueTeamsStore, type PlayerLeagueTeamMembershipResponse } from '@/stores/leagueTeams'
import { useLeaguesStore } from '@/stores/leagues'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

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

// Leagues where user is a member but has no team
const leaguesWithoutTeams = computed(() => {
  const leagueIdsWithTeams = new Set(leagueTeamsStore.myTeams.map(t => t.league_id))
  return leaguesStore.myLeagues.filter(m => !leagueIdsWithTeams.has(m.league_id))
})

function formatJoinDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Helpers
function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'captain':
    case 'founder':
      return 'primary'
    case 'player':
      return 'success'
    case 'substitute':
      return 'info'
    default:
      return 'grey'
  }
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'success'
    case 'inactive':
      return 'grey'
    case 'left':
      return 'error'
    default:
      return 'grey'
  }
}

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

onMounted(async () => {
  await Promise.all([
    leagueTeamsStore.fetchMyTeams(),
    leagueTeamsStore.fetchMyInvitations(),
    leaguesStore.fetchMyLeagues(),
  ])
})
</script>
