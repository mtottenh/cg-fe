<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
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
import { ref, watch } from 'vue'
import { ApiError } from '@/api'
import type { components } from '@/api/types'
import LeagueTeamInviteModal from './LeagueTeamInviteModal.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useFormRules } from '@/composables/useFormRules'
import { formatDate } from '@/utils/formatters'

type LeagueTeamSummary = components['schemas']['LeagueTeamSummaryResponse']

interface TeamMember {
  id: string
  team_season_id: string
  player_id: string
  display_name: string
  avatar_url: string | null
  role: string
  position: string | null
  jersey_number: number | null
  status: string
  joined_at: string
  left_at: string | null
}

interface TeamInvitation {
  id: string
  team_season_id: string
  player_id: string
  invitation_type: string
  role: string
  status: string
  message: string | null
  invited_by: string | null
  expires_at: string
  created_at: string
  responded_at: string | null
}

const props = defineProps<{
  modelValue: boolean
  team: LeagueTeamSummary | null
  seasonId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  updated: []
}>()

// State
const activeTab = ref('roster')
const error = ref<string | null>(null)

// Members
const members = ref<TeamMember[]>([])
const loadingMembers = ref(false)

// Invitations
const invitations = ref<TeamInvitation[]>([])
const loadingInvitations = ref(false)
const inviteModalOpen = ref(false)

// Settings
const settingsFormRef = ref()
const settingsFormValid = ref(false)
const savingSettings = ref(false)
const settingsForm = ref({
  name: '',
  tag: '',
  description: '',
})

// Snackbar
const snackbar = useSnackbar()

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

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
watch(() => props.modelValue, async (isOpen) => {
  if (isOpen && props.team) {
    activeTab.value = 'roster'
    settingsForm.value = {
      name: props.team.team_name,
      tag: props.team.team_tag,
      description: '',
    }
    await Promise.all([fetchMembers(), fetchInvitations()])
  }
})

// API calls
async function fetchMembers() {
  if (!props.team?.team_season_id) return

  loadingMembers.value = true
  try {
    const response = await fetch(`${API_URL}/v1/league-team-seasons/${props.team.team_season_id}/members`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to fetch members')
    }

    const result = await response.json()
    members.value = result.data
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to load members'
    }
  } finally {
    loadingMembers.value = false
  }
}

async function fetchInvitations() {
  if (!props.team?.team_season_id) return

  loadingInvitations.value = true
  try {
    const response = await fetch(`${API_URL}/v1/league-team-seasons/${props.team.team_season_id}/invitations`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to fetch invitations')
    }

    const result = await response.json()
    invitations.value = result.data
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to load invitations'
    }
  } finally {
    loadingInvitations.value = false
  }
}

async function promoteToCaptain(member: TeamMember) {
  if (!props.team?.team_season_id) return

  try {
    const response = await fetch(`${API_URL}/v1/league-team-seasons/${props.team.team_season_id}/members/${member.player_id}/promote`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to promote member')
    }

    snackbar.show(`${member.display_name} promoted to captain`, 'success')
    await fetchMembers()
    emit('updated')
  } catch (e) {
    if (e instanceof ApiError) {
      snackbar.show(e.detail, 'error')
    } else {
      snackbar.show('Failed to promote member', 'error')
    }
  }
}

async function demoteFromCaptain(member: TeamMember) {
  if (!props.team?.team_season_id) return

  try {
    const response = await fetch(`${API_URL}/v1/league-team-seasons/${props.team.team_season_id}/members/${member.player_id}/demote`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to demote member')
    }

    snackbar.show(`${member.display_name} demoted from captain`, 'success')
    await fetchMembers()
    emit('updated')
  } catch (e) {
    if (e instanceof ApiError) {
      snackbar.show(e.detail, 'error')
    } else {
      snackbar.show('Failed to demote member', 'error')
    }
  }
}

async function removeMember(member: TeamMember) {
  if (!props.team?.team_season_id) return

  try {
    const response = await fetch(`${API_URL}/v1/league-team-seasons/${props.team.team_season_id}/members/${member.player_id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to remove member')
    }

    snackbar.show(`${member.display_name} removed from team`, 'success')
    await fetchMembers()
    emit('updated')
  } catch (e) {
    if (e instanceof ApiError) {
      snackbar.show(e.detail, 'error')
    } else {
      snackbar.show('Failed to remove member', 'error')
    }
  }
}

async function acceptInvitation(invitation: TeamInvitation) {
  try {
    const response = await fetch(`${API_URL}/v1/league-team-invitations/${invitation.id}/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to accept invitation')
    }

    snackbar.show('Application accepted', 'success')
    await Promise.all([fetchMembers(), fetchInvitations()])
    emit('updated')
  } catch (e) {
    if (e instanceof ApiError) {
      snackbar.show(e.detail, 'error')
    } else {
      snackbar.show('Failed to accept invitation', 'error')
    }
  }
}

async function cancelInvitation(invitation: TeamInvitation) {
  try {
    const response = await fetch(`${API_URL}/v1/league-team-invitations/${invitation.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to cancel invitation')
    }

    snackbar.show('Invitation cancelled', 'success')
    await fetchInvitations()
  } catch (e) {
    if (e instanceof ApiError) {
      snackbar.show(e.detail, 'error')
    } else {
      snackbar.show('Failed to cancel invitation', 'error')
    }
  }
}

async function saveSettings() {
  if (!settingsFormValid.value || !props.team) return

  savingSettings.value = true
  try {
    const body: Record<string, unknown> = {}

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

    const response = await fetch(`${API_URL}/v1/league-teams/${props.team.team_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to update team')
    }

    snackbar.show('Team settings saved', 'success')
    emit('updated')
  } catch (e) {
    if (e instanceof ApiError) {
      snackbar.show(e.detail, 'error')
    } else {
      snackbar.show('Failed to save settings', 'error')
    }
  } finally {
    savingSettings.value = false
  }
}

function onPlayerInvited() {
  snackbar.show('Invitation sent', 'success')
  fetchInvitations()
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
  emit('update:modelValue', false)
}
</script>
