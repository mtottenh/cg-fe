<template>
  <v-dialog
    :fullscreen="smAndDown"
    v-model="open"
    max-width="900"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Manage Members: {{ league?.league_name }}</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
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
                  <div class="text-caption text-medium-emphasis">{{ item.email }}</div>
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
                  <template v-slot:activator="{ props: activatorProps }">
                    <v-btn aria-label="Change role"
                      icon
                      size="small"
                      variant="text"
                      v-bind="activatorProps"
                      :disabled="isLastAdmin(item)"
                      :title="isLastAdmin(item) ? 'Cannot demote the last admin' : 'Change Role'"
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

                <v-btn aria-label="Remove member"
                  icon
                  size="small"
                  variant="text"
                  color="error"
                  :disabled="isLastAdmin(item)"
                  :loading="removingMemberId === item.user_id"
                  @click="removeMember(item)"
                  :title="isLastAdmin(item) ? 'Cannot remove the last admin' : 'Remove Member'"
                >
                  <v-icon>mdi-account-remove</v-icon>
                </v-btn>
              </template>

              <template v-slot:no-data>
                <div class="text-center pa-8">
                  <v-icon size="48" color="grey-lighten-1">mdi-account-group-outline</v-icon>
                  <p class="text-medium-emphasis mt-2">No members found</p>
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
              data-testid="league-invitations-table"
            >
              <template v-slot:item.username="{ item }">
                <div data-testid="invitation-user">
                  <div class="font-weight-medium">{{ item.display_name || item.username }}</div>
                  <div v-if="item.display_name" class="text-caption text-medium-emphasis">
                    {{ item.username }}
                  </div>
                </div>
              </template>

              <template v-slot:item.message="{ item }">
                <span
                  v-if="item.message"
                  class="text-truncate"
                  style="max-width: 200px; display: inline-block;"
                  :title="item.message"
                  data-testid="invitation-message"
                >
                  {{ item.message }}
                </span>
                <span v-else class="text-grey-lighten-1">-</span>
              </template>

              <template v-slot:item.status="{ item }">
                <v-chip :color="getInvitationStatusColor(item.status)" size="small" variant="flat">
                  {{ getInvitationStatusLabel(item.status) }}
                </v-chip>
              </template>

              <template v-slot:item.created_at="{ item }">
                {{ formatDate(item.created_at) }}
              </template>

              <template v-slot:item.expires_at="{ item }">
                {{ item.expires_at ? formatDate(item.expires_at) : 'Never' }}
              </template>

              <template v-slot:item.actions="{ item }">
                <v-btn aria-label="Cancel invitation"
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
                  <p class="text-medium-emphasis mt-2">No pending invitations</p>
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
              data-testid="league-applications-table"
            >
              <template v-slot:item.username="{ item }">
                <div data-testid="application-user">
                  <div class="font-weight-medium">{{ item.display_name || item.username }}</div>
                  <div v-if="item.display_name" class="text-caption text-medium-emphasis">
                    {{ item.username }}
                  </div>
                </div>
              </template>

              <template v-slot:item.message="{ item }">
                <span
                  v-if="item.message"
                  class="text-truncate"
                  style="max-width: 200px; display: inline-block;"
                  :title="item.message"
                  data-testid="application-message"
                >
                  {{ item.message }}
                </span>
                <span v-else class="text-grey-lighten-1">-</span>
              </template>

              <template v-slot:item.status="{ item }">
                <v-chip :color="getInvitationStatusColor(item.status)" size="small" variant="flat">
                  {{ getInvitationStatusLabel(item.status) }}
                </v-chip>
              </template>

              <template v-slot:item.created_at="{ item }">
                {{ formatDate(item.created_at) }}
              </template>

              <template v-slot:item.actions="{ item }">
                <v-btn aria-label="Approve application"
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
                <v-btn aria-label="Reject application"
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
                  <p class="text-medium-emphasis mt-2">No pending applications</p>
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
import { useDisplay } from 'vuetify'
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLeaguesStore, type UserLeagueMembership, type LeagueMemberResponse, type LeagueInvitationResponse } from '@/stores/leagues'
import { useSnackbar } from '@/composables/useSnackbar'
import { formatDate } from '@/utils/formatters'
import InviteUserModal from './InviteUserModal.vue'
import { leagueRoleMap, getStatusColor, getStatusLabel, formatRole, type StatusMap } from '@/utils/statusMaps'

