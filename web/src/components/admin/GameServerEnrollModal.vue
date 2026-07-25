<template>
  <v-dialog
    v-model="open"
    max-width="640"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Agent Enrollment: {{ server?.name }}</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <template v-if="!token">
          <p class="mb-4">
            Minting a token invalidates any previously issued one. The agent on the
            game host exchanges it (plus a locally generated key) for a client
            certificate — the token itself is shown <strong>once</strong>.
          </p>
          <v-btn
            color="primary"
            prepend-icon="mdi-key-plus"
            :loading="minting"
            @click="mint"
          >
            Mint Enrollment Token
          </v-btn>
        </template>

        <template v-else>
          <v-alert type="warning" variant="tonal" class="mb-4" density="compact">
            This token is shown once and expires {{ expiresAt }}. Copy it now.
          </v-alert>

          <div class="d-flex align-center ga-2 mb-4">
            <code class="token-box flex-grow-1">{{ token }}</code>
            <v-btn
              aria-label="Copy token"
              title="Copy token"
              icon
              size="small"
              variant="tonal"
              @click="copy(token)"
            >
              <v-icon>{{ copied === token ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
            </v-btn>
          </div>

          <p class="text-subtitle-2 mb-2">On the game-server host:</p>
          <div class="d-flex align-center ga-2">
            <code class="token-box flex-grow-1">{{ installSnippet }}</code>
            <v-btn
              aria-label="Copy command"
              title="Copy command"
              icon
              size="small"
              variant="tonal"
              @click="copy(installSnippet)"
            >
              <v-icon>{{ copied === installSnippet ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
            </v-btn>
          </div>
        </template>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">{{ token ? 'Done' : 'Cancel' }}</v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError } from '@/api'
import { useGameServersStore } from '@/stores/gameServers'
import type { GameServer } from '@/stores/gameServers'

const props = defineProps<{
  server: GameServer | null
}>()

const open = defineModel<boolean>({ required: true })

const store = useGameServersStore()
const minting = ref(false)
const token = ref<string | null>(null)
const expiresAtRaw = ref<string | null>(null)
const error = ref<string | null>(null)
const copied = ref<string | null>(null)

const expiresAt = computed(() =>
  expiresAtRaw.value ? new Date(expiresAtRaw.value).toLocaleString() : '',
)

const installSnippet = computed(
  () =>
    `sudo portal-server-agent enroll --url ${window.location.origin} --token ${token.value ?? ''}`,
)

watch(open, (isOpen) => {
  if (isOpen) {
    token.value = null
    expiresAtRaw.value = null
    error.value = null
    copied.value = null
  }
})

async function mint() {
  if (!props.server) return
  minting.value = true
  error.value = null
  try {
    const result = await store.mintEnrollmentToken(props.server.id)
    token.value = result.token
    expiresAtRaw.value = result.expires_at
  } catch (e) {
    error.value = e instanceof ApiError ? e.detail : 'Failed to mint token'
  } finally {
    minting.value = false
  }
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  copied.value = text
  setTimeout(() => {
    if (copied.value === text) copied.value = null
  }, 2000)
}

function close() {
  open.value = false
}
</script>

<style scoped>
.token-box {
  display: block;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.8rem;
  overflow-x: auto;
  white-space: nowrap;
}
</style>
