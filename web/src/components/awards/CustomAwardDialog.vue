<template>
  <v-dialog v-model="open" max-width="620" persistent>
    <v-card data-testid="custom-award-dialog">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-trophy-award</v-icon>
        Custom Award
        <v-spacer />
        <v-btn aria-label="Close" icon variant="text" size="small" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <v-text-field
          v-model="form.name"
          label="Award Name *"
          variant="outlined"
          density="compact"
          class="mb-3"
          data-testid="custom-award-name"
          :rules="[(v: string) => !!v || 'Name is required']"
        />

        <v-textarea
          v-model="form.description"
          label="Description"
          variant="outlined"
          density="compact"
          rows="2"
          class="mb-3"
        />

        <div class="mb-3">
          <v-label class="mb-1 text-caption">Icon</v-label>
          <v-chip-group v-model="form.icon" column mandatory>
            <v-chip
              v-for="icon in AWARD_ICONS"
              :key="icon"
              :value="icon"
              filter
              size="small"
            >
              <v-icon :icon="icon" size="18" />
            </v-chip>
          </v-chip-group>
        </div>

        <div class="mb-4">
          <v-label class="mb-1 text-caption">Accent Color</v-label>
          <div class="d-flex ga-2 flex-wrap">
            <v-btn :aria-label="`Select color ${color}`"
              v-for="color in AWARD_COLORS"
              :key="color"
              :style="{ backgroundColor: color }"
              size="x-small"
              icon
              :variant="form.color === color ? 'elevated' : 'flat'"
              @click="form.color = color"
            >
              <v-icon v-if="form.color === color" size="14" color="white">mdi-check</v-icon>
            </v-btn>
          </div>
        </div>

        <v-autocomplete
          v-model="form.statKey"
          :items="statItems"
          item-title="label"
          item-value="key"
          label="Stat *"
          variant="outlined"
          density="compact"
          class="mb-1"
          :disabled="!!form.weaponName"
          data-testid="custom-award-stat"
        >
          <template v-slot:item="{ item, props: itemProps }">
            <v-list-item v-bind="itemProps" :subtitle="`${item.raw.category} · ${item.raw.key}`" />
          </template>
        </v-autocomplete>

        <v-text-field
          v-model="form.weaponName"
          label="...or weapon name (kills with that weapon)"
          variant="outlined"
          density="compact"
          class="mb-3"
          persistent-hint
          :hint="weaponHint"
          data-testid="custom-award-weapon"
        />

        <v-row dense>
          <v-col cols="12" sm="5">
            <v-select
              v-model="form.aggregation"
              :items="[...AGGREGATION_OPTIONS]"
              label="Aggregation"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-select
              v-model="form.direction"
              :items="[...DIRECTION_OPTIONS]"
              label="Direction"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field
              v-model.number="form.minMatches"
              label="Min matches"
              variant="outlined"
              density="compact"
              type="number"
              min="0"
              clearable
            />
          </v-col>
        </v-row>

        <v-alert v-if="errorMessage" type="error" density="compact" class="mt-2">
          {{ errorMessage }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          :disabled="!canSubmit"
          data-testid="custom-award-submit"
          @click="submit"
        >
          Create Award
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { StatCatalogEntryResponse, CreateAwardRequest } from '@/stores/awards'
import {
  AWARD_ICONS,
  AWARD_COLORS,
  AGGREGATION_OPTIONS,
  DIRECTION_OPTIONS,
  buildCustomAwardPayload,
  weaponStatKey,
  groupCatalogByCategory,
  type CustomAwardForm,
} from '@/utils/awards'

const props = defineProps<{
  statCatalog: StatCatalogEntryResponse[]
  loading?: boolean
  errorMessage?: string | null
}>()

const emit = defineEmits<{
  submit: [payload: CreateAwardRequest]
}>()

const open = defineModel<boolean>({ required: true })

function emptyForm(): CustomAwardForm {
  return {
    name: '',
    description: '',
    icon: 'mdi-trophy',
    color: AWARD_COLORS[0],
    statKey: null,
    weaponName: '',
    aggregation: 'sum',
    direction: 'desc',
    minMatches: null,
  }
}

const form = ref<CustomAwardForm>(emptyForm())

watch(open, (isOpen) => {
  if (isOpen) form.value = emptyForm()
})

/** Flattened catalog, sorted so entries group by category in the dropdown. */
const statItems = computed(() =>
  groupCatalogByCategory(props.statCatalog).flatMap((g) => g.entries),
)

const weaponHint = computed(() => {
  const weapon = form.value.weaponName?.trim()
  return weapon ? `Stat key: ${weaponStatKey(weapon)}` : 'Free text, e.g. "mag7" or "awp"'
})

const canSubmit = computed(
  () => !!form.value.name.trim() && (!!form.value.weaponName?.trim() || !!form.value.statKey),
)

function submit() {
  emit('submit', buildCustomAwardPayload(form.value))
}

function close() {
  open.value = false
}
</script>
