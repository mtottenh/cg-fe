<template>
  <v-dialog
    v-model="open"
    max-width="800"
    persistent
    scrollable
  >
    <v-card v-if="tournament">
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Edit Tournament</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text style="max-height: 70vh">
        <TournamentForm
          ref="formRef"
          mode="edit"
          :tournament="tournament"
        />
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-chip :color="statusColor" size="small" variant="flat">
          {{ statusLabel }}
        </v-chip>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!formRef?.formValid || !formRef?.hasChanges"
          @click="save"
        >
          Save Changes
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, useTemplateRef } from 'vue'
import {
  useTournamentsStore,
  getStatusColor,
  getStatusLabel,
  type TournamentResponse,
} from '@/stores/tournaments'
import TournamentForm from '@/components/tournament/TournamentForm.vue'

const tournamentsStore = useTournamentsStore()

const props = defineProps<{
  tournament: TournamentResponse | null
}>()

const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>({ required: true })

const formRef = useTemplateRef<InstanceType<typeof TournamentForm>>('formRef')
const saving = ref(false)
const error = ref<string | null>(null)

const statusColor = computed(() =>
  props.tournament ? getStatusColor(props.tournament.status) : 'grey',
)
const statusLabel = computed(() =>
  props.tournament ? getStatusLabel(props.tournament.status) : '',
)

function close() {
  error.value = null
  open.value = false
}

async function save() {
  const form = formRef.value
  if (!props.tournament || !form || !form.formValid) return

  saving.value = true
  error.value = null

  try {
    await tournamentsStore.updateTournament(props.tournament.id, form.buildUpdatePatch())

    // Persist map pool changes when the user actually modified the pool since
    // it was loaded. If the selection went back to the game's default, delete
    // the tournament override so it falls back.
    if (form.mapPoolChangedFromOriginal) {
      if (!form.mapPoolIsCustom) {
        await tournamentsStore.deleteTournamentMapPool(props.tournament.id).catch(() => {})
      } else if (form.selectedMapIds.length > 0) {
        await tournamentsStore.setTournamentMapPool(props.tournament.id, form.selectedMapIds)
      }
    }

    emit('saved')
    close()
  } catch {
    error.value = tournamentsStore.error || 'Failed to update tournament'
  } finally {
    saving.value = false
  }
}
</script>
