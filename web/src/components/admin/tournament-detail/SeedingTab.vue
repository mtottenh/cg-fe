<template>
  <v-card-text>
    <div class="d-flex align-center ga-2 mb-4">
      <v-btn
        color="primary"
        prepend-icon="mdi-auto-fix"
        :loading="autoSeedLoading"
        @click="$emit('auto-seed')"
      >
        Auto Seed
      </v-btn>
      <v-btn
        variant="tonal"
        prepend-icon="mdi-content-save"
        :loading="saveSeedingLoading"
        :disabled="seedingList.length === 0"
        @click="emitSave"
      >
        Save Manual Seeding
      </v-btn>
      <v-btn
        variant="tonal"
        color="error"
        prepend-icon="mdi-delete"
        :loading="clearSeedingLoading"
        :disabled="seedingList.length === 0"
        @click="$emit('clear')"
      >
        Clear Seeding
      </v-btn>
    </div>

    <v-list v-if="seedingList.length > 0" density="compact">
      <v-list-item
        v-for="(item, index) in seedingList"
        :key="item.registration_id"
        class="px-2"
      >
        <template v-slot:prepend>
          <v-chip size="small" variant="tonal" class="mr-3" min-width="40">
            #{{ index + 1 }}
          </v-chip>
        </template>
        <v-list-item-title>{{ item.participant_name }}</v-list-item-title>
        <v-list-item-subtitle v-if="item.seed_rating">
          Rating: {{ item.seed_rating }}
        </v-list-item-subtitle>
        <template v-slot:append>
          <v-btn aria-label="Move seed up" icon size="x-small" variant="text" :disabled="index === 0" @click="moveSeed(index, -1)">
            <v-icon>mdi-chevron-up</v-icon>
          </v-btn>
          <v-btn aria-label="Move seed down" icon size="x-small" variant="text" :disabled="index === seedingList.length - 1" @click="moveSeed(index, 1)">
            <v-icon>mdi-chevron-down</v-icon>
          </v-btn>
        </template>
      </v-list-item>
    </v-list>
    <div v-else class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-sort-numeric-ascending</v-icon>
      <h3 class="text-h6 mb-2">No Seeding</h3>
      <p class="text-medium-emphasis">Use "Auto Seed" to generate seeding based on ratings, or manually arrange participants.</p>
    </div>
  </v-card-text>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SeededParticipantResponse } from '@/stores/tournaments'

const props = defineProps<{
  /** Canonical seeding from the store; the tab keeps its own reorderable copy. */
  seeding: SeededParticipantResponse[]
  autoSeedLoading: boolean
  saveSeedingLoading: boolean
  clearSeedingLoading: boolean
}>()

const emit = defineEmits<{
  'auto-seed': []
  save: [seeds: Array<{ registration_id: string; seed: number }>]
  clear: []
}>()

// Local reorderable copy, re-synced whenever the store's seeding changes
const seedingList = ref<SeededParticipantResponse[]>([])
watch(() => props.seeding, (newSeeding) => {
  seedingList.value = [...newSeeding]
}, { immediate: true })

function moveSeed(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= seedingList.value.length) return
  const temp = seedingList.value[index]!
  seedingList.value[index] = seedingList.value[target]!
  seedingList.value[target] = temp
}

function emitSave() {
  emit('save', seedingList.value.map((s, i) => ({
    registration_id: s.registration_id,
    seed: i + 1,
  })))
}
</script>