/**
 * P-96: both tables interpolated `item.status` raw — the wire value — while
 * the members table beside them mapped roles through `formatRole`. Invitations
 * and applications are rows of the SAME `league_invitations` table, so they
 * share one status enum: `LeagueInvitationStatus`
 * (api/crates/portal-domain/src/entities/league.rs:264) and the
 * `league_invitations_check_status` CHECK
 * (api/migrations/0022_create_league_invitations.sql:18) both say
 * pending / accepted / rejected / expired.
 *
 * Defined locally rather than in `src/utils/statusMaps.ts` only because that
 * file was owned by a concurrent lane; it belongs there as
 * `leagueInvitationStatusMap`. It cannot be compile-locked yet either —
 * `LeagueInvitationResponse.status` is a bare `String` on the wire, so no
 * union is generated (P-112).
 */
const leagueInvitationStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Pending' },
  accepted: { color: 'success', label: 'Accepted' },
  rejected: { color: 'error', label: 'Rejected' },
  expired: { color: 'grey', label: 'Expired' },
}

// Long scrolling forms in a small floating dialog are unusable on phones.
const { smAndDown } = useDisplay()

const props = defineProps<{  league: UserLeagueMembership | null
}>()

const emit = defineEmits<{  updated: []
}>()

const open = defineModel<boolean>({ required: true })

const leaguesStore = useLeaguesStore()
const {
  members,
  leagueInvitations: invitations,
  applications,
} = storeToRefs(leaguesStore)
const snackbar = useSnackbar()

// State
const activeTab = ref('members')
const error = ref<string | null>(null)
const removingMemberId = ref<string | null>(null)
const cancellingInvitationId = ref<string | null>(null)
const inviteModalOpen = ref(false)
const processingApplicationId = ref<string | null>(null)
const approving = ref(false)

/**
 * P-177: both action guards used to test `membership_type === 'owner'` — a
 * value `LeagueMembershipType` does not contain (admin/moderator/member), so
 * they NEVER fired and every member was actionable. The rule the backend
 * actually enforces is last-admin protection ("cannot remove/demote the last
 * admin"), so that is what the UI mirrors now: acting on an admin is blocked
 * exactly when they are the only one. The API remains the enforcer.
 */
const isLastAdmin = (member: { membership_type: string }) =>
  member.membership_type === 'admin' &&
  members.value.filter(m => m.membership_type === 'admin').length <= 1

// Nested-state loading flags: keep computed() because we only want the inner
// boolean, and `storeToRefs(leaguesStore).fetchMembersState.value.loading` would
// need `.value` in script to reach the same thing.
const loadingMembers = computed(() => leaguesStore.fetchMembersState.loading)
const loadingInvitations = computed(() => leaguesStore.fetchLeagueInvitationsState.loading)
const loadingApplications = computed(() => leaguesStore.fetchApplicationsState.loading)

// Table headers
const memberHeaders = [
  { title: 'User', key: 'username' },
  { title: 'Role', key: 'membership_type', width: '120px' },
  { title: 'Joined', key: 'joined_at', width: '120px' },
  { title: 'Actions', key: 'actions', width: '100px', sortable: false, align: 'center' as const },
]

/**
 * P-115: both tables keyed their first column on `user_id` and rendered
 * `item.user_id.substring(0, 8)`. No surface in the product shows a user's
 * UUID, so the row named nobody — and because ids are UUID v7, whose first
 * characters encode the creation timestamp, two invitations sent seconds apart
 * shared their prefix and were genuinely ambiguous rather than merely cryptic.
 * `LeagueInvitationResponse` now carries `username`/`display_name` the way
 * `LeagueMemberResponse` always has, so both tables key on the name.
 *
 * P-114: `invitationHeaders` had no Message column at all, while
 * `applicationHeaders` beside it did — so once P-94 made the invite message
 * reach the API, the one surface an organiser would look at still never showed
 * it.
 */
