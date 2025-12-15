<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
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
import { ApiError } from '@/api'

const props = defineProps<{
  modelValue: boolean
  leagueId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  invited: []
}>()

const formRef = ref()
const formValid = ref(false)
const sending = ref(false)
const error = ref<string | null>(null)

const form = ref({
  user_id: '',
  message: '',
})

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const rules = {
  required: (v: string) => !!v || 'Required',
  maxLength: (max: number) => (v: string) => !v || v.length <= max || `Maximum ${max} characters`,
  uuid: (v: string) => {
    if (!v) return true
    // Basic UUID v4/v7 format check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(v) || 'Must be a valid UUID'
  },
}

// Reset form when dialog opens
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    form.value = {
      user_id: '',
      message: '',
    }
    error.value = null
  }
})

function close() {
  error.value = null
  emit('update:modelValue', false)
}

async function sendInvitation() {
  if (!formValid.value || !props.leagueId) return

  sending.value = true
  error.value = null

  try {
    const body: Record<string, unknown> = {
      user_id: form.value.user_id,
    }

    if (form.value.message) {
      body.message = form.value.message
    }

    const response = await fetch(`${API_URL}/v1/leagues/${props.leagueId}/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to send invitation')
    }

    emit('invited')
    close()
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to send invitation'
    }
  } finally {
    sending.value = false
  }
}
</script>
