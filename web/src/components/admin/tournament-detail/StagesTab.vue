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
        <v-list-item-title>
          {{ stage.name }}
          <v-chip v-if="stage.status !== 'pending'" size="x-small" class="ml-2" variant="tonal">
            {{ stage.status }}
          </v-chip>
        </v-list-item-title>
        <v-list-item-subtitle>
          Format: {{ stage.format ? getStatusLabel(stageFormatMap, stage.format) : 'Default' }}
          <span v-if="stage.match_format"> | Match: {{ formatMatchFormat(stage.match_format) }}</span>
          <span v-if="finalOverrideLabel(stage)"> | {{ finalOverrideLabel(stage) }}</span>
          <span v-if="stage.advancement_count"> | Top {{ stage.advancement_count }} advance</span>
        </v-list-item-subtitle>
        <template v-slot:append>
          <!-- Pending stages only: once a stage activates its matches exist
               and the backend rejects edits. -->
          <v-btn
            v-if="stage.status === 'pending'"
            icon="mdi-pencil"
            size="small"
            variant="text"
            aria-label="Edit stage"
            data-testid="edit-stage"
            @click="openEditModal(stage)"
          />
        </template>
      </v-list-item>
    </v-list>
    <div v-else class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-layers</v-icon>
      <h3 class="text-h6 mb-2">No Stages</h3>
      <p class="text-medium-emphasis">Add stages for multi-phase tournaments (e.g., group stage + playoffs).</p>
    </div>
  </v-card-text>

  <!-- Stage Create/Edit Modal -->
  <v-dialog v-model="stageModalOpen" max-width="500">
    <v-card>
      <v-card-title>{{ editingStageId ? 'Edit Stage' : 'Add Stage' }}</v-card-title>
      <v-card-text>
        <v-text-field v-model="stageForm.name" label="Stage Name" class="mb-2" />
        <!-- stage_order and format are create-only: the update endpoint has no
             stage_order, and format is structural once chosen. -->
        <template v-if="!editingStageId">
          <v-text-field v-model.number="stageForm.stage_order" label="Stage Order" type="number" class="mb-2" />
          <!-- P-98/P-99: NOT `clearable`, and NOT "(optional)". `format` is a
               required field on CreateTournamentStageRequest and the backend
               parses it with `StageFormat::from_str`, which rejects `""`. The
               field being clearable + labelled optional is what made a blank
               submission — a guaranteed 400 — the natural path. -->
          <v-select
            aria-label="Format"
            v-model="stageForm.format"
            :items="STAGE_FORMAT_OPTIONS"
            label="Format"
            class="mb-2"
          />
        </template>
        <v-select
          aria-label="Match Format (optional)"
          v-model="stageForm.match_format"
          :items="matchFormatOptions"
          label="Match Format (optional)"
          clearable
          class="mb-2"
        />
        <!-- The stage final can outrank the per-stage best-of: "all rounds
             bo1, final bo3". SE brackets have a final; DE's real final is the
             grand final. -->
        <v-select
          v-if="stageForm.format === 'single_elimination'"
          aria-label="Final Match Format (optional)"
          v-model="stageForm.final_format"
          :items="matchFormatOptions"
          label="Final Match Format (optional)"
          clearable
          class="mb-2"
        />
        <v-select
          v-if="stageForm.format === 'double_elimination'"
          aria-label="Grand Final Match Format (optional)"
          v-model="stageForm.grand_final_format"
          :items="matchFormatOptions"
          label="Grand Final Match Format (optional)"
          clearable
          class="mb-2"
        />
        <v-text-field
          v-model.number="stageForm.advancement_count"
          label="Participants advancing (optional)"
          type="number"
          min="1"
          clearable
          hint="How many advance to the next stage (per group for group stages)"
          persistent-hint
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="stageModalOpen = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="tournamentsStore.createStageState.loading || tournamentsStore.updateStageState.loading"
          :disabled="!stageForm.name"
          @click="handleSubmitStage"
        >
          {{ editingStageId ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { stageFormatMap, getStatusLabel } from '@/utils/statusMaps'
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTournamentsStore, MATCH_FORMATS } from '@/stores/tournaments'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { formatMatchFormat } from '@/utils/matchStatus'
import type { components } from '@/api/types'

type TournamentStageResponse = components['schemas']['TournamentStageResponse']

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
 * makes the list the single source of truth for `stageForm.format`, so a value
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

const matchFormatOptions = MATCH_FORMATS.map((f) => ({ value: f.value, title: f.label }))

const props = defineProps<{
  tournamentId: string
  tournamentStatus: string
}>()

const tournamentsStore = useTournamentsStore()
const feedback = useActionFeedback()

// Stage list comes straight from the store (createStage pushes into it,
// updateStage replaces in place)
const { stages } = storeToRefs(tournamentsStore)

const sortedStages = computed(() =>
  [...stages.value].sort((a, b) => a.stage_order - b.stage_order)
)

/** "Final: Bo3" / "Grand final: Bo5" summary from a stage's format_settings. */
function finalOverrideLabel(stage: TournamentStageResponse): string | null {
  const settings = stage.format_settings as Record<string, unknown> | null
  if (!settings || typeof settings !== 'object') return null
  const final = typeof settings.final_format === 'string' ? settings.final_format : null
  const grandFinal = typeof settings.grand_final_format === 'string' ? settings.grand_final_format : null
  if (grandFinal) return `Grand final: ${formatMatchFormat(grandFinal)}`
  if (final) return `Final: ${formatMatchFormat(final)}`
  return null
}

// Create/edit-dialog state is owned by this tab.
//
// P-98: `format` is NOT nullable here. It used to be `null`-by-default behind a
// "(optional)" label, and the submit handler papered over that with `?? ''` —
// so an organiser who believed the label got a hard 400 with no way to tell
// which field was wrong. `StageFormat` derives `#[default] SingleElimination`
// (tournament.rs:641-645), so the backend already has an opinion about the
// default; the picker now starts on it. Typed to the union, the empty string is
// not representable, which is what removes the failure mode rather than hiding
// it. `match_format` stays nullable — it is genuinely optional
// (`match_format?: string | null` in the request DTO).
const stageModalOpen = ref(false)
const editingStageId = ref<string | null>(null)
const DEFAULT_STAGE_FORMAT: StageFormat = 'single_elimination'

function emptyStageForm() {
  return {
    name: '',
    stage_order: 1,
    format: DEFAULT_STAGE_FORMAT as StageFormat,
    match_format: null as string | null,
    final_format: null as string | null,
    grand_final_format: null as string | null,
    advancement_count: null as number | null,
  }
}
const stageForm = ref(emptyStageForm())

function openCreateModal() {
  editingStageId.value = null
  stageForm.value = emptyStageForm()
  stageForm.value.stage_order = stages.value.length + 1
  stageModalOpen.value = true
}

function openEditModal(stage: TournamentStageResponse) {
  editingStageId.value = stage.id
  const settings = (stage.format_settings ?? {}) as Record<string, unknown>
  stageForm.value = {
    name: stage.name,
    stage_order: stage.stage_order,
    format: (STAGE_FORMATS as readonly string[]).includes(stage.format)
      ? (stage.format as StageFormat)
      : DEFAULT_STAGE_FORMAT,
    match_format: stage.match_format ?? null,
    final_format: typeof settings.final_format === 'string' ? settings.final_format : null,
    grand_final_format:
      typeof settings.grand_final_format === 'string' ? settings.grand_final_format : null,
    advancement_count: stage.advancement_count ?? null,
  }
  stageModalOpen.value = true
}

/**
 * Overrides ride in the stage's format_settings JSONB. Existing foreign keys
 * (group_format etc.) are preserved on edit — the update endpoint replaces
 * the settings object wholesale, so dropping them here would erase them.
 */
function buildFormatSettings(existing: unknown): Record<string, unknown> | null {
  const base =
    existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {}
  delete base.final_format
  delete base.grand_final_format
  if (stageForm.value.final_format) base.final_format = stageForm.value.final_format
  if (stageForm.value.grand_final_format) base.grand_final_format = stageForm.value.grand_final_format
  return Object.keys(base).length > 0 ? base : null
}

async function handleSubmitStage() {
  if (!stageForm.value.name) return

  if (editingStageId.value) {
    const stage = stages.value.find((s) => s.id === editingStageId.value)
    const result = await feedback.run(
      () => tournamentsStore.updateStage(props.tournamentId, editingStageId.value!, {
        name: stageForm.value.name,
        match_format: stageForm.value.match_format,
        advancement_count: stageForm.value.advancement_count,
        format_settings: buildFormatSettings(stage?.format_settings),
      }),
      { success: 'Stage updated', errorSource: tournamentsStore },
    )
    if (result !== null) stageModalOpen.value = false
    return
  }

  const result = await feedback.run(
    () => tournamentsStore.createStage(props.tournamentId, {
      name: stageForm.value.name,
      stage_order: stageForm.value.stage_order,
      // No `?? ''` fallback: `format` is non-nullable above, so there is no
      // blank to fall back FROM. The old fallback turned a UI-level "you did
      // not pick one" into a server-side parse failure (P-98).
      format: stageForm.value.format,
      match_format: stageForm.value.match_format,
      advancement_count: stageForm.value.advancement_count,
      format_settings: buildFormatSettings(null),
    }),
    { success: 'Stage created', errorSource: tournamentsStore },
  )
  if (result !== null) {
    stageModalOpen.value = false
  }
}
</script>
