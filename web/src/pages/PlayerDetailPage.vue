<template>
  <v-container class="py-8">
    <v-btn variant="text" to="/players" class="mb-4">
      <v-icon start>mdi-arrow-left</v-icon>
      Back to Players
    </v-btn>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <v-alert v-if="error" type="error" class="mb-4">
      {{ error }}
    </v-alert>

    <template v-if="player">
      <v-row>
        <v-col cols="12" md="8">
          <v-card class="mb-4">
            <v-card-item>
              <template v-slot:prepend>
                <v-avatar color="secondary" size="80">
                  <v-img v-if="player.avatar_url" :src="player.avatar_url" />
                  <span v-else class="text-h4">{{ player.display_name.substring(0, 2).toUpperCase() }}</span>
                </v-avatar>
              </template>
              <v-card-title class="text-h4">{{ player.display_name }}</v-card-title>
              <v-card-subtitle v-if="player.country_code" class="text-h6">
                {{ player.country_code }}
              </v-card-subtitle>
              <template v-slot:append v-if="isLoggedIn && !isOwnProfile">
                <v-btn
                  color="primary"
                  variant="elevated"
                  @click="openInviteDialog"
                >
                  <v-icon start>mdi-account-plus</v-icon>
                  Invite to Team
                </v-btn>
              </template>
            </v-card-item>
            <v-divider />
            <v-card-text>
              <div class="text-caption text-medium-emphasis">
                Member since {{ formatDate(player.created_at) }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="4">
          <v-card>
            <v-card-title>
              <v-icon start>mdi-account-group</v-icon>
              Teams
            </v-card-title>
            <v-divider />
            <v-list v-if="playerLeagueTeams.length > 0">
              <v-list-item
                v-for="membership in playerLeagueTeams"
                :key="membership.team_season_id"
              >
                <template v-slot:prepend>
                  <v-avatar color="primary" size="36">
                    <span>{{ (membership.team_tag || '??').substring(0, 2) }}</span>
                  </v-avatar>
                </template>
                <v-list-item-title>{{ membership.team_name }}</v-list-item-title>
                <v-list-item-subtitle>
                  <v-chip size="x-small" :color="getRoleColor(membership.role)">
                    {{ membership.role }}
                  </v-chip>
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
            <v-card-text v-else class="text-center text-medium-emphasis">
              Not on any teams
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Invite to Team Dialog -->
    <v-dialog v-model="inviteDialogOpen" max-width="500">
      <v-card>
        <v-card-title>Invite to Team</v-card-title>
        <v-card-subtitle v-if="player">
          Invite {{ player.display_name }} to one of your teams
        </v-card-subtitle>
        <v-divider />

        <v-card-text>
          <v-alert v-if="inviteError" type="error" class="mb-4" closable>
            {{ inviteError }}
          </v-alert>

          <v-select
            v-model="selectedTeamSeasonId"
            :items="myTeamsAsCaptain"
            item-title="team_name"
            item-value="team_season_id"
            label="Select Team"
            :disabled="inviting"
            :loading="loadingMyTeams"
          >
            <template v-slot:no-data>
              <v-list-item>
                <v-list-item-title>
                  You must be a captain of a team to invite players
                </v-list-item-title>
              </v-list-item>
            </template>
          </v-select>

          <v-select
            v-model="selectedRole"
            :items="roleOptions"
            item-title="label"
            item-value="value"
            label="Role"
            :disabled="inviting"
            class="mt-4"
          />

          <v-textarea
            v-model="inviteMessage"
            label="Message (optional)"
            placeholder="Add a personal message..."
            :disabled="inviting"
            rows="3"
            counter="500"
            maxlength="500"
            class="mt-4"
          />
        </v-card-text>

        <v-divider />

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeInviteDialog" :disabled="inviting">
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            @click="sendInvite"
            :loading="inviting"
            :disabled="!selectedTeamSeasonId"
          >
            Send Invite
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Success Snackbar -->
    <v-snackbar v-model="showSuccess" color="success" :timeout="3000">
      {{ successMessage }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { usePlayersStore } from '@/stores/players'
import { useAuthStore } from '@/stores/auth'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'

const route = useRoute()
const playersStore = usePlayersStore()
const authStore = useAuthStore()
const leagueTeamsStore = useLeagueTeamsStore()

const loading = ref(true)
const error = ref<string | null>(null)

const player = computed(() => playersStore.currentPlayer)
const playerLeagueTeams = computed(() => leagueTeamsStore.myTeams)
const playerId = computed(() => route.params.id as string)

const isLoggedIn = computed(() => authStore.isAuthenticated || authStore.isDevMode)
const isOwnProfile = computed(() => {
  return authStore.playerId === playerId.value
})

// Invite dialog state
const inviteDialogOpen = ref(false)
const selectedTeamSeasonId = ref<string | null>(null)
const selectedRole = ref('player')
const inviteMessage = ref('')
const inviting = ref(false)
const inviteError = ref<string | null>(null)
const loadingMyTeams = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')

const roleOptions = [
  { label: 'Player', value: 'player' },
  { label: 'Substitute', value: 'substitute' },
  { label: 'Coach', value: 'coach' },
  { label: 'Manager', value: 'manager' },
]

// Filter to only teams where the user is a captain
const myTeamsAsCaptain = computed(() => {
  return leagueTeamsStore.myTeams.filter((t) => t.role === 'captain')
})

onMounted(async () => {
  try {
    await playersStore.fetchPlayer(playerId.value)
  } catch (e) {
    error.value = playersStore.error || 'Failed to load player'
  } finally {
    loading.value = false
  }
})

async function openInviteDialog() {
  inviteDialogOpen.value = true
  inviteError.value = null
  selectedTeamSeasonId.value = null
  selectedRole.value = 'player'
  inviteMessage.value = ''

  // Fetch the current user's teams
  loadingMyTeams.value = true
  try {
    await leagueTeamsStore.fetchMyTeams()
  } catch (e) {
    inviteError.value = 'Failed to load your teams'
  } finally {
    loadingMyTeams.value = false
  }
}

function closeInviteDialog() {
  inviteDialogOpen.value = false
}

async function sendInvite() {
  if (!selectedTeamSeasonId.value || !playerId.value) return

  inviting.value = true
  inviteError.value = null

  try {
    await leagueTeamsStore.invitePlayer(selectedTeamSeasonId.value, {
      player_id: playerId.value,
      role: selectedRole.value,
      message: inviteMessage.value || undefined,
    })

    successMessage.value = `Invitation sent to ${player.value?.display_name}!`
    showSuccess.value = true
    closeInviteDialog()
  } catch (e) {
    inviteError.value = 'Failed to send invitation'
  } finally {
    inviting.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    captain: 'primary',
    officer: 'secondary',
    player: 'info',
    substitute: 'warning',
    coach: 'success',
    manager: 'accent',
  }
  return colors[role] || 'grey'
}
</script>
