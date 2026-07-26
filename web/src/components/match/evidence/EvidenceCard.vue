<template>
  <v-card variant="outlined" class="evidence-card">
    <div class="d-flex align-center pa-2">
      <v-icon class="mr-2" :color="iconColor">{{ icon }}</v-icon>
      <span class="text-body-2 text-truncate flex-grow-1" :title="evidence.name">
        {{ evidence.name }}
      </span>
      <v-btn aria-label="Remove evidence"
        v-if="!readonly"
        icon="mdi-close"
        size="x-small"
        variant="text"
        @click="$emit('remove')"
      />
    </div>
    <img
      v-if="evidence.preview"
      :src="evidence.preview"
      class="preview"
      :alt="evidence.name"
    />
    <div v-if="evidence.status === 'uploading'" class="px-2 pb-2">
      <v-progress-linear
        :model-value="evidence.progress || 0"
        color="primary"
        height="4"
        rounded
      />
    </div>
    <div v-if="evidence.status === 'error'" class="px-2 pb-2">
      <v-chip color="error" size="x-small">Upload failed</v-chip>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface LocalEvidence {
  localId: string
  name: string
  type: 'image' | 'demo' | 'link' | 'other'
  preview?: string
  status?: 'pending' | 'uploading' | 'complete' | 'error'
  progress?: number
  error?: string
}

const props = defineProps<{
  evidence: LocalEvidence
  readonly?: boolean
}>()

defineEmits<{
  remove: []
}>()

const icon = computed(() => {
  switch (props.evidence.type) {
    case 'image':
      return 'mdi-image'
    case 'demo':
      return 'mdi-file-video'
    case 'link':
      return 'mdi-link'
    default:
      return 'mdi-file'
  }
})

const iconColor = computed(() => {
  switch (props.evidence.status) {
    case 'uploading':
      return 'primary'
    case 'error':
      return 'error'
    case 'complete':
      return 'success'
    default:
      return undefined
  }
})
</script>

<style scoped>
.evidence-card {
  max-width: 200px;
  min-width: 150px;
}

.preview {
  width: 100%;
  height: 80px;
  object-fit: cover;
}
</style>
