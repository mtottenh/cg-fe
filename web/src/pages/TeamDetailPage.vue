<template>
  <v-container class="py-8">
    <v-btn variant="text" @click="goBack" class="mb-4">
      <v-icon start>mdi-arrow-left</v-icon>
      Back
    </v-btn>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <template v-if="team">
      <v-row>
        <v-col cols="12" md="8">
          <v-card class="mb-4">
            <v-card-item>
              <template v-slot:prepend>
                <v-avatar color="primary" size="64" rounded="lg">
                  <v-img v-if="team.logo_url" :src="team.logo_url" />
                  <span v-else class="text-h5">{{ team.tag.substring(0, 2) }}</span>
                </v-avatar>
              </template>
              <v-card-title class="text-h4">{{ team.name }}</v-card-title>
              <v-card-subtitle class="team-tag text-h6">[{{ team.tag }}]</v-card-subtitle>
              <template v-slot:append>
                <div class="d-flex gap-2">
                  <v-btn
                    v-if="isCaptain"
                    color="primary"
                    variant="outlined"
                    :to="`/teams/${teamId}/edit`"
                  >
                    <v-icon start>mdi-pencil</v-icon>
                    Edit Team
                  </v-btn>
                  <v-btn
                    v-if="isMember && !isCaptain"
                    color="error"
                    variant="outlined"
                    @click="confirmLeaveTeam"
                  >
                    <v-icon start>mdi-exit-run</v-icon>
                    Leave Team
                  </v-btn>
                </div>
              </template>
            </v-card-item>
            <v-card-text v-if="team.description">
              <p>{{ team.description }}</p>
            </v-card-text>
            <v-divider />
            <v-card-text>
              <div class="d-flex align-center gap-4 text-caption text-medium-emphasis">
                <span>
                  <v-icon size="small" class="mr-1">mdi-calendar</v-icon>
                  Created {{ formatDate(team.created_at) }}
                </span>
                <v-chip size="small" :color="getStatusColor(team.status)" variant="tonal">
                  {{ team.status }}
                </v-chip>
              </div>
            </v-card-text>
          </v-card>

          <!-- Pending Invitations (Captain Only) -->
          <v-card v-if="isCaptain && teamSeasonId" class="mb-4">
            <v-card-title>
              <v-icon start>mdi-email-outline</v-icon>
              Pending Invitations
              <v-chip v-if="invitations.length > 0" size="small" color="info" class="ml-2">
                {{ invitations.length }}
              </v-chip>
            </v-card-title>
            <v-divider />
            <v-list v-if="invitations.length > 0">
              <v-list-item
                v-for="invitation in invitations"
                :key="invitation.id"
              >
                <template v-slot:prepend>
                  <v-avatar color="grey" size="36">
                    <span>??</span>
                  </v-avatar>
                </template>
                <v-list-item-title>{{ invitation.player_id }}</v-list-item-title>
                <v-list-item-subtitle>
                  <v-chip size="x-small" :color="getRoleColor(invitation.role)">
                    {{ invitation.role }}
                  </v-chip>
                  <span class="text-caption ml-2">
                    Sent {{ formatRelativeTime(invitation.created_at) }}
                  </span>
                </v-list-item-subtitle>
                <template v-slot:append>
                  <v-btn
                    icon
                    variant="text"
                    color="error"
                    size="small"
                    @click="handleCancelInvitation(invitation.id)"
                    :loading="cancellingInvitation === invitation.id"
                  >
                    <v-icon>mdi-close</v-icon>
                    <v-tooltip activator="parent" location="top">Cancel Invitation</v-tooltip>
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
            <v-card-text v-else class="text-center text-medium-emphasis">
              No pending invitations
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="4">
          <v-card>
            <v-card-title>
              <v-icon start>mdi-account-multiple</v-icon>
              Roster
              <v-chip size="small" class="ml-2">{{ members.length }}</v-chip>
            </v-card-title>
            <v-divider />

            <v-progress-linear v-if="loadingMembers" indeterminate />

            <v-list v-if="members.length > 0" density="compact">
              <v-list-item
                v-for="member in members"
                :key="member.player_id"
              >
                <template v-slot:prepend>
                  <v-avatar color="secondary" size="36" class="cursor-pointer" @click="goToPlayer(member.player_id)">
                    <v-img v-if="member.avatar_url" :src="member.avatar_url" />
                    <span v-else>{{ member.display_name.substring(0, 2).toUpperCase() }}</span>
                  </v-avatar>
                </template>
                <v-list-item-title class="cursor-pointer" @click="goToPlayer(member.player_id)">
                  {{ member.display_name }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  <v-chip size="x-small" :color="getRoleColor(member.role)">
                    {{ member.role }}
                  </v-chip>
                </v-list-item-subtitle>
                <template v-slot:append v-if="isCaptain && !isCurrentUser(member.player_id)">
                  <v-menu>
                    <template v-slot:activator="{ props }">
                      <v-btn icon variant="text" size="small" v-bind="props">
                        <v-icon>mdi-dots-vertical</v-icon>
                      </v-btn>
                    </template>
                    <v-list density="compact">
                      <v-list-subheader>Actions</v-list-subheader>
                      <v-list-item
                        v-if="member.role !== 'captain'"
                        @click="handlePromoteToCaptain(member.player_id)"
                      >
                        <template v-slot:prepend>
                          <v-icon>mdi-crown</v-icon>
                        </template>
                        <v-list-item-title>Promote to Captain</v-list-item-title>
                      </v-list-item>
                      <v-divider class="my-2" />
                      <v-list-item
                        class="text-error"
                        @click="confirmRemoveMember(member)"
                      >
                        <template v-slot:prepend>
                          <v-icon color="error">mdi-account-remove</v-icon>
                        </template>
                        <v-list-item-title>Remove from Team</v-list-item-title>
                      </v-list-item>
                    </v-list>
                  </v-menu>
                </template>
              </v-list-item>
            </v-list>
            <v-card-text v-else-if="!loadingMembers && !teamSeasonId" class="text-center text-medium-emphasis">
              <p class="mb-2">No season context available</p>
              <p class="text-caption">Navigate from a league to view roster</p>
            </v-card-text>
            <v-card-text v-else-if="!loadingMembers" class="text-center text-medium-emphasis">
              No members in this roster
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Confirm Remove Member Dialog -->
    <v-dialog v-model="removeDialogOpen" max-width="400">
      <v-card>
        <v-card-title class="text-h6">Remove Member</v-card-title>
        <v-card-text>
          Are you sure you want to remove <strong>{{ memberToRemove?.display_name }}</strong> from the team?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="removeDialogOpen = false">Cancel</v-btn>
          <v-btn color="error" variant="elevated" @click="handleRemoveMember" :loading="removing">
            Remove
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirm Leave Team Dialog -->
    <v-dialog v-model="leaveDialogOpen" max-width="400">
      <v-card>
        <v-card-title class="text-h6">Leave Team</v-card-title>
        <v-card-text>
          Are you sure you want to leave <strong>{{ team?.name }}</strong>?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="leaveDialogOpen = false">Cancel</v-btn>
          <v-btn color="error" variant="elevated" @click="handleLeaveTeam" :loading="leaving">
            Leave Team
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
import { useRoute, useRouter } from 'vue-router'
import { useLeagueTeamsStore, type LeagueTeamMemberWithPlayer, type LeagueTeamInvitationResponse } from '@/stores/leagueTeams'
import { useAuthStore } from '@/stores/auth'
import type { components } from '@/api/types'

type LeagueTeamResponse = components['schemas']['LeagueTeamResponse']

const route = useRoute()
const router = useRouter()
const teamsStore = useLeagueTeamsStore()
const authStore = useAuthStore()

const loading = ref(true)
const loadingMembers = ref(false)
const error = ref<string | null>(null)

const team = ref<LeagueTeamResponse | null>(null)
const members = computed(() => teamsStore.members)
const invitations = computed(() => teamsStore.invitations)

// Route params
const teamId = computed(() => route.params.id as string)
// team_season_id can come from query param or we need to look it up
const teamSeasonId = ref<string | null>(route.query.season as string | null)

// Check if current user is a member or captain
const currentPlayerId = computed(() => authStore.playerId)
const currentMember = computed(() =>
  members.value.find(m => m.player_id === currentPlayerId.value)
)
const isMember = computed(() => !!currentMember.value)
const isCaptain = computed(() => currentMember.value?.role === 'captain')

// Dialog state
const removeDialogOpen = ref(false)
const leaveDialogOpen = ref(false)
const memberToRemove = ref<LeagueTeamMemberWithPlayer | null>(null)
const removing = ref(false)
const leaving = ref(false)
const cancellingInvitation = ref<string | null>(null)
const showSuccess = ref(false)
const successMessage = ref('')

onMounted(async () => {
  try {
    // Fetch team details
    team.value = await teamsStore.fetchTeam(teamId.value)

    // If we don't have a team_season_id from query, try to find it from user's teams
    if (!teamSeasonId.value && authStore.isAuthenticated) {
      await teamsStore.fetchMyTeams()
      const myMembership = teamsStore.myTeams.find(t => t.team_id === teamId.value)
      if (myMembership) {
        teamSeasonId.value = myMembership.team_season_id
      }
    }

    // Fetch members if we have a team_season_id
    if (teamSeasonId.value) {
      loadingMembers.value = true
      await teamsStore.fetchMembers(teamSeasonId.value)
      loadingMembers.value = false

      // Fetch invitations if captain
      if (isCaptain.value) {
        await teamsStore.fetchTeamInvitations(teamSeasonId.value)
      }
    }
  } catch (e) {
    error.value = teamsStore.error || 'Failed to load team'
    console.error('Failed to load team:', e)
  } finally {
    loading.value = false
  }
})

function goBack() {
  // Try to go back, or fallback to leagues
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/leagues')
  }
}

