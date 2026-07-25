<template>
  <v-dialog
    v-model="open"
    max-width="500"
    persistent
  >
    <v-card data-testid="invite-user-modal">
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Invite User to League</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-form ref="formRef" v-model="formValid">
          <v-row>
            <v-col cols="12">
              <!--
                P-95: this was a bare UUID text field ("Enter the UUID of the
                user to invite"). No surface in the product ever displays a
                user's UUID — the members table shows username/email, the
                invitations and applications tables truncate the id to 8
                characters — so an invite-only league could not actually be
                invited to by a human. `BanCreateModal` on the same admin
                surface already searched players by name; this now does the
                same.
              -->
              <UserSearchAutocomplete
                v-model="selectedPlayer"
                label="User to Invite"
                placeholder="Search by display name..."
                :rules="[rules.required]"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.message"
                label="Message (Optional)"
                :rules="[rules.maxLength(500)]"
                rows="3"
                variant="outlined"
                density="comfortable"
                hint="Optional message to include with the invitation"
                persistent-hint
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="sending"
          :disabled="!formValid"
          @click="sendInvitation"
        >
          Send Invitation
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useLeaguesStore } from '@/stores/leagues'
import { useFormRules } from '@/composables/useFormRules'
import UserSearchAutocomplete from '@/components/admin/UserSearchAutocomplete.vue'
import { api } from '@/api'
import { unwrapApi } from '@/stores/helpers'
import type { components } from '@/api/types'

type PlayerSearchResponse = components['schemas']['PlayerSearchResponse']

const props = defineProps<{  leagueId: string
}>()

const emit = defineEmits<{  invited: []
}>()

const open = defineModel<boolean>({ required: true })

const leaguesStore = useLeaguesStore()

const formRef = ref()
const formValid = ref(false)
const sending = ref(false)
const error = ref<string | null>(null)

const selectedPlayer = ref<PlayerSearchResponse | null>(null)

const form = ref({
  message: '',
})

const rules = useFormRules()

watch(open, (isOpen) => {
  if (isOpen) {
    selectedPlayer.value = null
    form.value = { message: '' }
    error.value = null
  }
})

/**
 * League invitations are keyed by `user_id`, but player search returns PLAYER
 * ids — the same asymmetry `TournamentInvitationsModal.resolveUserId` handles.
 * Resolve it here rather than making an organiser paste a UUID (P-95).
 */
async function resolveUserId(player: PlayerSearchResponse): Promise<string> {
  const result = await unwrapApi(api.GET('/v1/players/{player_id}', {
    params: { path: { player_id: player.id } },
  }))
  return result.data.user_id
}

function close() {
  error.value = null
  open.value = false
}

async function sendInvitation() {
  if (!formValid.value || !props.leagueId || !selectedPlayer.value) return

  sending.value = true
  error.value = null

  try {
    const userId = await resolveUserId(selectedPlayer.value)
    // P-94: the message is now forwarded instead of being validated and dropped.
    await leaguesStore.sendInvitation(props.leagueId, userId, form.value.message)
    emit('invited')
    close()
  } catch {
    error.value = leaguesStore.sendInvitationState.error || 'Failed to send invitation'
  } finally {
    sending.value = false
  }
}
</script>
