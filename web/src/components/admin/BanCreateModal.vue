<template>
  <v-dialog v-model="dialogOpen" max-width="600" persistent>
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Create Ban</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-form ref="formRef" v-model="formValid" @submit.prevent="submit">
          <!-- Player Selection -->
          <UserSearchAutocomplete
            v-model="selectedPlayer"
            label="Player to Ban *"
            placeholder="Search by display name..."
            :rules="[rules.required]"
            class="mb-4"
          />

          <!-- Ban Type -->
          <v-select
            v-model="form.ban_type"
            :items="banTypeOptions"
            label="Ban Type *"
            :rules="[rules.required]"
            variant="outlined"
            density="compact"
            class="mb-4"
          >
            <template v-slot:item="{ item, props: itemProps }">
              <v-list-item v-bind="itemProps">
                <template v-slot:prepend>
                  <v-icon :color="getBanTypeColor(item.value as string)">
                    {{ getBanTypeIcon(item.value as string) }}
                  </v-icon>
                </template>
              </v-list-item>
            </template>
          </v-select>

          <!-- League Selection (for league bans) -->
          <v-expand-transition>
            <div v-if="form.ban_type === 'league'">
              <v-alert type="info" density="compact" variant="tonal" class="mb-4">
                League bans prevent the player from participating in a specific league.
              </v-alert>

              <LeagueSearchAutocomplete
                v-model="selectedLeague"
                label="Select League *"
                placeholder="Search by name or slug..."
                :rules="form.ban_type === 'league' ? [rules.required] : []"
                class="mb-4"
              />
            </div>
          </v-expand-transition>

          <!-- Tournament Selection (for tournament bans) -->
          <v-expand-transition>
            <div v-if="form.ban_type === 'tournament'">
              <v-alert type="info" density="compact" variant="tonal" class="mb-4">
                Tournament bans prevent the player from participating in a specific tournament.
              </v-alert>

              <v-text-field
                v-model="form.tournament_scope_id"
                label="Tournament ID *"
                placeholder="Enter the tournament UUID..."
                variant="outlined"
                density="compact"
                :rules="form.ban_type === 'tournament' ? [rules.required, rules.uuid] : []"
                class="mb-4"
              />
            </div>
          </v-expand-transition>

          <!-- Duration -->
          <v-radio-group v-model="durationType" inline class="mb-2">
            <v-radio label="Permanent" value="permanent" />
            <v-radio label="Temporary" value="temporary" />
          </v-radio-group>

          <v-expand-transition>
            <v-row v-if="durationType === 'temporary'" class="mb-4">
              <v-col cols="6">
                <v-text-field
                  v-model.number="durationValue"
                  type="number"
                  label="Duration *"
                  variant="outlined"
                  density="compact"
                  min="1"
                  :rules="durationType === 'temporary' ? [rules.required, rules.positiveNumber] : []"
                />
              </v-col>
              <v-col cols="6">
                <v-select
                  v-model="durationUnit"
                  :items="durationUnitOptions"
                  label="Unit"
                  variant="outlined"
                  density="compact"
                />
              </v-col>
            </v-row>
          </v-expand-transition>

          <!-- Reason -->
          <v-textarea
            v-model="form.reason"
            label="Reason *"
            placeholder="Explain why this player is being banned..."
            variant="outlined"
            density="compact"
            rows="3"
            :rules="[rules.required, rules.minLength(10)]"
            counter
          />
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close" :disabled="submitting">
          Cancel
        </v-btn>
        <v-btn
          color="error"
          variant="flat"
          :loading="submitting"
          :disabled="!formValid || !isFormComplete"
          @click="submit"
        >
          Create Ban
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useBansStore, type BanType, type CreateBanRequest } from '@/stores/bans'
import UserSearchAutocomplete from '@/components/admin/UserSearchAutocomplete.vue'
import LeagueSearchAutocomplete from '@/components/admin/LeagueSearchAutocomplete.vue'
import type { components } from '@/api/types'

type PlayerSummary = components['schemas']['PlayerSearchResponse']
type LeagueResponse = components['schemas']['LeagueResponse']

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created'): void
}>()

const bansStore = useBansStore()

const dialogOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const formRef = ref()
const formValid = ref(false)
const submitting = ref(false)

