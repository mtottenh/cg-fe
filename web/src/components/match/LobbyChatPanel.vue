<template>
  <v-card class="mb-6">
    <v-card-title class="d-flex align-center justify-space-between">
      <div>
        <v-icon start>mdi-chat</v-icon>
        Lobby Chat
      </div>
      <v-btn-toggle v-model="activeChatType" mandatory density="compact" variant="outlined">
        <v-btn value="all" size="small">All</v-btn>
        <v-btn value="team" size="small">Team</v-btn>
      </v-btn-toggle>
    </v-card-title>

    <v-card-text class="pa-0">
      <!-- Message list -->
      <div ref="messageContainer" class="chat-messages pa-3" @scroll="handleScroll">
        <div v-if="filteredMessages.length === 0" class="text-center text-caption text-medium-emphasis pa-4">
          No messages yet. Say something!
        </div>
        <div
          v-for="msg in filteredMessages"
          :key="msg.id"
          class="chat-message mb-2"
        >
          <div class="d-flex align-center ga-1">
            <v-chip
              v-if="msg.chat_type === 'team'"
              size="x-small"
              color="info"
              variant="flat"
              label
            >
              Team
            </v-chip>
            <span class="text-body-2 font-weight-medium">{{ msg.author.username }}</span>
            <span class="text-caption text-medium-emphasis ml-auto">{{ formatTime(msg.timestamp) }}</span>
          </div>
          <div class="text-body-2 ml-1">{{ msg.content }}</div>
        </div>
      </div>

      <!-- Input -->
      <v-divider />
      <div class="pa-3">
        <v-text-field
          v-model="inputText"
          :aria-label="activeChatType === 'team' ? 'Message your team' : 'Message everyone'"
          :placeholder="activeChatType === 'team' ? 'Message your team...' : 'Message everyone...'"
          variant="outlined"
          density="compact"
          hide-details
          maxlength="500"
          :disabled="!connected"
          @keydown.enter.prevent="handleSend"
        >
          <template #append-inner>
            <v-btn aria-label="Send message"
              icon
              size="small"
              variant="text"
              :disabled="!inputText.trim() || !connected"
              @click="handleSend"
            >
              <v-icon>mdi-send</v-icon>
            </v-btn>
          </template>
        </v-text-field>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { ChatMessage } from '@/composables/useMatchLobby'

const props = defineProps<{
  messages: ChatMessage[]
  connected: boolean
}>()

const emit = defineEmits<{
  send: [chatType: 'team' | 'all', content: string]
}>()

const activeChatType = ref<'all' | 'team'>('all')
const inputText = ref('')
const messageContainer = ref<HTMLElement | null>(null)
const isScrolledToBottom = ref(true)

const filteredMessages = computed(() => {
  if (activeChatType.value === 'all') {
    return props.messages.filter(m => m.chat_type === 'all')
  }
  return props.messages.filter(m => m.chat_type === 'team')
})

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function handleSend() {
  const content = inputText.value.trim()
  if (!content || !props.connected) return
  emit('send', activeChatType.value, content)
  inputText.value = ''
}

function handleScroll() {
  if (!messageContainer.value) return
  const el = messageContainer.value
  isScrolledToBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 10
}

function scrollToBottom() {
  if (!messageContainer.value || !isScrolledToBottom.value) return
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight
    }
  })
}

// Auto-scroll when new messages arrive
watch(() => props.messages.length, () => {
  scrollToBottom()
})
</script>

<style scoped>
.chat-messages {
  height: 250px;
  overflow-y: auto;
}

.chat-message + .chat-message {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-top: 8px;
}
</style>
