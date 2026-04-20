<template>
  <v-dialog
    v-model="open"
    max-width="900"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <div class="d-flex align-center">
          <v-avatar size="32" rounded="sm" class="mr-3">
            <v-img v-if="team?.team_logo_url" :src="team.team_logo_url" />
            <v-icon v-else>mdi-shield</v-icon>
          </v-avatar>
          <div>
            <span>{{ team?.team_name }}</span>
            <span class="text-caption text-grey ml-2">[{{ team?.team_tag }}]</span>
          </div>
        </div>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-tabs v-model="activeTab" color="primary">
        <v-tab value="roster">
          <v-icon start>mdi-account-group</v-icon>
          Roster
          <v-chip v-if="members.length > 0" size="x-small" class="ml-2">{{ members.length }}</v-chip>
        </v-tab>
        <v-tab value="invitations">
          <v-icon start>mdi-email-outline</v-icon>
          Invitations
          <v-chip v-if="invitations.length > 0" size="x-small" class="ml-2" color="info">{{ invitations.length }}</v-chip>
        </v-tab>
        <v-tab value="settings">
          <v-icon start>mdi-cog</v-icon>
          Settings
        </v-tab>
      </v-tabs>

      <v-divider />

      <v-card-text style="min-height: 400px">
        <v-window v-model="activeTab">
          <!-- Roster Tab -->
          <v-window-item value="roster">
            <div class="d-flex justify-space-between align-center mb-4">
              <div>
                <span class="text-body-2">
                  {{ members.length }} / {{ team?.team_size_max || '?' }} members
                </span>
                <v-chip
                  v-if="team?.roster_lock_status === 'locked'"
                  size="x-small"
                  color="error"
                  class="ml-2"
                >
                  Roster Locked
                </v-chip>
              </div>
              <v-btn
                color="primary"
                variant="tonal"
                prepend-icon="mdi-account-plus"
                size="small"
                :disabled="team?.roster_lock_status === 'locked'"
                @click="inviteModalOpen = true"
              >
                Invite Player
              </v-btn>
            </div>

            <div v-if="loadingMembers" class="text-center pa-8">
              <v-progress-circular indeterminate color="primary" />
            </div>

            <v-data-table
              v-else
              :headers="memberHeaders"
              :items="members"
              :items-per-page="10"
              class="elevation-1"
            >
              <template v-slot:item.avatar_url="{ item }">
                <v-avatar size="32">
                  <v-img v-if="item.avatar_url" :src="item.avatar_url" />
                  <v-icon v-else>mdi-account</v-icon>
                </v-avatar>
              </template>

              <template v-slot:item.display_name="{ item }">
                <div>
                  <div class="font-weight-medium">{{ item.display_name }}</div>
                  <div class="text-caption text-grey">{{ item.position || '-' }}</div>
                </div>
              </template>

              <template v-slot:item.role="{ item }">
                <v-chip
                  :color="getRoleColor(item.role)"
                  size="small"
                  variant="flat"
                >
                  {{ formatRole(item.role) }}
                </v-chip>
              </template>

              <template v-slot:item.jersey_number="{ item }">
                <span v-if="item.jersey_number" class="font-weight-medium">
                  #{{ item.jersey_number }}
                </span>
                <span v-else class="text-grey-lighten-1">-</span>
              </template>

              <template v-slot:item.joined_at="{ item }">
                {{ formatDate(item.joined_at) }}
              </template>

              <template v-slot:item.actions="{ item }">
                <v-menu v-if="item.role !== 'captain' || members.filter(m => m.role === 'captain').length > 1">
                  <template v-slot:activator="{ props }">
                    <v-btn
                      icon
                      size="small"
                      variant="text"
                      v-bind="props"
                      :disabled="team?.roster_lock_status === 'locked'"
                    >
                      <v-icon>mdi-dots-vertical</v-icon>
                    </v-btn>
                  </template>
                  <v-list density="compact">
                    <v-list-item
                      v-if="item.role !== 'captain'"
                      @click="promoteToCaptain(item)"
                    >
                      <v-list-item-title>Promote to Captain</v-list-item-title>
                    </v-list-item>
                    <v-list-item
                      v-if="item.role === 'captain' && members.filter(m => m.role === 'captain').length > 1"
                      @click="demoteFromCaptain(item)"
                    >
                      <v-list-item-title>Demote from Captain</v-list-item-title>
                    </v-list-item>
                    <v-divider />
                    <v-list-item
                      class="text-error"
                      @click="removeMember(item)"
                    >
                      <v-list-item-title>Remove from Team</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>
              </template>

              <template v-slot:no-data>
                <div class="text-center pa-8">
                  <v-icon size="48" color="grey-lighten-1">mdi-account-group-outline</v-icon>
                  <p class="text-grey mt-2">No team members yet</p>
                </div>
              </template>
            </v-data-table>
          </v-window-item>

          <!-- Invitations Tab -->
          <v-window-item value="invitations">
            <div v-if="loadingInvitations" class="text-center pa-8">
              <v-progress-circular indeterminate color="primary" />
            </div>

            <v-data-table
              v-else
              :headers="invitationHeaders"
              :items="invitations"
              :items-per-page="10"
              class="elevation-1"
            >
              <template v-slot:item.invitation_type="{ item }">
                <v-chip
                  :color="item.invitation_type === 'invite' ? 'info' : 'warning'"
                  size="small"
                  variant="flat"
                >
                  {{ item.invitation_type === 'invite' ? 'Invite' : 'Application' }}
                </v-chip>
              </template>

              <template v-slot:item.role="{ item }">
                {{ formatRole(item.role) }}
              </template>

              <template v-slot:item.status="{ item }">
                <v-chip
                  :color="getInvitationStatusColor(item.status)"
                  size="small"
                  variant="flat"
                >
                  {{ formatRole(item.status) }}
                </v-chip>
              </template>

              <template v-slot:item.created_at="{ item }">
                {{ formatDate(item.created_at) }}
              </template>

              <template v-slot:item.expires_at="{ item }">
                {{ formatDate(item.expires_at) }}
              </template>

              <template v-slot:item.actions="{ item }">
                <template v-if="item.status === 'pending'">
                  <v-btn
                    v-if="item.invitation_type === 'application'"
                    icon
                    size="small"
                    variant="text"
                    color="success"
                    @click="acceptInvitation(item)"
                    title="Accept Application"
                  >
                    <v-icon>mdi-check</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    size="small"
                    variant="text"
                    color="error"
                    @click="cancelInvitation(item)"
                    :title="item.invitation_type === 'invite' ? 'Cancel Invite' : 'Reject Application'"
                  >
                    <v-icon>mdi-close</v-icon>
                  </v-btn>
                </template>
              </template>

              <template v-slot:no-data>
                <div class="text-center pa-8">
                  <v-icon size="48" color="grey-lighten-1">mdi-email-outline</v-icon>
                  <p class="text-grey mt-2">No pending invitations</p>
                </div>
              </template>
            </v-data-table>
          </v-window-item>

          <!-- Settings Tab -->
          <v-window-item value="settings">
            <v-form ref="settingsFormRef" v-model="settingsFormValid">
              <v-row>
                <v-col cols="12">
                  <v-text-field
                    v-model="settingsForm.name"
                    label="Team Name"
                    :rules="[rules.required, rules.minLength(2)]"
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>

                <v-col cols="12">
                  <v-text-field
                    v-model="settingsForm.tag"
                    label="Team Tag"
                    :rules="[rules.required, rules.minLength(2), rules.maxLength(8)]"
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>

                <v-col cols="12">
                  <v-textarea
                    v-model="settingsForm.description"
                    label="Description"
                    rows="2"
                    variant="outlined"
                    density="comfortable"
                  />
                </v-col>

                <v-col cols="12">
                  <v-btn
                    color="primary"
                    variant="flat"
                    :loading="savingSettings"
                    :disabled="!settingsFormValid"
                    @click="saveSettings"
                  >
                    Save Settings
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Close</v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>

    </v-card>

    <!-- Invite Player Modal -->
    <LeagueTeamInviteModal
      v-model="inviteModalOpen"
      :team-season-id="team?.team_season_id || ''"
      @invited="onPlayerInvited"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { components } from '@/api/types'
