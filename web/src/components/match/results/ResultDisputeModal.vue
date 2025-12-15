<template>
  <v-dialog v-model="isOpen" max-width="600" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start color="error">mdi-alert-octagon</v-icon>
        Dispute Result
      </v-card-title>

      <v-card-text>
        <v-alert type="warning" variant="tonal" class="mb-4">
          <strong>Important:</strong> Disputes are reviewed by tournament administrators. Please
          provide a clear explanation and attach evidence if possible.
        </v-alert>

        <v-form ref="formRef" v-model="isFormValid">
          <v-textarea
            v-model="reason"
            label="Reason for dispute"
            placeholder="Explain why you believe the submitted result is incorrect..."
            :rules="reasonRules"
            counter
            maxlength="1000"
            rows="4"
            variant="outlined"
            class="mb-4"
          />

          <!-- Evidence attachment for disputes -->
          <EvidenceAttachmentPanel
            :match-id="matchId"
            @update:evidence-ids="evidenceIds = $event"
          />
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-btn variant="text" :disabled="loading" @click="handleCancel"> Cancel </v-btn>
        <v-spacer />
        <v-btn
          color="error"
          variant="flat"
          :loading="loading"
          :disabled="!isValid"
          @click="handleDispute"
        >
          <v-icon start>mdi-gavel</v-icon>
          Submit Dispute
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useMatchResultsStore } from '@/stores/matchResults'
import EvidenceAttachmentPanel from '../evidence/EvidenceAttachmentPanel.vue'

const props = defineProps<{
  matchId: string
  claimId: string
}>()

const emit = defineEmits<{
  disputed: []
  cancelled: []
}>()

const isOpen = defineModel<boolean>({ default: false })

const store = useMatchResultsStore()
const loading = computed(() => store.loading)

const formRef = ref()
const isFormValid = ref(false)
const reason = ref('')
const evidenceIds = ref<string[]>([])

const reasonRules = [
  (v: string) => !!v || 'Reason is required',
  (v: string) => v.length >= 10 || 'Please provide at least 10 characters',
  (v: string) => v.length <= 1000 || 'Maximum 1000 characters',
]

const isValid = computed(() => {
  return isFormValid.value && reason.value.length >= 10
})

// Reset form when modal opens
watch(isOpen, (open) => {
  if (open) {
    reason.value = ''
    evidenceIds.value = []
    formRef.value?.resetValidation()
  }
})

async function handleDispute() {
  if (!isValid.value) return

  try {
    await store.disputeResult(props.matchId, props.claimId, reason.value, evidenceIds.value)
    isOpen.value = false
    emit('disputed')
  } catch {
    // Error handled by store
  }
}

function handleCancel() {
  isOpen.value = false
  emit('cancelled')
}
</script>