const selectedPlayer = ref<PlayerSummary | null>(null)
const selectedLeague = ref<LeagueResponse | null>(null)
const durationType = ref<'permanent' | 'temporary'>('permanent')
const durationValue = ref(1)
const durationUnit = ref<'hours' | 'days' | 'weeks'>('days')

const form = ref({
  ban_type: 'matchmaking' as BanType,
  reason: '',
  tournament_scope_id: '', // For tournament bans (manual UUID entry until tournaments are searchable)
})

const banTypeOptions = [
  { title: 'Platform Ban', value: 'platform', subtitle: 'Complete platform access restriction' },
  { title: 'Matchmaking Ban', value: 'matchmaking', subtitle: 'Cannot queue for matches' },
  { title: 'Chat Ban', value: 'chat', subtitle: 'Cannot send messages' },
  { title: 'League Ban', value: 'league', subtitle: 'Banned from a specific league' },
  { title: 'Tournament Ban', value: 'tournament', subtitle: 'Banned from a specific tournament' },
]

const durationUnitOptions = [
  { title: 'Hours', value: 'hours' },
  { title: 'Days', value: 'days' },
  { title: 'Weeks', value: 'weeks' },
]

const requiresLeagueSelection = computed(() => form.value.ban_type === 'league')
const requiresTournamentSelection = computed(() => form.value.ban_type === 'tournament')

// Form is valid if we have player, reason, and scope (when required)
const isFormComplete = computed(() => {
  if (!selectedPlayer.value) return false
  if (requiresLeagueSelection.value && !selectedLeague.value) return false
  if (requiresTournamentSelection.value && !form.value.tournament_scope_id) return false
  return true
})

const rules = {
  required: (v: unknown) => !!v || 'This field is required',
  minLength: (min: number) => (v: string) =>
    !v || v.length >= min || `Must be at least ${min} characters`,
  positiveNumber: (v: number) => v > 0 || 'Must be a positive number',
  uuid: (v: string) => {
    if (!v) return true
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(v) || 'Must be a valid UUID'
  },
}

function getBanTypeIcon(type: string): string {
  switch (type) {
    case 'platform':
      return 'mdi-block-helper'
    case 'matchmaking':
      return 'mdi-controller-off'
    case 'chat':
      return 'mdi-message-off'
    case 'league':
      return 'mdi-trophy-broken'
    case 'tournament':
      return 'mdi-tournament'
    default:
      return 'mdi-gavel'
  }
}

function getBanTypeColor(type: string): string {
  switch (type) {
    case 'platform':
      return 'error'
    case 'matchmaking':
      return 'warning'
    case 'chat':
      return 'info'
    case 'league':
      return 'purple'
    case 'tournament':
      return 'orange'
    default:
      return 'grey'
  }
}

function calculateDurationSeconds(): number | undefined {
  if (durationType.value === 'permanent') {
    return undefined
  }

  const multipliers = {
    hours: 3600,
    days: 86400,
    weeks: 604800,
  } as const

  return durationValue.value * multipliers[durationUnit.value as keyof typeof multipliers]
}

async function submit() {
  if (!selectedPlayer.value || !formValid.value || !isFormComplete.value) return

  submitting.value = true

  try {
    const request: CreateBanRequest = {
      user_id: selectedPlayer.value.id,
      ban_type: form.value.ban_type,
      reason: form.value.reason,
      duration_seconds: calculateDurationSeconds(),
    }

    // Add scope for league bans
    if (requiresLeagueSelection.value && selectedLeague.value) {
      request.scope_type = 'league'
      request.scope_id = selectedLeague.value.id
    }

    // Add scope for tournament bans
    if (requiresTournamentSelection.value && form.value.tournament_scope_id) {
      request.scope_type = 'tournament'
      request.scope_id = form.value.tournament_scope_id
    }

    await bansStore.createBan(request)
    emit('created')
    close()
  } catch (e) {
    console.error('Failed to create ban:', e)
  } finally {
    submitting.value = false
  }
}

function close() {
  dialogOpen.value = false
  resetForm()
}

function resetForm() {
  selectedPlayer.value = null
  selectedLeague.value = null
  form.value = {
    ban_type: 'matchmaking',
    reason: '',
    tournament_scope_id: '',
  }
  durationType.value = 'permanent'
  durationValue.value = 1
  durationUnit.value = 'days'
  formRef.value?.reset()
}

// Reset form when dialog closes
watch(dialogOpen, (open) => {
  if (!open) {
    resetForm()
  }
})
</script>