const invitationHeaders = [
  { title: 'User', key: 'username' },
  { title: 'Message', key: 'message' },
  { title: 'Status', key: 'status', width: '100px' },
  { title: 'Sent', key: 'created_at', width: '120px' },
  { title: 'Expires', key: 'expires_at', width: '120px' },
  { title: 'Actions', key: 'actions', width: '80px', sortable: false, align: 'center' as const },
]

const applicationHeaders = [
  { title: 'User', key: 'username' },
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

const getRoleColor = (role: string) => getStatusColor(leagueRoleMap, role)
const getInvitationStatusColor = (status: string) =>
  getStatusColor(leagueInvitationStatusMap, status)
const getInvitationStatusLabel = (status: string) =>
  getStatusLabel(leagueInvitationStatusMap, status)

// Watch for dialog opening
watch(open, async (isOpen) => {
  if (isOpen && props.league) {
    activeTab.value = 'members'
    const leagueId = props.league.league_id
    await Promise.all([
      leaguesStore.fetchMembers(leagueId).catch(() => {}),
      leaguesStore.fetchLeagueInvitationsAdmin(leagueId).catch(() => {}),
      leaguesStore.fetchApplications(leagueId).catch(() => {}),
    ])
  }
})

async function updateMemberRole(member: LeagueMemberResponse, newRole: string) {
  if (!props.league) return
  try {
    await leaguesStore.updateMemberRole(props.league.league_id, member.user_id, newRole)
    snackbar.show(`Changed ${member.username}'s role to ${formatRole(newRole)}`, 'success')
    await leaguesStore.fetchMembers(props.league.league_id)
    emit('updated')
  } catch {
    snackbar.show(leaguesStore.updateMemberRoleState.error || 'Failed to update role', 'error')
  }
}

async function removeMember(member: LeagueMemberResponse) {
  if (!props.league) return
  removingMemberId.value = member.user_id
  try {
    await leaguesStore.removeMember(props.league.league_id, member.user_id)
    snackbar.show(`Removed ${member.username} from the league`, 'success')
    emit('updated')
  } catch {
    snackbar.show(leaguesStore.removeMemberState.error || 'Failed to remove member', 'error')
  } finally {
    removingMemberId.value = null
  }
}

async function cancelInvitation(invitation: LeagueInvitationResponse) {
  if (!props.league) return
  cancellingInvitationId.value = invitation.id
  try {
    await leaguesStore.rejectApplication(props.league.league_id, invitation.id)
    snackbar.show('Invitation cancelled', 'success')
    await leaguesStore.fetchLeagueInvitationsAdmin(props.league.league_id)
  } catch {
    snackbar.show('Failed to cancel invitation', 'error')
  } finally {
    cancellingInvitationId.value = null
  }
}

async function approveApplication(application: LeagueInvitationResponse) {
  if (!props.league) return
  processingApplicationId.value = application.id
  approving.value = true
  try {
    await leaguesStore.approveApplication(props.league.league_id, application.id)
    snackbar.show('Application approved', 'success')
    await leaguesStore.fetchMembers(props.league.league_id)
    emit('updated')
  } catch {
    snackbar.show(leaguesStore.approveApplicationState.error || 'Failed to approve application', 'error')
  } finally {
    processingApplicationId.value = null
    approving.value = false
  }
}

async function rejectApplication(application: LeagueInvitationResponse) {
  if (!props.league) return
  processingApplicationId.value = application.id
  approving.value = false
  try {
    await leaguesStore.rejectApplication(props.league.league_id, application.id)
    snackbar.show('Application rejected', 'success')
  } catch {
    snackbar.show(leaguesStore.rejectApplicationState.error || 'Failed to reject application', 'error')
  } finally {
    processingApplicationId.value = null
  }
}

function onUserInvited() {
  snackbar.show('Invitation sent', 'success')
  if (props.league) {
    leaguesStore.fetchLeagueInvitationsAdmin(props.league.league_id)
  }
}

function close() {
  error.value = null
  open.value = false
}
</script>
