<template>
  <v-dialog
    v-model="open"
    max-width="500"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Invite User to League</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-form ref="formRef" v-model="formValid">
          <v-row>
            <v-col cols="12">
              <v-text-field
                v-model="form.user_id"
                label="User ID"
                :rules="[rules.required, rules.uuid]"
                variant="outlined"
                density="comfortable"
                hint="Enter the UUID of the user to invite"
                persistent-hint
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

const form = ref({
  user_id: '',
  message: '',
})

const rules = useFormRules()

watch(open, (isOpen) => {
  if (isOpen) {
    form.value = { user_id: '', message: '' }
    error.value = null
  }
})

function close() {
  error.value = null
  open.value = false
}

async function sendInvitation() {
  if (!formValid.value || !props.leagueId) return

  sending.value = true
  error.value = null

  try {
    await leaguesStore.sendInvitation(props.leagueId, form.value.user_id)
    emit('invited')
    close()
  } catch {
    error.value = leaguesStore.sendInvitationState.error || 'Failed to send invitation'
  } finally {
    sending.value = false
  }
}
</script>
