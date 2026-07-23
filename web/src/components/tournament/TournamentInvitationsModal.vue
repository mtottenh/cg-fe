<template>
  <v-dialog
    :fullscreen="smAndDown"
    v-model="open"
    max-width="900"
    persistent
  >
    <v-card data-testid="invitations-modal">
      <v-card-title class="d-flex justify-space-between align-center">
        <span><v-icon start>mdi-email-outline</v-icon> Invitations: {{ tournament.name }}</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text style="min-height: 360px">
        <!-- Why this panel exists: `invite_only` is the only registration type
             where the invite list is the gate. For every other type an
             invitation is inert, so say so rather than letting an organiser
             hand out invitations that change nothing. -->
        <v-alert
          v-if="!isInviteOnly"
          type="info"
          variant="tonal"
          density="comfortable"
          class="mb-4"
          data-testid="invitations-not-gated"
        >
          This tournament's registration type is
          <strong>{{ registrationTypeLabel }}</strong>, so invitations do not gate entry —
          anyone who meets the registration rules can enter. Switch it to
          <strong>Invite Only</strong> for this list to mean anything.
        </v-alert>

        <!-- Issue an invitation -->
        <v-form ref="formRef" v-model="formValid" @submit.prevent="sendInvitation">
          <v-row align="start">
            <v-col cols="12" md="6">
              <!-- Team tournaments invite a team-season; individual
                   tournaments invite a user. The API rejects the wrong
                   target with a 400, so only offer the right one. -->
              <v-select
                v-if="isTeamTournament && tournament.season_id"
                v-model="selectedTeamSeasonId"
                :items="teamOptions"
                item-title="title"
                item-value="value"
                label="Team to invite"
                :rules="[rules.required]"
                :loading="loadingTeams"
                :no-data-text="loadingTeams ? 'Loading teams…' : 'No teams in this season'"
                variant="outlined"
                density="comfortable"
                data-testid="invite-team-select"
              />
              <v-text-field
                v-else-if="isTeamTournament"
                v-model="manualTargetId"
                label="Team season ID"
                :rules="[rules.required, rules.uuid]"
                variant="outlined"
                density="comfortable"
                hint="This tournament is not scoped to a season, so teams cannot be listed"
                persistent-hint
                data-testid="invite-team-season-id"
              />
              <UserSearchAutocomplete
                v-else
                v-model="selectedPlayer"
                label="Player to invite"
                :rules="[rules.required]"
                density="comfortable"
                data-testid="invite-player-search"
              />
            </v-col>

            <v-col cols="12" md="4">
              <v-text-field
                v-model="message"
                label="Message (optional)"
                :rules="[rules.maxLength(500)]"
                variant="outlined"
                density="comfortable"
                data-testid="invite-message"
              />
            </v-col>

            <v-col cols="12" md="2">
              <v-btn
                color="primary"
                variant="flat"
                block
                type="submit"
                :loading="sending"
                :disabled="!formValid"
                data-testid="send-invitation"
              >
                Invite
              </v-btn>
            </v-col>
          </v-row>
        </v-form>

        <v-alert
          v-if="formError"
          type="error"
          variant="tonal"
          density="comfortable"
          class="mb-4"
          closable
          data-testid="invite-error"
          @click:close="formError = null"
        >
          {{ formError }}
        </v-alert>

        <v-divider class="mb-4" />

        <div class="table-scroll">
          <v-data-table
            :headers="headers"
            :items="invitations"
            :loading="loadingInvitations"
            :items-per-page="10"
            density="comfortable"
            class="elevation-0"
            data-testid="invitations-table"
          >
            <template v-slot:item.target="{ item }">
              <div class="font-weight-medium">{{ targetLabel(item) }}</div>
              <div v-if="item.message" class="text-caption text-medium-emphasis">
                {{ item.message }}
              </div>
            </template>

            <template v-slot:item.status="{ item }">
              <v-chip size="small" variant="tonal" :color="statusColor(item.status)">
                {{ item.status }}
              </v-chip>
            </template>

            <template v-slot:item.created_at="{ item }">
              {{ formatDateTime(item.created_at) }}
            </template>

            <template v-slot:item.actions="{ item }">
              <v-btn
                v-if="item.status !== 'revoked'"
                size="small"
                color="error"
                variant="tonal"
                :loading="revokingId === item.id"
                :disabled="revokingId !== null && revokingId !== item.id"
                :data-testid="`revoke-invitation-${item.id}`"
                @click="confirmRevoke(item)"
              >
                Revoke
              </v-btn>
              <span v-else class="text-medium-emphasis text-caption">Revoked</span>
            </template>

            <template v-slot:no-data>
              <div class="text-center pa-8" data-testid="invitations-empty">
                <v-icon size="48" color="grey-lighten-1">mdi-email-outline</v-icon>
                <p class="text-medium-emphasis mt-2">Nobody has been invited yet</p>
              </div>
            </template>
          </v-data-table>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Close</v-btn>
      </v-card-actions>
    </v-card>

    <ConfirmDialogHost :dialog="confirmDialog" />
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDisplay } from 'vuetify'
import {
  useTournamentsStore,
  REGISTRATION_TYPES,
  type TournamentResponse,
  type TournamentInvitationResponse,
} from '@/stores/tournaments'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useFormRules } from '@/composables/useFormRules'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useSnackbar } from '@/composables/useSnackbar'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import UserSearchAutocomplete from '@/components/admin/UserSearchAutocomplete.vue'
import { api } from '@/api'
import { unwrapApi } from '@/stores/helpers'
import { formatDateTime } from '@/utils/formatters'
import type { components } from '@/api/types'

type PlayerSearchResponse = components['schemas']['PlayerSearchResponse']

