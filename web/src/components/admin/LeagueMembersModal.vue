<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="900"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Manage Members: {{ league?.league_name }}</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-tabs v-model="activeTab" color="primary">
        <v-tab value="members">
          <v-icon start>mdi-account-group</v-icon>
          Members
          <v-chip v-if="members.length > 0" size="x-small" class="ml-2">{{ members.length }}</v-chip>
        </v-tab>
        <v-tab value="invitations">
          <v-icon start>mdi-email-outline</v-icon>
          Invitations
          <v-chip v-if="invitations.length > 0" size="x-small" class="ml-2" color="info">{{ invitations.length }}</v-chip>
        </v-tab>
        <v-tab value="applications">
          <v-icon start>mdi-clipboard-account</v-icon>
          Applications
          <v-chip v-if="applications.length > 0" size="x-small" class="ml-2" color="warning">{{ applications.length }}</v-chip>
        </v-tab>
      </v-tabs>

      <v-divider />

      <v-card-text style="min-height: 400px">
        <v-window v-model="activeTab">
          <!-- Members Tab -->
          <v-window-item value="members">
            <div v-if="loadingMembers" class="text-center pa-8">
              <v-progress-circular indeterminate color="primary" />
            </div>

            <v-data-table
              v-else
              :headers="memberHeaders"
              :items="members"
              :items-per-page="10"
              class="elevation-0"
            >
              <template v-slot:item.username="{ item }">
                <div>
                  <div class="font-weight-medium">{{ item.username }}</div>
                  <div class="text-caption text-grey">{{ item.email }}</div>
                </div>
              </template>

              <template v-slot:item.membership_type="{ item }">
                <v-chip
                  :color="getRoleColor(item.membership_type)"
                  size="small"
                  variant="flat"
                >
                  {{ formatRole(item.membership_type) }}
                </v-chip>
              </template>

              <template v-slot:item.joined_at="{ item }">
                {{ formatDate(item.joined_at) }}
              </template>

              <template v-slot:item.actions="{ item }">
                <v-menu>
                  <template v-slot:activator="{ props }">
                    <v-btn
                      icon
                      size="small"
                      variant="text"
                      v-bind="props"
                      :disabled="item.membership_type === 'owner'"
                      title="Change Role"
                    >
                      <v-icon>mdi-account-cog</v-icon>
                    </v-btn>
                  </template>
                  <v-list density="compact">
                    <v-list-subheader>Change Role</v-list-subheader>
                    <v-list-item
                      v-for="role in availableRoles"
                      :key="role.value"
                      :disabled="item.membership_type === role.value"
                      @click="updateMemberRole(item, role.value)"
                    >
                      <v-list-item-title>{{ role.label }}</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>

                <v-btn
                  icon
                  size="small"
                  variant="text"
                  color="error"
                  :disabled="item.membership_type === 'owner'"
                  :loading="removingMemberId === item.user_id"
                  @click="removeMember(item)"
                  title="Remove Member"
                >
                  <v-icon>mdi-account-remove</v-icon>
                </v-btn>
              </template>

              <template v-slot:no-data>
                <div class="text-center pa-8">
                  <v-icon size="48" color="grey-lighten-1">mdi-account-group-outline</v-icon>
                  <p class="text-grey mt-2">No members found</p>
                </div>
              </template>
            </v-data-table>
          </v-window-item>

          <!-- Invitations Tab -->
          <v-window-item value="invitations">
            <div class="d-flex justify-end mb-4">
              <v-btn
                color="primary"
                variant="tonal"
                prepend-icon="mdi-account-plus"
                @click="inviteModalOpen = true"
              >
                Invite User
              </v-btn>
            </div>

            <div v-if="loadingInvitations" class="text-center pa-8">
              <v-progress-circular indeterminate color="primary" />
            </div>

            <v-data-table
              v-else
              :headers="invitationHeaders"
              :items="invitations"
              :items-per-page="10"
              class="elevation-0"
            >
              <template v-slot:item.user_id="{ item }">
                <span class="text-caption">{{ item.user_id.substring(0, 8) }}...</span>
              </template>

              <template v-slot:item.status="{ item }">
                <v-chip size="small" color="info" variant="flat">
                  {{ item.status }}
                </v-chip>
              </template>

              <template v-slot:item.created_at="{ item }">
                {{ formatDate(item.created_at) }}
              </template>

              <template v-slot:item.expires_at="{ item }">
                {{ item.expires_at ? formatDate(item.expires_at) : 'Never' }}
              </template>

              <template v-slot:item.actions="{ item }">
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  color="error"
                  :loading="cancellingInvitationId === item.id"
                  @click="cancelInvitation(item)"
                  title="Cancel Invitation"
                >
                  <v-icon>mdi-close-circle</v-icon>
                </v-btn>
              </template>

              <template v-slot:no-data>
                <div class="text-center pa-8">
                  <v-icon size="48" color="grey-lighten-1">mdi-email-outline</v-icon>
                  <p class="text-grey mt-2">No pending invitations</p>
                </div>
              </template>
            </v-data-table>
          </v-window-item>

          <!-- Applications Tab -->
          <v-window-item value="applications">
            <div v-if="loadingApplications" class="text-center pa-8">
              <v-progress-circular indeterminate color="primary" />
            </div>

            <v-data-table
              v-else
              :headers="applicationHeaders"
              :items="applications"
              :items-per-page="10"
              class="elevation-0"
            >
              <template v-slot:item.user_id="{ item }">
                <span class="text-caption">{{ item.user_id.substring(0, 8) }}...</span>
              </template>

              <template v-slot:item.message="{ item }">
                <span v-if="item.message" class="text-truncate" style="max-width: 200px; display: inline-block;">
                  {{ item.message }}
                </span>
                <span v-else class="text-grey-lighten-1">-</span>
              </template>

              <template v-slot:item.status="{ item }">
                <v-chip size="small" color="warning" variant="flat">
                  {{ item.status }}
                </v-chip>
              </template>

              <template v-slot:item.created_at="{ item }">
                {{ formatDate(item.created_at) }}
              </template>

              <template v-slot:item.actions="{ item }">
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  color="success"
                  :loading="processingApplicationId === item.id && approving"
                  @click="approveApplication(item)"
                  title="Approve"
                >
                  <v-icon>mdi-check-circle</v-icon>
                </v-btn>
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  color="error"
                  :loading="processingApplicationId === item.id && !approving"
                  @click="rejectApplication(item)"
                  title="Reject"
                >
                  <v-icon>mdi-close-circle</v-icon>
                </v-btn>
              </template>

              <template v-slot:no-data>
                <div class="text-center pa-8">
                  <v-icon size="48" color="grey-lighten-1">mdi-clipboard-account-outline</v-icon>
                  <p class="text-grey mt-2">No pending applications</p>
                </div>
              </template>
            </v-data-table>
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

      <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
        {{ snackbarText }}
      </v-snackbar>
    </v-card>

    <!-- Invite User Modal -->
    <InviteUserModal
      v-model="inviteModalOpen"
      :league-id="league?.league_id || ''"
      @invited="onUserInvited"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ApiError } from '@/api'
