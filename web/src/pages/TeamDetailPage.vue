<template>
  <v-container>
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
                  <v-img alt="" v-if="team.logo_url" :src="team.logo_url" />
                  <span v-else class="text-h5">{{ team.tag.substring(0, 2) }}</span>
                </v-avatar>
              </template>
              <v-card-title class="text-h4">{{ team.name }}</v-card-title>
              <v-card-subtitle class="team-tag text-h6">[{{ team.tag }}]</v-card-subtitle>
              <template v-slot:append>
                <div class="d-flex ga-2">
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
                  <v-btn
                    v-if="canApplyToTeam"
                    color="primary"
                    variant="outlined"
                    @click="showApplyDialog = true"
                  >
                    <v-icon start>mdi-account-plus</v-icon>
                    Apply to Join
                  </v-btn>
                </div>
              </template>
            </v-card-item>
            <v-card-text v-if="team.description">
              <p>{{ team.description }}</p>
            </v-card-text>
            <v-divider />
            <v-card-text>
              <div class="d-flex align-center ga-4 text-caption text-medium-emphasis">
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
            <v-card-title class="d-flex align-center">
              <v-icon start>mdi-email-outline</v-icon>
              <span>Pending Invitations</span>
              <v-chip v-if="invitations.length > 0" size="small" color="info" class="ml-2">
                {{ invitations.length }}
              </v-chip>
              <v-spacer />
              <!--
                Captain-facing entry point to the shared invite modal
                (COVERAGE-PLAN §9b P-12). Before this, a captain's only way to
                invite was to find the player's own profile page; the modal was
                mounted exclusively from the admin surface.
              -->
              <v-btn
                color="primary"
                variant="tonal"
                size="small"
                prepend-icon="mdi-account-plus"
                @click="showInviteModal = true"
              >
                Invite Player
              </v-btn>
            </v-card-title>
            <v-divider />
            <v-list v-if="invitations.length > 0">
              <v-list-item
                v-for="invitation in invitations"
                :key="invitation.id"
              >
                <template v-slot:prepend>
                  <v-avatar color="grey" size="36">
                    <v-img
                      v-if="invitation.player_avatar_url"
                      :src="invitation.player_avatar_url"
                      :alt="invitation.player_display_name ?? 'Invited player'"
                    />
                    <v-icon v-else>mdi-account</v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title>
                  {{ invitation.player_display_name || 'Unknown player' }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  <v-chip size="x-small" :color="getRoleColor(invitation.role)">
                    {{ invitation.role }}
                  </v-chip>
                  <span class="text-caption ml-2">
                    Sent {{ formatRelativeTime(invitation.created_at) }}
                  </span>
                </v-list-item-subtitle>
                <template v-slot:append>
                  <v-btn aria-label="Cancel invitation"
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
                    <v-img alt="" v-if="member.avatar_url" :src="member.avatar_url" />
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
                      <v-btn aria-label="Member actions" icon variant="text" size="small" v-bind="props">
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
              <p class="mb-2">This team is not registered in any season yet</p>
              <p class="text-caption">The roster appears once the team joins a league season.</p>
            </v-card-text>
            <v-card-text v-else-if="!loadingMembers" class="text-center text-medium-emphasis">
              No members in this roster
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Apply to Team Dialog -->
    <v-dialog v-model="showApplyDialog" max-width="400">
      <v-card>
        <v-card-title>Apply to Join {{ team?.name }}</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-4">Your application will be reviewed by a team captain.</p>
          <v-textarea
            v-model="applyMessage"
            label="Message (optional)"
            rows="2"
            hint="Introduce yourself to the team"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showApplyDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="applyingToTeam"
            @click="handleApplyToTeam"
          >
            Submit Application
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Invite Player (captain only; needs a seasonal roster to invite onto) -->
    <LeagueTeamInviteModal
      v-if="isCaptain && teamSeasonId"
      v-model="showInviteModal"
      :team-season-id="teamSeasonId"
      @invited="handlePlayerInvited"
    />

    <!-- Confirm Dialog -->
    <ConfirmDialogHost :dialog="confirmDialog" />

    <!-- Success Snackbar -->
    <v-snackbar v-model="showSuccess" color="success" :timeout="3000">
      {{ successMessage }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useLeagueTeamsStore, type LeagueTeamMemberWithPlayer } from '@/stores/leagueTeams'
import { useLeagueSeasonsStore } from '@/stores/leagueSeasons'
import { useAuthStore } from '@/stores/auth'
import { useTeamContext } from '@/composables/useTeamContext'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import LeagueTeamInviteModal from '@/components/team/LeagueTeamInviteModal.vue'
import { teamRoleMap, teamStatusMap, getStatusColor as mapStatusColor } from '@/utils/statusMaps'
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
const { members, invitations } = storeToRefs(teamsStore)

// Route params
const teamId = computed(() => route.params.id as string)
// team_season_id can come from query param or we need to look it up
const teamSeasonId = ref<string | null>(route.query.season as string | null)

// Keep teamSeasonId reactive to URL changes
watch(() => route.query.season, (newSeason) => {
  if (newSeason) {
    teamSeasonId.value = newSeason as string
  }
})

const { isMember, isCaptain } = useTeamContext(teamSeasonId)

// Dialog state
const confirmDialog = useConfirmDialog()
const cancellingInvitation = ref<string | null>(null)
const showSuccess = ref(false)
const successMessage = ref('')
const showApplyDialog = ref(false)
const applyMessage = ref('')
const applyingToTeam = ref(false)
const showInviteModal = ref(false)

const canApplyToTeam = computed(() => {
  if (!authStore.isAuthenticated || !teamSeasonId.value) return false
  if (isMember.value) return false
  return true
})

/**
 * Resolve this team's team_season_id from its league when the URL carries no
 * ?season= and the viewer is not a member — makes bare /teams/{id} deep
 * links work. Checks the most recent seasons first (max 3 requests).
 */
async function resolveSeasonFromLeague(leagueId: string): Promise<string | null> {
  const seasonsStore = useLeagueSeasonsStore()
  const seasons = await seasonsStore.fetchSeasons(leagueId).catch(() => [])
  const ranked = [...seasons].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  // Active seasons are the most likely home for the roster being looked at.
  ranked.sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress'))
  for (const season of ranked.slice(0, 3)) {
    const seasonTeams = await teamsStore.fetchTeamsInSeason(season.id).catch(() => [])
    const entry = seasonTeams.find((t) => t.team_id === teamId.value)
    if (entry?.team_season_id) return entry.team_season_id
  }
  return null
}

onMounted(async () => {
  try {
    // Fetch team details
    team.value = await teamsStore.fetchTeam(teamId.value)

    // Fetch user's teams so useTeamContext can determine membership/role
    if (authStore.isAuthenticated) {
      await teamsStore.fetchMyTeams()
      // If we don't have a team_season_id from query, try to find it from user's teams
      if (!teamSeasonId.value) {
        const myMembership = teamsStore.myTeams.find(t => t.team_id === teamId.value)
        if (myMembership) {
          teamSeasonId.value = myMembership.team_season_id
        }
      }
    }

    // Deep link without ?season= and not a member: resolve the team's
    // season from its league so /teams/{id} works standalone.
    if (!teamSeasonId.value && team.value) {
      teamSeasonId.value = await resolveSeasonFromLeague(team.value.league_id)
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
  return playerId === authStore.playerId
}

async function handlePromoteToCaptain(playerId: string) {
  if (!teamSeasonId.value) return

  try {
    await teamsStore.promoteToCaptain(teamSeasonId.value, playerId)
    successMessage.value = 'Member promoted to captain'
    showSuccess.value = true
    // Refresh members to update roles
    await teamsStore.fetchMembers(teamSeasonId.value)
  } catch {
    error.value = teamsStore.error || 'Failed to promote member'
  }
}

function confirmRemoveMember(member: LeagueTeamMemberWithPlayer) {
  confirmDialog.confirm({
    title: 'Remove Member',
    message: `Are you sure you want to remove ${member.display_name} from the team?`,
    action: 'Remove',
    color: 'error',
    handler: async () => {
      if (!teamSeasonId.value) return
      await teamsStore.removeMember(teamSeasonId.value, member.player_id)
      successMessage.value = `${member.display_name} has been removed from the team`
      showSuccess.value = true
    },
  })
}

function confirmLeaveTeam() {
  confirmDialog.confirm({
    title: 'Leave Team',
    message: `Are you sure you want to leave ${team.value?.name}?`,
    action: 'Leave Team',
    color: 'error',
    handler: async () => {
      if (!teamSeasonId.value) return
      await teamsStore.leaveTeam(teamSeasonId.value)
      router.push('/leagues')
    },
  })
}

/**
 * The invite POST response does not carry the invited player's display name —
 * only the list endpoint hydrates it (`get_team_invitations`,
 * portal-api/src/handlers/league_teams/invitation.rs:188-208) — so the store's
 * optimistic append would render "Unknown player". Refetch instead.
 */
async function handlePlayerInvited() {
  successMessage.value = 'Invitation sent'
  showSuccess.value = true
  if (!teamSeasonId.value) return
  try {
    await teamsStore.fetchTeamInvitations(teamSeasonId.value)
  } catch {
    error.value = teamsStore.error || 'Failed to refresh invitations'
  }
}

async function handleCancelInvitation(invitationId: string) {
  cancellingInvitation.value = invitationId
  try {
    await teamsStore.cancelInvitation(invitationId)
    successMessage.value = 'Invitation cancelled'
    showSuccess.value = true
  } catch {
    error.value = teamsStore.error || 'Failed to cancel invitation'
  } finally {
    cancellingInvitation.value = null
  }
}

async function handleApplyToTeam() {
  if (!teamSeasonId.value) return
  applyingToTeam.value = true
  try {
    await teamsStore.applyToTeam(teamSeasonId.value, applyMessage.value || undefined)
    successMessage.value = 'Application submitted!'
    showSuccess.value = true
    showApplyDialog.value = false
    applyMessage.value = ''
  } catch {
    error.value = teamsStore.error || 'Failed to apply to team'
  } finally {
    applyingToTeam.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
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

const getStatusColor = (status: string) => mapStatusColor(teamStatusMap, status)
const getRoleColor = (role: string) => mapStatusColor(teamRoleMap, role)
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