import LeagueTeamInviteModal from './LeagueTeamInviteModal.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useFormRules } from '@/composables/useFormRules'
import { formatDate } from '@/utils/formatters'
import {
  useLeagueTeamsStore,
  type LeagueTeamMemberWithPlayer,
  type LeagueTeamInvitationResponse,
} from '@/stores/leagueTeams'

type LeagueTeamSummary = components['schemas']['LeagueTeamSummaryResponse']

type TeamMember = LeagueTeamMemberWithPlayer
type TeamInvitation = LeagueTeamInvitationResponse

const props = defineProps<{  team: LeagueTeamSummary | null
  seasonId: string
}>()

const emit = defineEmits<{  updated: []
}>()

const open = defineModel<boolean>({ required: true })

// Store + feedback helpers replace the raw-fetch + manual try/catch pattern.
const leagueTeamsStore = useLeagueTeamsStore()
const snackbar = useSnackbar()
const feedback = useActionFeedback()

// State
const activeTab = ref('roster')
const error = ref<string | null>(null)

// Members + invitations come from the store; we read the store's collections
// rather than keeping a local copy. Loading flags come from per-action states.
const members = computed<TeamMember[]>(() => leagueTeamsStore.members)
const invitations = computed<TeamInvitation[]>(() => leagueTeamsStore.invitations)
const loadingMembers = computed(() => leagueTeamsStore.fetchMembersState.loading)
const loadingInvitations = computed(() => leagueTeamsStore.fetchTeamInvitationsState.loading)

const inviteModalOpen = ref(false)

// Settings
const settingsFormRef = ref()
const settingsFormValid = ref(false)
const savingSettings = computed(() => leagueTeamsStore.updateTeamState.loading)
const settingsForm = ref({
  name: '',
  tag: '',
  description: '',
})