function goToPlayer(playerId: string) {
  router.push(`/players/${playerId}`)
}

function isCurrentUser(playerId: string): boolean {
  return playerId === currentPlayerId.value
}

async function handlePromoteToCaptain(playerId: string) {
  if (!teamSeasonId.value) return

  try {
    await teamsStore.promoteToCaptain(teamSeasonId.value, playerId)
    successMessage.value = 'Member promoted to captain'
    showSuccess.value = true
    // Refresh members to update roles
    await teamsStore.fetchMembers(teamSeasonId.value)
  } catch (e) {
    error.value = teamsStore.error || 'Failed to promote member'
  }
}

function confirmRemoveMember(member: LeagueTeamMemberWithPlayer) {
  memberToRemove.value = member
  removeDialogOpen.value = true
}

async function handleRemoveMember() {
  if (!memberToRemove.value || !teamSeasonId.value) return

  removing.value = true
  try {
    await teamsStore.removeMember(teamSeasonId.value, memberToRemove.value.player_id)
    successMessage.value = `${memberToRemove.value.display_name} has been removed from the team`
    showSuccess.value = true
    removeDialogOpen.value = false
  } catch (e) {
    error.value = teamsStore.error || 'Failed to remove member'
  } finally {
    removing.value = false
    memberToRemove.value = null
  }
}

function confirmLeaveTeam() {
  leaveDialogOpen.value = true
}

async function handleLeaveTeam() {
  if (!teamSeasonId.value) return

  leaving.value = true
  try {
    await teamsStore.leaveTeam(teamSeasonId.value)
    router.push('/leagues')
  } catch (e) {
    error.value = teamsStore.error || 'Failed to leave team'
    leaveDialogOpen.value = false
  } finally {
    leaving.value = false
  }
}

async function handleCancelInvitation(invitationId: string) {
  cancellingInvitation.value = invitationId
  try {
    await teamsStore.cancelInvitation(invitationId)
    successMessage.value = 'Invitation cancelled'
    showSuccess.value = true
  } catch (e) {
    error.value = teamsStore.error || 'Failed to cancel invitation'
  } finally {
    cancellingInvitation.value = null
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  return `${diffDays} days ago`
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'success'
    case 'inactive': return 'grey'
    case 'disbanded': return 'error'
    default: return 'grey'
  }
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

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
