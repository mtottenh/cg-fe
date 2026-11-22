<template>
  <div data-testid="overrides-editor">
    <p class="text-body-2 text-medium-emphasis mb-3">
      MatchZy settings the portal writes into a managed block of <code>cfg/MatchZy/config.cfg</code>,
      so plugin updates never overwrite them. Demo upload, webhooks and match loading stay
      portal-owned.
    </p>

    <div class="d-flex align-center ga-2 flex-wrap mb-3">
      <v-chip
        size="small"
        variant="tonal"
        :color="appliedChip.color"
        :prepend-icon="appliedChip.icon"
        data-testid="overrides-applied"
      >
        {{ appliedChip.label }}
      </v-chip>
      <v-chip
        v-if="overrides?.pending"
        size="small"
        variant="tonal"
        color="warning"
        prepend-icon="mdi-timer-sand"
        data-testid="overrides-pending"
      >
        Waiting for the agent
      </v-chip>
    </div>

    <v-alert
      v-if="loadError"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-testid="overrides-load-error"
    >
      {{ loadError }}
    </v-alert>

    <v-table density="compact" class="mb-2">
      <thead>
        <tr>
          <th>Setting</th>
          <th>Value</th>
          <th class="text-right" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i" data-testid="override-row">
          <td class="py-1">
            <v-text-field
              v-model="row.name"
              :aria-label="`Setting name ${i + 1}`"
              placeholder="matchzy_…"
              density="compact"
              variant="outlined"
              hide-details="auto"
              :error-messages="touched || row.name ? (validation.rows[i]?.name ?? []) : []"
              data-testid="override-name"
            />
          </td>
          <td class="py-1">
            <v-text-field
              v-model="row.value"
              :aria-label="`Value ${i + 1}`"
              density="compact"
              variant="outlined"
              hide-details="auto"
              :error-messages="validation.rows[i]?.value ?? []"
              data-testid="override-value"
            />
          </td>
          <td class="text-right">
            <v-btn
              aria-label="Remove setting"
              title="Remove setting"
              icon
              size="small"
              variant="text"
              data-testid="override-remove"
              @click="removeRow(i)"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="3" class="text-medium-emphasis text-body-2">No overrides.</td>
        </tr>
      </tbody>
    </v-table>

    <p v-if="validation.set" class="text-error text-body-2 mb-2" data-testid="overrides-set-error">
      {{ validation.set }}
    </p>

    <div class="d-flex align-center ga-2 flex-wrap">
      <v-btn
        size="small"
        variant="tonal"
        prepend-icon="mdi-plus"
        :disabled="rows.length >= MAX_OVERRIDES"
        data-testid="override-add"
        @click="addRow"
      >
        Add setting
      </v-btn>
      <v-spacer />
      <v-btn
        size="small"
        variant="text"
        :disabled="!dirty || saving"
        data-testid="overrides-reset"
        @click="resetRows"
      >
        Discard changes
      </v-btn>
      <v-btn
        size="small"
        color="primary"
        variant="flat"
        :loading="saving"
        :disabled="!dirty"
        data-testid="overrides-save"
        @click="save"
      >
        Save
      </v-btn>
    </div>

    <v-alert
      v-if="saveError"
      type="error"
      variant="tonal"
      density="compact"
      class="mt-3"
      closable
      data-testid="overrides-save-error"
      @click:close="saveError = null"
    >
      {{ saveError }}
    </v-alert>
    <v-alert
      v-if="lastSave"
      :type="lastSave.delivery === 'applying' ? 'success' : 'info'"
      variant="tonal"
      density="compact"
      class="mt-3"
      data-testid="overrides-delivery"
      :data-delivery="lastSave.delivery"
    >
      <div>Saved. {{ getStatusLabel(overridesDeliveryMap, lastSave.delivery) }}.</div>
      <div v-if="lastSave.detail" class="text-body-2">{{ lastSave.detail }}</div>
      <div v-if="lastSave.job_id" class="text-body-2">
        Follow the repair in the Overview tab.
      </div>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ApiError } from '@/api'
import { useGameServerUpdatesStore } from '@/stores/gameServerUpdates'
import { overridesDeliveryMap } from '@/utils/gameServerUpdates'
import {
  MAX_OVERRIDES,
  overridesToRows,
  rowsToOverrides,
  validateOverrideRows,
  type OverrideRow,
} from '@/utils/matchzyOverrides'
import { getStatusLabel } from '@/utils/statusMaps'

const props = defineProps<{ serverId: string }>()
const emit = defineEmits<{ saved: [] }>()

const store = useGameServerUpdatesStore()
const { overrides, overridesSave: lastSave } = storeToRefs(store)

const rows = ref<OverrideRow[]>([])
const touched = ref(false)
const saving = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)

const validation = computed(() => validateOverrideRows(rows.value))

const stored = computed(() => overridesToRows(overrides.value?.overrides ?? {}))
const dirty = computed(() => JSON.stringify(rows.value) !== JSON.stringify(stored.value))

const appliedChip = computed(() => {
  const applied = overrides.value?.applied
  if (applied === true) return { color: 'success', icon: 'mdi-check', label: 'Applied on the server' }
  if (applied === false) return { color: 'warning', icon: 'mdi-alert', label: 'Not applied on the server' }
  return { color: 'grey', icon: 'mdi-help', label: 'Applied: unknown' }
})

function resetRows() {
  rows.value = stored.value.map((r) => ({ ...r }))
  touched.value = false
}

function addRow() {
  rows.value.push({ name: '', value: '' })
}

function removeRow(i: number) {
  rows.value.splice(i, 1)
}

async function load() {
  loadError.value = null
  saveError.value = null
  store.overridesSave = null
  const serverId = props.serverId
  try {
    await store.fetchOverrides(serverId)
    // Switched servers meanwhile: that server's load fills the rows.
    if (serverId !== props.serverId) return
    resetRows()
  } catch (e) {
    if (serverId !== props.serverId) return
    loadError.value = e instanceof ApiError ? e.detail : 'Failed to load the MatchZy overrides'
  }
}

async function save() {
  touched.value = true
  if (!validation.value.valid) return
  saving.value = true
  saveError.value = null
  const serverId = props.serverId
  try {
    await store.saveOverrides(serverId, rowsToOverrides(rows.value))
    if (serverId !== props.serverId) return
    resetRows()
    emit('saved')
  } catch (e) {
    // The server's rule text is authoritative.
    saveError.value = e instanceof ApiError ? e.detail : 'Failed to save the MatchZy overrides'
  } finally {
    saving.value = false
  }
}

watch(() => props.serverId, load, { immediate: true })
</script>
