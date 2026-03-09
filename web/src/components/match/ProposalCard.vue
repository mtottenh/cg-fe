<template>
  <v-card variant="outlined" :color="cardColor">
    <v-card-text>
      <!-- Header -->
      <div class="d-flex align-center justify-space-between mb-4">
        <div class="d-flex align-center">
          <v-avatar size="32" class="mr-2">
            <v-icon>mdi-account</v-icon>
          </v-avatar>
          <div>
            <div class="text-subtitle-2">
              {{ isProposer ? 'Your Proposal' : 'Proposal from opponent' }}
            </div>
            <div class="text-caption text-grey">
              Sent {{ formatDateTime(proposal.created_at) }}
            </div>
          </div>
        </div>
        <v-chip :color="statusColor" size="small">
          {{ statusLabel }}
        </v-chip>
      </div>

      <!-- Expiration Warning -->
      <v-alert
        v-if="proposal.status === 'pending' && !isExpired"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        <template v-slot:prepend>
          <v-icon>mdi-clock-alert-outline</v-icon>
        </template>
        Expires in {{ timeUntilExpiration }}
      </v-alert>

      <v-alert
        v-else-if="isExpired"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        <template v-slot:prepend>
          <v-icon>mdi-clock-remove-outline</v-icon>
        </template>
        This proposal has expired
      </v-alert>

      <!-- Proposed Times -->
      <div class="mb-4">
        <div class="text-subtitle-2 mb-2">Proposed Times</div>
        <v-radio-group
          v-if="!isProposer && proposal.status === 'pending'"
          v-model="selectedTime"
          hide-details
        >
          <v-radio
            v-for="time in proposal.proposed_times"
            :key="time"
            :value="time"
            :label="formatProposedTime(time)"
            density="compact"
            class="mb-1"
          />
        </v-radio-group>
        <div v-else class="d-flex flex-wrap gap-2">
          <v-chip
            v-for="time in proposal.proposed_times"
            :key="time"
            variant="tonal"
            size="small"
          >
            <v-icon start size="small">mdi-calendar</v-icon>
            {{ formatProposedTime(time) }}
          </v-chip>
        </div>
      </div>

      <!-- Notes -->
      <div v-if="proposal.notes" class="mb-4">
        <div class="text-subtitle-2 mb-1">Notes</div>
        <div class="text-body-2 text-grey-darken-1 pa-2 bg-grey-lighten-4 rounded">
          {{ proposal.notes }}
        </div>
      </div>

      <!-- Actions -->
      <template v-if="proposal.status === 'pending' && !isExpired">
        <!-- Responder Actions -->
        <template v-if="!isProposer">
          <v-divider class="mb-4" />
          <div class="d-flex gap-2 flex-wrap">
            <v-btn
              color="success"
              :loading="loading"
              :disabled="!selectedTime"
              @click="handleAccept"
            >
              <v-icon start>mdi-check</v-icon>
              Accept
            </v-btn>
            <v-btn
              variant="outlined"
              color="primary"
              :loading="loading"
              @click="$emit('counter')"
            >
              <v-icon start>mdi-calendar-edit</v-icon>
              Counter-Propose
            </v-btn>
            <v-btn
              variant="text"
              color="error"
              :loading="loading"
              @click="openRejectDialog"
            >
              <v-icon start>mdi-close</v-icon>
              Reject
            </v-btn>
          </div>
        </template>

        <!-- Proposer Actions -->
        <template v-else>
          <v-divider class="mb-4" />
          <v-alert type="info" variant="tonal" density="compact">
            <template v-slot:prepend>
              <v-icon>mdi-clock-outline</v-icon>
            </template>
            Waiting for your opponent to respond...
          </v-alert>
        </template>
      </template>

      <!-- Accepted Time Display -->
      <template v-if="proposal.status === 'accepted' && proposal.selected_time">
        <v-divider class="mb-4" />
        <v-alert type="success" variant="tonal">
          <template v-slot:prepend>
            <v-icon>mdi-calendar-check</v-icon>
          </template>
          <div>
            <strong>Scheduled for:</strong>
            <div class="mt-1">{{ formatProposedTime(proposal.selected_time) }}</div>
          </div>
        </v-alert>
      </template>
    </v-card-text>

    <!-- Reject Dialog -->
    <ConfirmDialog
      :open="confirmDialog.open.value"
      :title="confirmDialog.title.value"
      :message="confirmDialog.message.value"
      :action-label="confirmDialog.actionLabel.value"
      :color="confirmDialog.color.value"
      :loading="confirmDialog.loading.value"
      @confirm="confirmDialog.execute"
      @cancel="confirmDialog.cancel"
    />
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ScheduleProposalResponse } from '@/stores/matchScheduling'
import { formatDateTime } from '@/utils/formatters'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import {
  getProposalStatusColor,
  getProposalStatusLabel,
  formatProposedTime,
  isProposalExpired,
  getTimeUntilExpiration,
} from '@/stores/matchScheduling'

const props = defineProps<{
  proposal: ScheduleProposalResponse
  isProposer: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  accept: [time: string]
  reject: [reason?: string]
  counter: []
}>()

const selectedTime = ref<string | null>(null)
const confirmDialog = useConfirmDialog()

const isExpired = computed(() => isProposalExpired(props.proposal))
const timeUntilExpiration = computed(() => getTimeUntilExpiration(props.proposal))
const statusColor = computed(() => getProposalStatusColor(props.proposal.status))
const statusLabel = computed(() => getProposalStatusLabel(props.proposal.status))

const cardColor = computed(() => {
  if (props.proposal.status === 'accepted') return 'success'
  if (props.proposal.status === 'rejected') return 'error'
  if (isExpired.value) return 'grey'
  return 'warning'
})

function handleAccept() {
  if (selectedTime.value) {
    emit('accept', selectedTime.value)
  }
}

function openRejectDialog() {
  confirmDialog.confirm({
    title: 'Reject Proposal',
    message: 'Are you sure you want to reject this proposal?',
    action: 'Reject',
    color: 'error',
    handler: async () => {
      emit('reject')
    },
  })
}
</script>
