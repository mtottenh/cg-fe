<template>
  <v-card variant="outlined" class="mt-4" data-testid="game-server-settings-card">
    <v-card-title class="text-subtitle-1">
      <v-icon class="mr-2">mdi-server-network</v-icon>
      Game server
    </v-card-title>
    <v-card-text>
      <v-switch
        v-model="form.enabled"
        color="primary"
        density="compact"
        hide-details
        label="Use the portal's game server for matches"
        aria-label="Use the portal's game server for matches"
        data-testid="game-server-enabled"
      />
      <p class="text-caption text-medium-emphasis mb-3">
        When on, a server is reserved and the match loaded onto it as soon as
        the veto finishes, and the result is reported by the server.
      </p>
      <v-text-field
        v-model="autoConfirmInput"
        type="number"
        min="1"
        label="Auto-confirm server results after (minutes)"
        aria-label="Auto-confirm server results after N minutes"
        placeholder="10"
        persistent-placeholder
        hint="How long teams have to dispute a result the server reported. Blank = 10."
        persistent-hint
        variant="outlined"
        density="compact"
        class="mb-3"
        :disabled="!form.enabled"
        :error-messages="autoConfirmError"
        data-testid="game-server-auto-confirm"
      />
      <v-text-field
        v-model="minReadyInput"
        type="number"
        min="1"
        label="Players needed to ready up"
        aria-label="Players needed to ready up"
        :placeholder="teamSize ? String(teamSize) : ''"
        persistent-placeholder
        hint="Per team, before the match goes live. Blank = the full team. Lower it for a team playing short-handed."
        persistent-hint
        variant="outlined"
        density="compact"
        class="mb-3"
        :disabled="!form.enabled"
        :error-messages="minReadyError"
        data-testid="game-server-min-ready"
      />
      <v-btn
        color="primary"
        :disabled="!dirty || !valid"
        :loading="saving"
        data-testid="game-server-settings-save"
        @click="save"
      >
        Save
      </v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useTournamentsStore, type TournamentResponse } from '@/stores/tournaments'
import {
  mergeGameServerSettings, readGameServerSettings, type GameServerSettingsForm,
} from '@/utils/matchRescue'

const props = defineProps<{
  tournament: TournamentResponse
}>()

const tournamentsStore = useTournamentsStore()
const feedback = useActionFeedback()

const form = reactive<GameServerSettingsForm>({ enabled: false, autoConfirmMinutes: null, minPlayersToReady: null })
const autoConfirmInput = ref('')
const minReadyInput = ref('')
const saving = ref(false)

const stored = computed(() => readGameServerSettings(props.tournament.settings))
const teamSize = computed(() => props.tournament.team_size ?? null)

function load() {
  form.enabled = stored.value.enabled
  autoConfirmInput.value = stored.value.autoConfirmMinutes?.toString() ?? ''
  minReadyInput.value = stored.value.minPlayersToReady?.toString() ?? ''
}
watch(() => [props.tournament.id, props.tournament.settings], load, { immediate: true, deep: true })

/** Blank → null (backend default); otherwise a whole number of at least 1. */
function parseCount(raw: string | number): number | null | 'invalid' {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const value = Number(text)
  return Number.isInteger(value) && value >= 1 ? value : 'invalid'
}

const autoConfirm = computed(() => parseCount(autoConfirmInput.value))
const minReady = computed(() => parseCount(minReadyInput.value))

const autoConfirmError = computed(() =>
  autoConfirm.value === 'invalid' ? ['Enter a whole number of minutes, or leave blank'] : [],
)
const minReadyError = computed(() => {
  if (minReady.value === 'invalid') return ['Enter a whole number of players, or leave blank']
  if (typeof minReady.value === 'number' && teamSize.value && minReady.value > teamSize.value) {
    return [`A team has ${teamSize.value} players`]
  }
  return []
})
const valid = computed(() => autoConfirmError.value.length === 0 && minReadyError.value.length === 0)

const current = computed<GameServerSettingsForm>(() => ({
  enabled: form.enabled,
  autoConfirmMinutes: autoConfirm.value === 'invalid' ? null : autoConfirm.value,
  minPlayersToReady: minReady.value === 'invalid' ? null : minReady.value,
}))

const dirty = computed(() =>
  current.value.enabled !== stored.value.enabled
  || current.value.autoConfirmMinutes !== stored.value.autoConfirmMinutes
  || current.value.minPlayersToReady !== stored.value.minPlayersToReady,
)

async function save() {
  if (!dirty.value || !valid.value) return
  saving.value = true
  try {
    // Settings only, so the save is accepted on a tournament that has started.
    await feedback.run(
      () => tournamentsStore.updateTournament(props.tournament.id, {
        settings: mergeGameServerSettings(props.tournament.settings, current.value),
      }),
      {
        success: 'Game server settings saved',
        failureFallback: 'Failed to save the game server settings',
        errorSource: tournamentsStore.updateTournamentState,
      },
    )
  } finally {
    saving.value = false
  }
}
</script>
