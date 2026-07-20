<template>
  <v-dialog v-model="open" max-width="500" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon :color="isReject ? 'warning' : 'error'" class="mr-2">
          {{ isReject ? 'mdi-close-circle-outline' : 'mdi-account-cancel' }}
        </v-icon>
        {{ isReject ? 'Reject Registration' : 'Disqualify Participant' }}
      </v-card-title>

      <v-divider />

      <v-card-text>
        <!-- Participant Info -->
        <div v-if="registration" class="d-flex align-center mb-4">
          <v-avatar size="48" rounded="sm" class="mr-3">
            <v-img alt="" v-if="registration.participant_logo_url" :src="registration.participant_logo_url" />
            <v-icon v-else>mdi-account</v-icon>
          </v-avatar>
          <div>
            <div class="text-subtitle-1 font-weight-medium">{{ registration.participant_name }}</div>
            <v-chip :color="getStatusColor(registration.status)" size="small" variant="tonal">
              {{ registration.status }}
            </v-chip>
          </div>
        </div>

        <v-alert
          v-if="isReject"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          This will reject the registration request. The participant will not be able to compete.
        </v-alert>

        <v-alert
          v-else
          type="error"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          This will disqualify the participant from the tournament. This action cannot be easily undone.
        </v-alert>

        <v-textarea
          v-model="reason"
          :label="isReject ? 'Reason (optional)' : 'Reason (required)'"
          :hint="isReject ? 'Optionally provide a reason for rejection' : 'Explain why this participant is being disqualified'"
          :rules="isReject ? [] : [rules.required]"
          persistent-hint
          variant="outlined"
          rows="3"
          auto-grow
        />
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          :color="isReject ? 'warning' : 'error'"
          variant="flat"
          :loading="loading"
          :disabled="!isReject && !reason.trim()"
          @click="confirm"
        >
          {{ isReject ? 'Reject' : 'Disqualify' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TournamentRegistrationResponse } from '@/stores/tournaments'
import { useFormRules } from '@/composables/useFormRules'
import { registrationStatusMap, getStatusColor as mapStatusColor } from '@/utils/statusMaps'

const props = defineProps<{  mode: 'reject' | 'disqualify'
  registration: TournamentRegistrationResponse | null
  loading?: boolean
}>()

const emit = defineEmits<{  confirm: [reason: string]
}>()

const open = defineModel<boolean>({ required: true })

const reason = ref('')

const isReject = computed(() => props.mode === 'reject')

const { required: _required, ...formRules } = useFormRules()
const rules = {
  ...formRules,
  required: (v: string) => !!v?.trim() || 'Reason is required',
}

const getStatusColor = (status: string) => mapStatusColor(registrationStatusMap, status)

function close() {
  open.value = false
}

function confirm() {
  emit('confirm', reason.value.trim())
}

// Reset reason when modal opens
watch(open,
  (isOpen) => {
    if (isOpen) {
      reason.value = ''
    }
  }
)
</script>
