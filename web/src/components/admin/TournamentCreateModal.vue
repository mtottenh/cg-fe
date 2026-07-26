<template>
  <v-dialog
    :fullscreen="smAndDown"
    v-model="open"
    max-width="800"
    persistent
    scrollable
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Create New Tournament</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text style="max-height: 70vh">
        <TournamentForm
          ref="formRef"
          mode="create"
          :games="games"
          :leagues="leagues"
          :seasons="seasons"
        />
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!formRef?.formValid || !formRef?.mapPoolValid"
          @click="save"
        >
          Create Tournament
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { ref, watch, useTemplateRef } from 'vue'
import { useTournamentsStore } from '@/stores/tournaments'
import type { GameSummary } from '@/stores/games'
import TournamentForm from '@/components/tournament/TournamentForm.vue'

// Long scrolling forms in a small floating dialog are unusable on phones.
const { smAndDown } = useDisplay()

interface LeagueSummary {
  id: string
  name: string
  game_id: string
  status: string
}

interface SeasonSummary {
  id: string
  name: string
  league_id: string
  status: string
}

const tournamentsStore = useTournamentsStore()

defineProps<{
  games: GameSummary[]
  leagues?: LeagueSummary[]
  seasons?: SeasonSummary[]
}>()

const emit = defineEmits<{ created: [] }>()
const open = defineModel<boolean>({ required: true })

const formRef = useTemplateRef<InstanceType<typeof TournamentForm>>('formRef')
const saving = ref(false)
const error = ref<string | null>(null)

// Reset the form whenever the dialog opens so a previous session's values
// don't leak into a new tournament draft.
watch(open, (isOpen) => {
  if (isOpen) {
    formRef.value?.reset()
    error.value = null
  }
})

function close() {
  error.value = null
  open.value = false
}

async function save() {
  const form = formRef.value
  // The map pool is part of the create payload now, so it gates submission
  // alongside the field rules.
  if (!form || !form.formValid || !form.mapPoolValid) return

  saving.value = true
  error.value = null

  try {
    // The map pool ships INSIDE the create payload and is persisted with the
    // tournament. It used to be a best-effort PUT afterwards that only ran
    // when the pool was customised, so keeping the default silently created
    // a tournament with no pool at all.
    await tournamentsStore.createTournament(form.buildCreatePayload())

    emit('created')
    close()
  } catch {
    error.value = tournamentsStore.error || 'Failed to create tournament'
  } finally {
    saving.value = false
  }
}
</script>