import { type UserLeagueMembership } from '@/stores/leagues'
import InviteUserModal from './InviteUserModal.vue'

interface LeagueMember {
  id: string
  league_id: string
  user_id: string
  username: string
  email: string
  membership_type: string
  joined_at: string
}

interface LeagueInvitation {
  id: string
  league_id: string
  user_id: string
  invitation_type: string
  status: string
  message: string | null
  invited_by: string | null
  responded_by: string | null
  responded_at: string | null
  expires_at: string | null
  created_at: string
}

const props = defineProps<{
  modelValue: boolean
  league: UserLeagueMembership | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  updated: []
}>()

// State
const activeTab = ref('members')
const error = ref<string | null>(null)

// Members
const members = ref<LeagueMember[]>([])
const loadingMembers = ref(false)
const removingMemberId = ref<string | null>(null)

// Invitations
const invitations = ref<LeagueInvitation[]>([])
const loadingInvitations = ref(false)
const cancellingInvitationId = ref<string | null>(null)
const inviteModalOpen = ref(false)

// Applications
const applications = ref<LeagueInvitation[]>([])
const loadingApplications = ref(false)
const processingApplicationId = ref<string | null>(null)
const approving = ref(false)

// Snackbar
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Table headers
const memberHeaders = [
  { title: 'User', key: 'username' },
  { title: 'Role', key: 'membership_type', width: '120px' },
  { title: 'Joined', key: 'joined_at', width: '120px' },
  { title: 'Actions', key: 'actions', width: '100px', sortable: false, align: 'center' as const },
]

const invitationHeaders = [
  { title: 'User ID', key: 'user_id' },
  { title: 'Status', key: 'status', width: '100px' },
  { title: 'Sent', key: 'created_at', width: '120px' },
  { title: 'Expires', key: 'expires_at', width: '120px' },
  { title: 'Actions', key: 'actions', width: '80px', sortable: false, align: 'center' as const },
]

const applicationHeaders = [
  { title: 'User ID', key: 'user_id' },
  { title: 'Message', key: 'message' },
  { title: 'Status', key: 'status', width: '100px' },
  { title: 'Applied', key: 'created_at', width: '120px' },
  { title: 'Actions', key: 'actions', width: '100px', sortable: false, align: 'center' as const },
]

