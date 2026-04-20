<template>
  <v-card class="mb-6">
    <v-card-title>
      <v-icon start color="warning">mdi-alert-circle</v-icon>
      Dispute
    </v-card-title>
    <v-divider />
    <v-card-text>
      <v-progress-linear v-if="disputesStore.fetchDisputeState?.loading" indeterminate class="mb-4" />

      <!-- Thread messages -->
      <div v-if="disputesStore.currentThread.length > 0" class="mb-4">
        <div
          v-for="msg in disputesStore.currentThread"
          :key="msg.id"
          class="d-flex mb-3"
        >
          <v-avatar size="32" color="grey-lighten-2" class="mr-3 flex-shrink-0">
            <v-icon size="small">{{ msg.is_internal ? 'mdi-shield' : 'mdi-account' }}</v-icon>
          </v-avatar>
          <div class="flex-grow-1">
            <div class="d-flex align-center mb-1">
              <span class="text-body-2 font-weight-medium">{{ authorLabel(msg) }}</span>
              <v-chip v-if="msg.is_internal" size="x-small" color="warning" variant="tonal" class="ml-2">Admin</v-chip>
              <span class="text-caption text-medium-emphasis ml-auto">{{ formatTime(msg.created_at) }}</span>
            </div>
            <p class="text-body-2">{{ msg.message }}</p>
          </div>
        </div>
      </div>

      <p v-else-if="!disputesStore.fetchDisputeState?.loading" class="text-medium-emphasis text-center py-4">
        No messages in this dispute yet.
      </p>

      <!-- Reply form (only for participants) -->
      <template v-if="canReply">
        <v-divider class="mb-4" />
        <v-textarea
          v-model="replyMessage"
          label="Add a message"
          rows="2"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-2"
        />
        <v-btn
          color="primary"
          size="small"
          :loading="disputesStore.addPlayerMessageState.loading"
          :disabled="!replyMessage.trim()"
          @click="handleSendMessage"
        >
          <v-icon start size="small">mdi-send</v-icon>
          Send
        </v-btn>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useDisputesStore } from '@/stores/disputes'
import { formatShortDateTime } from '@/utils/formatters'
import type { components } from '@/api/types'

type DisputeMessage = components['schemas']['DisputeMessageResponse']

const props = defineProps<{
  disputeId: string
  canReply: boolean
}>()

const disputesStore = useDisputesStore()
const replyMessage = ref('')

onMounted(() => {
  disputesStore.fetchDispute(props.disputeId)
})

async function handleSendMessage() {
  if (!replyMessage.value.trim()) return
  try {
    await disputesStore.addPlayerMessage(props.disputeId, replyMessage.value)
    replyMessage.value = ''
  } catch {
    // Error in store
  }
}

function formatTime(dateStr: string): string {
  return formatShortDateTime(dateStr)
}

/**
 * Dispute messages carry `author_type` / `author_user_id` but no display
 * name — the backend doesn't join the users table in this endpoint. Show a
 * role-based label; the is_internal chip to the right already flags admins.
 */
function authorLabel(msg: DisputeMessage): string {
  if (msg.is_internal) return 'Admin'
  return msg.author_type === 'admin' ? 'Admin' : 'Player'
}
</script>
