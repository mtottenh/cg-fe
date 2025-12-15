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

    <!-- Team memberships grouped by league -->
    <template v-if="teamsByLeague.length > 0">
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
    <v-dialog v-model="leaveDialog" max-width="400">
      <v-card>
        <v-card-title>Leave Team?</v-card-title>
        <v-card-text>
          Are you sure you want to leave <strong>{{ selectedMembership?.team_name }}</strong>?
          You'll need to be re-invited to rejoin.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="leaveDialog = false">Cancel</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="leaving"
            @click="leaveTeam"
          >
            Leave Team
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
      {{ snackbarText }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useLeagueTeamsStore, type PlayerLeagueTeamMembershipResponse } from '@/stores/leagueTeams'

const leagueTeamsStore = useLeagueTeamsStore()

// State
const leaveDialog = ref(false)
const selectedMembership = ref<PlayerLeagueTeamMembershipResponse | null>(null)
const leaving = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

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

function showSnackbar(text: string, color: string) {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

// Actions
function confirmLeaveTeam(membership: PlayerLeagueTeamMembershipResponse) {
  selectedMembership.value = membership
  leaveDialog.value = true
}

async function leaveTeam() {
  if (!selectedMembership.value) return

  leaving.value = true
  try {
    await leagueTeamsStore.leaveTeam(selectedMembership.value.team_season_id)
    showSnackbar(`Left ${selectedMembership.value.team_name}`, 'success')
    leaveDialog.value = false
  } catch {
    showSnackbar(leagueTeamsStore.error || 'Failed to leave team', 'error')
  } finally {
    leaving.value = false
  }
}

onMounted(async () => {
  // Fetch both teams and invitations
  await Promise.all([
    leagueTeamsStore.fetchMyTeams(),
    leagueTeamsStore.fetchMyInvitations(),
  ])
})
</script>
