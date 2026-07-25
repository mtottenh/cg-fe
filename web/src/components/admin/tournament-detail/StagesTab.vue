<template>
  <v-card-text>
    <div class="d-flex justify-end mb-4">
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        :disabled="!['draft', 'published', 'registration', 'scheduled'].includes(tournamentStatus)"
        @click="openCreateModal"
      >
        Add Stage
      </v-btn>
    </div>

    <v-list v-if="stages.length > 0" lines="two">
      <v-list-item v-for="stage in sortedStages" :key="stage.id">
        <template v-slot:prepend>
          <v-avatar color="primary" variant="tonal">
            {{ stage.stage_order }}
          </v-avatar>
        </template>
        <v-list-item-title>{{ stage.name }}</v-list-item-title>
        <v-list-item-subtitle>
          Format: {{ stage.format || 'Default' }}
          <span v-if="stage.match_format"> | Match: {{ formatMatchFormat(stage.match_format) }}</span>
        </v-list-item-subtitle>
      </v-list-item>
    </v-list>
    <div v-else class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-layers</v-icon>
      <h3 class="text-h6 mb-2">No Stages</h3>
      <p class="text-medium-emphasis">Add stages for multi-phase tournaments (e.g., group stage + playoffs).</p>
    </div>
  </v-card-text>

  <!-- Stage Create Modal -->
  <v-dialog v-model="stageCreateModalOpen" max-width="500">
    <v-card>
      <v-card-title>Add Stage</v-card-title>
      <v-card-text>
        <v-text-field v-model="newStage.name" label="Stage Name" class="mb-2" />
        <v-text-field v-model.number="newStage.stage_order" label="Stage Order" type="number" class="mb-2" />
        <v-select
          aria-label="Format (optional)"
          v-model="newStage.format"
          :items="['single_elimination', 'double_elimination', 'round_robin', 'swiss', 'groups_and_playoffs']"
          label="Format (optional)"
          clearable
          class="mb-2"
        />
        <v-select
          aria-label="Match Format (optional)"
          v-model="newStage.match_format"
          :items="['bo1', 'bo3', 'bo5', 'bo7']"
          label="Match Format (optional)"
          clearable
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="stageCreateModalOpen = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="tournamentsStore.createStageState.loading"
          :disabled="!newStage.name"
          @click="handleCreateStage"
        >
          Create
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTournamentsStore } from '@/stores/tournaments'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { formatMatchFormat } from '@/utils/matchStatus'

const props = defineProps<{
  tournamentId: string
  tournamentStatus: string
}>()

const tournamentsStore = useTournamentsStore()
const feedback = useActionFeedback()

// Stage list comes straight from the store (createStage pushes into it)
const { stages } = storeToRefs(tournamentsStore)

const sortedStages = computed(() =>
  [...stages.value].sort((a, b) => a.stage_order - b.stage_order)
)

// Create-dialog state is owned by this tab
const stageCreateModalOpen = ref(false)
const newStage = ref({ name: '', stage_order: 1, format: null as string | null, match_format: null as string | null })

function openCreateModal() {
  newStage.value = { name: '', stage_order: stages.value.length + 1, format: null, match_format: null }
  stageCreateModalOpen.value = true
}

async function handleCreateStage() {
  if (!newStage.value.name) return
  const result = await feedback.run(
    () => tournamentsStore.createStage(props.tournamentId, {
      name: newStage.value.name,
      stage_order: newStage.value.stage_order,
      format: newStage.value.format ?? '',
      match_format: newStage.value.match_format,
    }),
    { success: 'Stage created', errorSource: tournamentsStore },
  )
  if (result !== null) {
    stageCreateModalOpen.value = false
  }
}
</script>