const availableRoles = [
  { value: 'admin', label: 'Admin' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'member', label: 'Member' },
]

// Helpers
function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'owner': return 'purple'
    case 'admin': return 'primary'
    case 'moderator': return 'info'
    default: return 'grey'
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

function showSnackbar(text: string, color: string) {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

// Watch for dialog opening
watch(() => props.modelValue, async (isOpen) => {
  if (isOpen && props.league) {
    activeTab.value = 'members'
    await Promise.all([
      fetchMembers(),
      fetchInvitations(),
      fetchApplications(),
    ])
  }
})

// API calls
async function fetchMembers() {
  if (!props.league) return

  loadingMembers.value = true
  try {
    const response = await fetch(`${API_URL}/v1/leagues/${props.league.league_id}/members`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to fetch members')
    }

    members.value = await response.json()
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
  if (!props.league) return

  loadingInvitations.value = true
  try {
    const response = await fetch(`${API_URL}/v1/leagues/${props.league.league_id}/invitations`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to fetch invitations')
    }

    invitations.value = await response.json()
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

async function fetchApplications() {
  if (!props.league) return

  loadingApplications.value = true
  try {
    const response = await fetch(`${API_URL}/v1/leagues/${props.league.league_id}/applications`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to fetch applications')
    }

    applications.value = await response.json()
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to load applications'
    }
  } finally {
    loadingApplications.value = false
  }
}

async function updateMemberRole(member: LeagueMember, newRole: string) {
  if (!props.league) return

  try {
    const response = await fetch(`${API_URL}/v1/leagues/${props.league.league_id}/members/${member.user_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ membership_type: newRole }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to update role')
    }

    showSnackbar(`Changed ${member.username}'s role to ${formatRole(newRole)}`, 'success')
    await fetchMembers()
    emit('updated')
  } catch (e) {
    if (e instanceof ApiError) {
      showSnackbar(e.detail, 'error')
    } else {
      showSnackbar('Failed to update role', 'error')
    }
  }
}

async function removeMember(member: LeagueMember) {
  if (!props.league) return

  removingMemberId.value = member.user_id
  try {
    const response = await fetch(`${API_URL}/v1/leagues/${props.league.league_id}/members/${member.user_id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to remove member')
    }

    showSnackbar(`Removed ${member.username} from the league`, 'success')
    await fetchMembers()
    emit('updated')
  } catch (e) {
    if (e instanceof ApiError) {
      showSnackbar(e.detail, 'error')
    } else {
      showSnackbar('Failed to remove member', 'error')
    }
  } finally {
    removingMemberId.value = null
  }
}

async function cancelInvitation(invitation: LeagueInvitation) {
  if (!props.league) return

  cancellingInvitationId.value = invitation.id
  try {
    // Use the reject endpoint to cancel an invitation
    const response = await fetch(`${API_URL}/v1/leagues/${props.league.league_id}/applications/${invitation.id}/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to cancel invitation')
    }

    showSnackbar('Invitation cancelled', 'success')
    await fetchInvitations()
  } catch (e) {
    if (e instanceof ApiError) {
      showSnackbar(e.detail, 'error')
    } else {
      showSnackbar('Failed to cancel invitation', 'error')
    }
  } finally {
    cancellingInvitationId.value = null
  }
}

async function approveApplication(application: LeagueInvitation) {
  if (!props.league) return

  processingApplicationId.value = application.id
  approving.value = true
  try {
    const response = await fetch(`${API_URL}/v1/leagues/${props.league.league_id}/applications/${application.id}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to approve application')
    }

    showSnackbar('Application approved', 'success')
    await Promise.all([fetchApplications(), fetchMembers()])
    emit('updated')
  } catch (e) {
    if (e instanceof ApiError) {
      showSnackbar(e.detail, 'error')
    } else {
      showSnackbar('Failed to approve application', 'error')
    }
  } finally {
    processingApplicationId.value = null
    approving.value = false
  }
}

async function rejectApplication(application: LeagueInvitation) {
  if (!props.league) return

  processingApplicationId.value = application.id
  approving.value = false
  try {
    const response = await fetch(`${API_URL}/v1/leagues/${props.league.league_id}/applications/${application.id}/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to reject application')
    }

    showSnackbar('Application rejected', 'success')
    await fetchApplications()
  } catch (e) {
    if (e instanceof ApiError) {
      showSnackbar(e.detail, 'error')
    } else {
      showSnackbar('Failed to reject application', 'error')
    }
  } finally {
    processingApplicationId.value = null
  }
}

function onUserInvited() {
  showSnackbar('Invitation sent', 'success')
  fetchInvitations()
}

function close() {
  error.value = null
  emit('update:modelValue', false)
}
</script>
