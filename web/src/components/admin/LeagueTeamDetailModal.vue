<template>
  <v-dialog
    :fullscreen="smAndDown"
    v-model="open"
    max-width="900"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <div class="d-flex align-center">
          <v-avatar size="32" rounded="sm" class="mr-3">
            <v-img alt="" v-if="team?.team_logo_url" :src="team.team_logo_url" />
            <v-icon v-else>mdi-shield</v-icon>
          </v-avatar>
          <div>
            <span>{{ team?.team_name }}</span>
            <span class="text-caption text-medium-emphasis ml-2">[{{ team?.team_tag }}]</span>
          </div>
        </div>
        <v-btn aria-label="Close" icon variant="text" @click="close">
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
                  v-if="rosterLockChip"
                  size="x-small"
                  :color="rosterLockChipColor"
                  class="ml-2"
                  :title="rosterLockTitle ?? undefined"
                >
                  {{ rosterLockChip }}
                </v-chip>
              </div>
              <v-btn
                color="primary"
                variant="tonal"
                prepend-icon="mdi-account-plus"
                size="small"
                :disabled="!canChangeRosterAtAll"
                :title="canChangeRosterAtAll ? undefined : (rosterLockTitle ?? undefined)"
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
                  <v-img :alt="item.display_name ?? ''" v-if="item.avatar_url" :src="item.avatar_url" />
                  <v-icon v-else>mdi-account</v-icon>
                </v-avatar>
              </template>

              <template v-slot:item.display_name="{ item }">
                <div>
                  <div class="font-weight-medium">{{ item.display_name }}</div>
                  <div class="text-caption text-medium-emphasis">{{ item.position || '-' }}</div>
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
                  <template v-slot:activator="{ props: activatorProps }">
                    <v-btn aria-label="Member actions"
                      icon
                      size="small"
                      variant="text"
                      v-bind="activatorProps"
                      :disabled="!canChangeRosterAtAll"
                      :title="canChangeRosterAtAll ? undefined : (rosterLockTitle ?? undefined)"
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
                      :disabled="!canRemoveMember(item)"
                      :title="canRemoveMember(item) ? undefined : (rosterLockTitle ?? undefined)"
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
                  <p class="text-medium-emphasis mt-2">No team members yet</p>
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
                  <v-btn aria-label="Accept application"
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
                  <v-btn :aria-label="item.invitation_type === 'invite' ? 'Cancel invitation' : 'Reject application'"
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
                  <p class="text-medium-emphasis mt-2">No pending invitations</p>
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
      :roster-lock-status="team?.roster_lock_status"
      @invited="onPlayerInvited"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { computed, ref, watch } from 'vue'
import type { components } from '@/api/types'
import LeagueTeamInviteModal from '../team/LeagueTeamInviteModal.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useFormRules } from '@/composables/useFormRules'
import { formatDate } from '@/utils/formatters'
import { teamRoleMap, teamInvitationStatusMap, getStatusColor, formatRole } from '@/utils/statusMaps'
import {
  allowsAnyRosterChanges,
  allowsPrimaryRosterChanges,
  allowsSubstituteChanges,
  rosterLockColor,
  rosterLockHint,
  rosterLockLabel,
} from '@/utils/rosterLock'
import {
  useLeagueTeamsStore,
  type LeagueTeamMemberWithPlayer,
  type LeagueTeamInvitationResponse,
} from '@/stores/leagueTeams'

// Long scrolling forms in a small floating dialog are unusable on phones.
const { smAndDown } = useDisplay()

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

// ---------------------------------------------------------------------------
// Roster lock (COVERAGE-PLAN §9b P-11)
//
// These three controls used to compare `roster_lock_status` against the string
// `'locked'`, which the schema cannot produce — the CHECK constraint permits
// only open / soft_lock / hard_lock — so the chip never rendered and nothing
// was ever disabled. Semantics now mirror the backend exactly
// (portal-core/src/types/league_team.rs:119-137):
//
//   hard_lock  no roster changes at all -> Invite Player and the whole
//              member-action menu are disabled.
//   soft_lock  substitutes only -> inviting stays available but the invite
//              modal offers the `substitute` role only, and "Remove from Team"
//              is disabled for primary members (captain/player), which is
//              exactly what `remove_member_authorized`
//              (portal-domain/src/services/league_team/team.rs:488-499) rejects.
//
// Promote/demote are intentionally NOT gated on soft_lock, and the backend now
// agrees (P-16). A promotion moves a member between two *primary* roles, so it
// never changes who is eligible to play — `refusal_reason` in
// portal-domain/src/services/league_team/roster_lock.rs permits it under
// soft_lock and refuses it under hard_lock, which is exactly what this modal
// presents: the activator is disabled under a hard lock, enabled under a soft
// one. Before P-16 the backend did not lock-check role changes at all, so this
// UI was stricter than the API; the divergence is closed in the API's favour
// for soft_lock and the UI's favour for hard_lock.
// ---------------------------------------------------------------------------
const rosterLock = computed(() => props.team?.roster_lock_status)
const canChangeRosterAtAll = computed(() => allowsAnyRosterChanges(rosterLock.value))
const rosterLockChip = computed(() => rosterLockLabel(rosterLock.value))
const rosterLockChipColor = computed(() => rosterLockColor(rosterLock.value))
const rosterLockTitle = computed(() => rosterLockHint(rosterLock.value))

/** A member can be removed only if the lock permits changes for their role. */
function canRemoveMember(member: TeamMember): boolean {
  return member.role === 'substitute'
    ? allowsSubstituteChanges(rosterLock.value)
    : allowsPrimaryRosterChanges(rosterLock.value)
}

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
const getRoleColor = (role: string) => getStatusColor(teamRoleMap, role)
const getInvitationStatusColor = (status: string) => getStatusColor(teamInvitationStatusMap, status)

function close() {
  error.value = null
  open.value = false
}
</script>
