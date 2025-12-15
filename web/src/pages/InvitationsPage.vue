<template>
  <v-container class="py-8">
    <v-row align="center" class="mb-6">
      <v-col>
        <h1 class="text-h3">My Invitations</h1>
        <p class="text-body-2 text-medium-emphasis mt-2">
          Manage your pending league team invitations
        </p>
      </v-col>
      <v-col cols="auto">
        <v-btn variant="text" to="/my-teams">
          <v-icon start>mdi-account-group</v-icon>
          My Teams
        </v-btn>
      </v-col>
    </v-row>

    <v-alert v-if="leagueTeamsStore.error" type="error" class="mb-4" closable>
      {{ leagueTeamsStore.error }}
    </v-alert>

    <v-progress-linear v-if="leagueTeamsStore.loading" indeterminate class="mb-4" />

    <v-row v-if="leagueTeamsStore.myInvitations.length > 0">
      <v-col v-for="invitation in leagueTeamsStore.myInvitations" :key="invitation.id" cols="12" md="6">
        <v-card class="h-100">
          <v-card-item>
            <template v-slot:prepend>
              <v-avatar color="primary" size="48">
                <v-img v-if="invitation.team_logo_url" :src="invitation.team_logo_url" />
                <span v-else class="text-h6">{{ (invitation.team_tag || invitation.team_name || '??').substring(0, 2).toUpperCase() }}</span>
              </v-avatar>
            </template>
            <v-card-title>{{ invitation.team_name || 'Unknown Team' }}</v-card-title>
            <v-card-subtitle>
              <v-chip size="x-small" :color="getRoleColor(invitation.role)" class="mr-2">
                {{ formatRole(invitation.role) }}
              </v-chip>
              <span class="text-caption">Invited {{ formatRelativeTime(invitation.created_at) }}</span>
            </v-card-subtitle>
          </v-card-item>

          <!-- League info -->
          <v-card-text>
            <div class="d-flex align-center mb-2">
              <v-icon size="16" class="mr-2">mdi-trophy</v-icon>
              <span class="text-body-2">{{ invitation.league_name }}</span>
            </div>
            <div v-if="invitation.season_name" class="text-caption text-medium-emphasis">
              Season: {{ invitation.season_name }}
            </div>
          </v-card-text>

          <v-card-text v-if="invitation.message">
            <v-alert type="info" variant="tonal" density="compact">
              <span class="text-body-2">"{{ invitation.message }}"</span>
            </v-alert>
          </v-card-text>

          <v-card-text>
            <div class="d-flex align-center text-caption text-medium-emphasis">
              <v-icon size="small" class="mr-1">mdi-clock-outline</v-icon>
              Expires {{ invitation.expires_at ? formatRelativeTime(invitation.expires_at) : 'Never' }}
            </div>
          </v-card-text>

          <v-divider />

          <v-card-actions>
            <v-btn
              color="success"
              variant="elevated"
              :loading="accepting === invitation.id"
              :disabled="processing"
              @click="handleAccept(invitation.id)"
            >
              <v-icon start>mdi-check</v-icon>
              Accept
            </v-btn>
            <v-btn
              color="error"
              variant="outlined"
              :loading="declining === invitation.id"
              :disabled="processing"
              @click="openDeclineDialog(invitation)"
            >
              <v-icon start>mdi-close</v-icon>
              Decline
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-else-if="!leagueTeamsStore.loading">
      <v-col cols="12" class="text-center py-12">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-email-outline</v-icon>
        <h3 class="text-h5 text-medium-emphasis mb-2">No Pending Invitations</h3>
        <p class="text-body-2 text-medium-emphasis mb-4">
          You don't have any team invitations at the moment.
        </p>
        <v-btn color="primary" to="/leagues">Browse Leagues</v-btn>
      </v-col>
    </v-row>

    <!-- Decline dialog with optional message -->
    <v-dialog v-model="declineDialog" max-width="400">
      <v-card>
        <v-card-title>Decline Invitation?</v-card-title>
        <v-card-text>
          <p class="mb-4">Are you sure you want to decline the invitation to join <strong>{{ selectedInvitation?.team_name }}</strong>?</p>
          <v-textarea
            v-model="declineMessage"
            label="Message (optional)"
            rows="2"
            variant="outlined"
            hint="Let them know why you're declining"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="declineDialog = false">Cancel</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="declining === selectedInvitation?.id"
            @click="handleDecline"
          >
            Decline
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Success Snackbar -->
    <v-snackbar v-model="showSuccess" :color="snackbarColor" :timeout="3000">
      {{ successMessage }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLeagueTeamsStore, type LeagueTeamInvitationWithTeamResponse } from '@/stores/leagueTeams'

const router = useRouter()
const leagueTeamsStore = useLeagueTeamsStore()

const accepting = ref<string | null>(null)
const declining = ref<string | null>(null)
const showSuccess = ref(false)
const successMessage = ref('')
const snackbarColor = ref('success')

// Decline dialog
const declineDialog = ref(false)
const declineMessage = ref('')
const selectedInvitation = ref<LeagueTeamInvitationWithTeamResponse | null>(null)

const processing = computed(() => accepting.value !== null || declining.value !== null)

onMounted(async () => {
  await leagueTeamsStore.fetchMyInvitations()
})

async function handleAccept(invitationId: string) {
  accepting.value = invitationId
  try {
    await leagueTeamsStore.acceptInvitation(invitationId)
    successMessage.value = 'You have joined the team!'
    snackbarColor.value = 'success'
    showSuccess.value = true

    // Redirect to my teams after a short delay
    setTimeout(() => {
      router.push('/my-teams')
    }, 1500)
  } catch {
    successMessage.value = leagueTeamsStore.error || 'Failed to accept invitation'
    snackbarColor.value = 'error'
    showSuccess.value = true
  } finally {
    accepting.value = null
  }
}

function openDeclineDialog(invitation: LeagueTeamInvitationWithTeamResponse) {
  selectedInvitation.value = invitation
  declineMessage.value = ''
  declineDialog.value = true
}

async function handleDecline() {
  if (!selectedInvitation.value) return

  declining.value = selectedInvitation.value.id
  try {
    await leagueTeamsStore.declineInvitation(selectedInvitation.value.id, declineMessage.value || undefined)
    successMessage.value = 'Invitation declined'
    snackbarColor.value = 'success'
    showSuccess.value = true
    declineDialog.value = false
  } catch {
    successMessage.value = leagueTeamsStore.error || 'Failed to decline invitation'
    snackbarColor.value = 'error'
    showSuccess.value = true
  } finally {
    declining.value = null
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffMs < 0) {
    // Past date
    const absDays = Math.abs(diffDays)
    if (absDays === 0) return 'today'
    if (absDays === 1) return 'yesterday'
    return `${absDays} days ago`
  } else {
    // Future date
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'tomorrow'
    return `in ${diffDays} days`
  }
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    captain: 'primary',
    founder: 'purple',
    player: 'success',
    substitute: 'info',
  }
  return colors[role] || 'grey'
}
</script>
