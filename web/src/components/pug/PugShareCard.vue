<template>
  <v-card variant="tonal" color="primary">
    <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
      <v-icon icon="mdi-link-variant" size="small" />
      Invite link
    </v-card-title>
    <v-card-text>
      <div class="d-flex align-center ga-2">
        <code class="share-link flex-grow-1" data-testid="pug-share-link">{{ joinUrl }}</code>
        <v-btn
          :icon="copied ? 'mdi-check' : 'mdi-content-copy'"
          size="small"
          variant="text"
          aria-label="Copy invite link"
          data-testid="pug-copy-link"
          @click="copy"
        />
        <v-btn
          v-if="isCreator"
          icon="mdi-refresh"
          size="small"
          variant="text"
          aria-label="Rotate invite code (old links stop working)"
          :loading="rotating"
          data-testid="pug-rotate-code"
          @click="emit('rotate')"
        />
      </div>
      <div class="text-caption text-medium-emphasis mt-2">
        Anyone with this link can join until the lobby locks.
        <template v-if="isCreator"> Rotating the code kills old links instantly.</template>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  joinCode: string
  isCreator: boolean
  rotating: boolean
}>()

const emit = defineEmits<{ rotate: [] }>()

const joinUrl = computed(() => `${window.location.origin}/pugs/join/${props.joinCode}`)

const copied = ref(false)
async function copy(): Promise<void> {
  await navigator.clipboard.writeText(joinUrl.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<style scoped>
.share-link {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 0.85rem;
  overflow-x: auto;
  white-space: nowrap;
}
</style>