const memberHeaders = [
  { title: '', key: 'avatar_url', width: '50px', sortable: false },
  { title: 'Player', key: 'display_name' },
  { title: 'Role', key: 'role', width: '120px' },
  { title: '#', key: 'jersey_number', width: '60px' },
  { title: 'Joined', key: 'joined_at', width: '100px' },
  { title: '', key: 'actions', width: '60px', sortable: false },
]

const invitationHeaders = [
  { title: 'Player ID', key: 'player_id' },
  { title: 'Type', key: 'invitation_type', width: '100px' },
  { title: 'Role', key: 'role', width: '100px' },
  { title: 'Status', key: 'status', width: '100px' },
  { title: 'Sent', key: 'created_at', width: '100px' },
  { title: 'Expires', key: 'expires_at', width: '100px' },
  { title: 'Actions', key: 'actions', width: '100px', sortable: false },
]

const rules = useFormRules()

// Watch for dialog opening
watch(open, async (isOpen) => {
  if (isOpen && props.team) {
    activeTab.value = 'roster'
    settingsForm.value = {
      name: props.team.team_name,
      tag: props.team.team_tag,
      description: '',
    }
    await loadTeamData()
  }
})

async function loadTeamData() {
  if (!props.team?.team_season_id) return
  const seasonId = props.team.team_season_id
  // The store's withActionState already reports per-action errors; surface
  // the first one to the modal-level banner if either fetch fails.
  await Promise.allSettled([
    leagueTeamsStore.fetchMembers(seasonId),
    leagueTeamsStore.fetchTeamInvitations(seasonId),
  ])
  error.value =
    leagueTeamsStore.fetchMembersState.error
    ?? leagueTeamsStore.fetchTeamInvitationsState.error
    ?? null
}

async function promoteToCaptain(member: TeamMember) {
  if (!props.team?.team_season_id) return
  const seasonId = props.team.team_season_id
  await feedback.run(
    () => leagueTeamsStore.promoteToCaptain(seasonId, member.player_id),
    {
      success: `${member.display_name} promoted to captain`,
      errorSource: leagueTeamsStore.promoteToCaptainState,
      after: () => emit('updated'),
    },
  )
}

async function demoteFromCaptain(member: TeamMember) {
  if (!props.team?.team_season_id) return
  const seasonId = props.team.team_season_id
  await feedback.run(
    () => leagueTeamsStore.demoteFromCaptain(seasonId, member.player_id),
    {
      success: `${member.display_name} demoted from captain`,
      errorSource: leagueTeamsStore.demoteFromCaptainState,
      after: () => emit('updated'),
    },
  )
}

async function removeMember(member: TeamMember) {
  if (!props.team?.team_season_id) return
  const seasonId = props.team.team_season_id
  await feedback.run(
    () => leagueTeamsStore.removeMember(seasonId, member.player_id),
    {
      success: `${member.display_name} removed from team`,
      errorSource: leagueTeamsStore.removeMemberState,
      after: () => emit('updated'),
    },
  )
}

async function acceptInvitation(invitation: TeamInvitation) {
  const result = await feedback.run(
    () => leagueTeamsStore.acceptApplication(invitation.id),
    {
      success: 'Application accepted',
      errorSource: leagueTeamsStore.acceptApplicationState,
    },
  )
  if (result !== null && props.team?.team_season_id) {
    // Roster changed too after acceptance — refresh members.
    await leagueTeamsStore.fetchMembers(props.team.team_season_id)
    emit('updated')
  }
}

async function cancelInvitation(invitation: TeamInvitation) {
  await feedback.run(
    () => leagueTeamsStore.cancelInvitation(invitation.id),
    {
      success: 'Invitation cancelled',
      errorSource: leagueTeamsStore.cancelInvitationState,
    },
  )
}

async function saveSettings() {
  if (!settingsFormValid.value || !props.team) return

  const body: { name?: string; tag?: string; description?: string } = {}
  if (settingsForm.value.name !== props.team.team_name) {
    body.name = settingsForm.value.name
  }
  if (settingsForm.value.tag !== props.team.team_tag) {
    body.tag = settingsForm.value.tag
  }
  if (settingsForm.value.description) {
    body.description = settingsForm.value.description
  }

  if (Object.keys(body).length === 0) {
    snackbar.show('No changes to save', 'info')
    return
  }

  const teamId = props.team.team_id
  await feedback.run(
    () => leagueTeamsStore.updateTeam(teamId, body),
    {
      success: 'Team settings saved',
      errorSource: leagueTeamsStore.updateTeamState,
      after: () => emit('updated'),
    },
  )
}

function onPlayerInvited() {
  snackbar.show('Invitation sent', 'success')
  if (props.team?.team_season_id) {
    leagueTeamsStore.fetchTeamInvitations(props.team.team_season_id)
  }
}

// Helpers
function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'captain': return 'primary'
    case 'player': return 'success'
    case 'substitute': return 'info'
    default: return 'grey'
  }
}

function getInvitationStatusColor(status: string): string {
  switch (status) {
    case 'pending': return 'warning'
    case 'accepted': return 'success'
    case 'declined': return 'error'
    case 'cancelled': return 'grey'
    case 'expired': return 'grey'
    default: return 'grey'
  }
}

function close() {
  error.value = null
  open.value = false
}
</script>
