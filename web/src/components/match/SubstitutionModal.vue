<template>
  <v-dialog v-model="open" max-width="560" persistent>
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Substitute Player</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <p class="text-body-2 mb-4">
          The outgoing player is kicked from the server; the substitute connects with the
          same details and readies up. Between maps this applies instantly — mid-map it
          applies at the next round (or after halftime).
        </p>

        <v-select
          v-model="playerOut"
          aria-label="Player out"
          label="Player out"
          :items="activeItems"
          item-title="label"
          item-value="value"
          variant="outlined"
          density="comfortable"
          class="mb-2"
        />

        <v-select
          v-model="playerIn"
          aria-label="Substitute in"
          label="Substitute in"
          :items="benchItems"
          item-title="label"
          item-value="value"
          :disabled="shortHanded"
          variant="outlined"
          density="comfortable"
          hint="Only rostered players with a linked Steam ID"
          persistent-hint
          class="mb-2"
        />

        <v-checkbox
          v-model="shortHanded"
          label="Play short-handed (no substitute)"
          density="compact"
          hide-details
        />
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="store.substitutionState.loading"
          :disabled="!playerOut || (!playerIn && !shortHanded)"
          @click="submit"
        >
          Request Substitution
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi } from '@/stores/helpers'
import { useMatchServerStore } from '@/stores/matchServer'

type OptionsSide = components['schemas']['SubstitutionOptionsSide']

const props = defineProps<{
  matchId: string
}>()

const emit = defineEmits<{
  requested: []
}>()

const open = defineModel<boolean>({ required: true })

const store = useMatchServerStore()
const sides = ref<OptionsSide[]>([])
const playerOut = ref<string | null>(null)
const playerIn = ref<string | null>(null)
const shortHanded = ref(false)
const error = ref<string | null>(null)

// The side containing the selected outgoing player drives the bench list.
const selectedSide = computed(() =>
  sides.value.find((side) => side.active.some((p) => p.player_id === playerOut.value)),
)

const activeItems = computed(() =>
  sides.value.flatMap((side) =>
    side.active.map((p) => ({
      label: `${p.display_name} (${side.participant_name})`,
      value: p.player_id,
    })),
  ),
)

const benchItems = computed(() =>
  (selectedSide.value?.bench ?? []).map((p) => ({
    label: p.has_steam ? p.display_name : `${p.display_name} — no Steam ID linked`,
    value: p.player_id,
    props: { disabled: !p.has_steam },
  })),
)

watch(open, async (isOpen) => {
  if (!isOpen) return
  error.value = null
  playerOut.value = null
  playerIn.value = null
  shortHanded.value = false
  try {
    const result = await unwrapApi(
      api.GET('/v1/matches/{match_id}/substitutions/options', {
        params: { path: { match_id: props.matchId } },
      }),
    )
    sides.value = result.data
  } catch (e) {
    error.value = e instanceof ApiError ? e.detail : 'Failed to load rosters'
  }
})

watch(playerOut, () => {
  playerIn.value = null
})
watch(shortHanded, (isShort) => {
  if (isShort) playerIn.value = null
})

function close() {
  open.value = false
}

async function submit() {
  if (!playerOut.value) return
  error.value = null
  try {
    await store.createSubstitution(props.matchId, playerOut.value, playerIn.value)
    emit('requested')
    open.value = false
  } catch (e) {
    error.value = e instanceof ApiError ? e.detail : 'Failed to request the substitution'
  }
}
</script>
