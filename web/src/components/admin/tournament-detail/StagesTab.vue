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
          Format: {{ stage.format ? getStatusLabel(stageFormatMap, stage.format) : 'Default' }}
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
        <!-- P-98/P-99: NOT `clearable`, and NOT "(optional)". `format` is a
             required field on CreateTournamentStageRequest and the backend
             parses it with `StageFormat::from_str`, which rejects `""`. The
             field being clearable + labelled optional is what made a blank
             submission — a guaranteed 400 — the natural path. -->
        <v-select
          aria-label="Format"
          v-model="newStage.format"
          :items="STAGE_FORMAT_OPTIONS"
          label="Format"
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
import { stageFormatMap, getStatusLabel } from '@/utils/statusMaps'
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTournamentsStore } from '@/stores/tournaments'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { formatMatchFormat } from '@/utils/matchStatus'

/**
 * P-99 — the stage formats the backend actually accepts.
 *
 * Mirrors `StageFormat::from_str` (api/crates/portal-core/src/types/
 * tournament.rs:669-678). This list used to offer `groups_and_playoffs`, which
 * that match arm has never had — so picking it produced a guaranteed 400
 * "invalid stage format" — while omitting `group_stage`, the value it does
 * accept. The only multi-group format the product has was therefore
 * unreachable, and the option in its place was dead.
 *
 * It is a hand-written literal rather than a generated union because
 * `CreateTournamentStageRequest.format` is typed `string` on the wire — the API
 * stringifies `StageFormat` instead of declaring it (P-112), so there is no
 * `components['schemas']['StageFormat']` to key this to. `as const` at least
 * makes the list the single source of truth for `newStage.format`, so a value
 * that is not in it is a compile error; agreement with the *backend* is pinned
 * by the tests instead — `StagesTab.formats.test.ts` locks the list, and
 * `stage-formats.spec.ts` drives every entry through the real API, so a dead
 * option fails rather than shipping.
 */
const STAGE_FORMATS = [
  'single_elimination',
  'double_elimination',
  'round_robin',
  'swiss',
  'group_stage',
] as const

type StageFormat = (typeof STAGE_FORMATS)[number]

// P-117: the picker showed raw wire values too. Titles come from the same map
// the list renders through, so the two can never disagree.
const STAGE_FORMAT_OPTIONS = STAGE_FORMATS.map((value) => ({
  value,
  title: getStatusLabel(stageFormatMap, value),
}))

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

// Create-dialog state is owned by this tab.
//
// P-98: `format` is NOT nullable here. It used to be `null`-by-default behind a
// "(optional)" label, and `handleCreateStage` papered over that with `?? ''` —
// so an organiser who believed the label got a hard 400 with no way to tell
// which field was wrong. `StageFormat` derives `#[default] SingleElimination`
// (tournament.rs:641-645), so the backend already has an opinion about the
// default; the picker now starts on it. Typed to the union, the empty string is
// not representable, which is what removes the failure mode rather than hiding
// it. `match_format` stays nullable — it is genuinely optional
// (`match_format?: string | null` in the request DTO).
const stageCreateModalOpen = ref(false)
const DEFAULT_STAGE_FORMAT: StageFormat = 'single_elimination'
const newStage = ref({
  name: '',
  stage_order: 1,
  format: DEFAULT_STAGE_FORMAT as StageFormat,
  match_format: null as string | null,
})

function openCreateModal() {
  newStage.value = {
    name: '',
    stage_order: stages.value.length + 1,
    format: DEFAULT_STAGE_FORMAT,
    match_format: null,
  }
  stageCreateModalOpen.value = true
}

async function handleCreateStage() {
  if (!newStage.value.name) return
  const result = await feedback.run(
    () => tournamentsStore.createStage(props.tournamentId, {
      name: newStage.value.name,
      stage_order: newStage.value.stage_order,
      // No `?? ''` fallback: `format` is non-nullable above, so there is no
      // blank to fall back FROM. The old fallback turned a UI-level "you did
      // not pick one" into a server-side parse failure (P-98).
      format: newStage.value.format,
      match_format: newStage.value.match_format,
    }),
    { success: 'Stage created', errorSource: tournamentsStore },
  )
  if (result !== null) {
    stageCreateModalOpen.value = false
  }
}
</script>