// Long forms in a small floating dialog are unusable on phones — same call as
// the admin modals.
const { smAndDown } = useDisplay()

const props = defineProps<{
  tournament: TournamentResponse
}>()

const emit = defineEmits<{
  changed: []
}>()

const open = defineModel<boolean>({ required: true })

const tournamentsStore = useTournamentsStore()
const leagueTeamsStore = useLeagueTeamsStore()
const { invitations } = storeToRefs(tournamentsStore)
const rules = useFormRules()
const confirmDialog = useConfirmDialog()
const feedback = useActionFeedback()
const snackbar = useSnackbar()

const formRef = ref()
const formValid = ref(false)
const formError = ref<string | null>(null)
const selectedTeamSeasonId = ref<string | null>(null)
const selectedPlayer = ref<PlayerSearchResponse | null>(null)
const manualTargetId = ref('')
const message = ref('')
const revokingId = ref<string | null>(null)

const isTeamTournament = computed(() => props.tournament.participant_type === 'team')
const isInviteOnly = computed(() => props.tournament.registration_type === 'invite_only')
const registrationTypeLabel = computed(() =>
  REGISTRATION_TYPES.find((t) => t.value === props.tournament.registration_type)?.label
    ?? props.tournament.registration_type,
)

const loadingInvitations = computed(() => tournamentsStore.fetchInvitationsState.loading)
const loadingTeams = computed(() => leagueTeamsStore.fetchTeamsInSeasonState.loading)
const sending = computed(() => tournamentsStore.createInvitationState.loading)

const headers = [
  { title: 'Invited', key: 'target' },
  { title: 'Status', key: 'status', width: '120px' },
  { title: 'Sent', key: 'created_at', width: '200px' },
  { title: 'Actions', key: 'actions', width: '120px', sortable: false },
]

/** Teams registered for the tournament's season — the invitable population. */
const teamOptions = computed(() =>
  leagueTeamsStore.teams
    .filter((t) => !!t.team_season_id)
    .map((t) => ({ title: `${t.team_name} [${t.team_tag}]`, value: t.team_season_id as string })),
)

/**
 * The API returns raw IDs, so resolve team-seasons back to names where we can.
 * A user invitation has no name source on this page at all (there is no
 * user-by-id lookup in the public API), so it shows the ID — the same
 * compromise `admin/LeagueMembersModal.vue` makes for league invitations.
 */
function targetLabel(invitation: TournamentInvitationResponse): string {
  if (invitation.team_season_id) {
    const team = leagueTeamsStore.teams.find((t) => t.team_season_id === invitation.team_season_id)
    return team ? `${team.team_name} [${team.team_tag}]` : invitation.team_season_id
  }
  return invitation.user_id ?? '—'
}

function statusColor(status: TournamentInvitationResponse['status']): string {
  if (status === 'accepted') return 'success'
  if (status === 'revoked') return 'grey'
  return 'info'
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  formError.value = null
  selectedTeamSeasonId.value = null
  selectedPlayer.value = null
  manualTargetId.value = ''
  message.value = ''
  await Promise.all([
    tournamentsStore.fetchInvitations(props.tournament.id).catch(() => {}),
    isTeamTournament.value && props.tournament.season_id
      // 100 rather than the default 20: a season with 21 teams would otherwise
      // hide the 21st from the organiser's picker entirely (the pagination
      // blindness family, P-28/P-43).
      ? leagueTeamsStore.fetchTeamsInSeason(props.tournament.season_id, 1, 100).catch(() => {})
      : Promise.resolve(),
  ])
})

/**
 * Individual tournaments are invited by `user_id`, but player search returns
 * player IDs. Resolve through the player detail endpoint rather than asking an
 * organiser to paste a UUID.
 */
async function resolveUserId(player: PlayerSearchResponse): Promise<string> {
  const result = await unwrapApi(api.GET('/v1/players/{player_id}', {
    params: { path: { player_id: player.id } },
  }))
  return result.data.user_id
}

async function sendInvitation() {
  if (!formValid.value) return
  formError.value = null

  try {
    const body: components['schemas']['CreateTournamentInvitationRequest'] = {
      message: message.value.trim() || null,
    }

    if (isTeamTournament.value) {
      body.team_season_id = props.tournament.season_id
        ? selectedTeamSeasonId.value
        : manualTargetId.value.trim()
    } else {
      if (!selectedPlayer.value) return
      body.user_id = await resolveUserId(selectedPlayer.value)
    }

    await tournamentsStore.createInvitation(props.tournament.id, body)
    snackbar.show('Invitation sent', 'success')
    selectedTeamSeasonId.value = null
    selectedPlayer.value = null
    manualTargetId.value = ''
    message.value = ''
    formRef.value?.resetValidation()
    emit('changed')
  } catch {
    formError.value = tournamentsStore.createInvitationState.error ?? 'Failed to send invitation'
  }
}

function confirmRevoke(invitation: TournamentInvitationResponse) {
  confirmDialog.confirm({
    title: 'Revoke Invitation',
    message: `Revoke the invitation for ${targetLabel(invitation)}? They will no longer be able to register. An existing registration is unaffected — reject or disqualify it instead.`,
    action: 'Revoke',
    color: 'error',
    handler: async () => {
      revokingId.value = invitation.id
      try {
        await feedback.run(
          () => tournamentsStore.revokeInvitation(props.tournament.id, invitation.id),
          {
            success: 'Invitation revoked',
            failureFallback: 'Failed to revoke invitation',
            errorSource: tournamentsStore,
            rethrow: true,
          },
        )
        emit('changed')
      } finally {
        revokingId.value = null
      }
    },
  })
}

function close() {
  formError.value = null
  open.value = false
}
</script>

<style scoped>
/* Wide tables scroll within themselves; the dialog never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
