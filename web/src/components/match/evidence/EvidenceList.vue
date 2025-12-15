<template>
  <div class="evidence-list">
    <p class="text-subtitle-2 mb-2">Attached ({{ evidence.length }})</p>
    <div class="d-flex flex-wrap gap-2">
      <EvidenceCard
        v-for="item in evidence"
        :key="item.localId"
        :evidence="item"
        :readonly="readonly"
        @remove="$emit('remove', item.localId)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import EvidenceCard, { type LocalEvidence } from './EvidenceCard.vue'

defineProps<{
  evidence: LocalEvidence[]
  readonly?: boolean
}>()

defineEmits<{
  remove: [localId: string]
}>()
</script>
