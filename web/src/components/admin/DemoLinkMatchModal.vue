<template>
  <v-dialog v-model="open" max-width="500" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-link-plus</v-icon>
        Link Demo to Match
        <v-spacer />
        <v-btn aria-label="Close" icon variant="text" size="small" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <v-text-field
          v-model="matchId"
          label="Match ID *"
          variant="outlined"
          density="compact"
          class="mb-3"
          placeholder="UUID of the tournament match"
          :rules="[v => !!v || 'Match ID is required']"
        />

        <v-select
          v-model="linkType"
          :items="linkTypeOptions"
          label="Link Type"
          variant="outlined"
          density="compact"
          class="mb-3"
        />

        <v-text-field
          v-model.number="gameNumber"
          label="Game Number"
          variant="outlined"
          density="compact"
          type="number"
          hint="Game number within a best-of series (optional)"
          persistent-hint
        />

        <v-alert v-if="errorMsg" type="error" density="compact" class="mt-3" closable @click:close="errorMsg = null">
          {{ errorMsg }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="submitting"
          :disabled="!matchId"
          @click="submit"
        >
          Link
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDemosStore } from '@/stores/demos'

const props = defineProps<{  demoId: string
}>()
const emit = defineEmits<{  'linked': []
}>()

const open = defineModel<boolean>({ required: true })

const demosStore = useDemosStore()

const matchId = ref('')
const linkType = ref('manual')
const gameNumber = ref<number | null>(null)
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

const linkTypeOptions = [
  { title: 'Manual', value: 'manual' },
  { title: 'Auto Matched', value: 'auto_matched' },
  { title: 'Evidence', value: 'evidence' },
]

watch(open, (open) => {
  if (open) {
    matchId.value = ''
    linkType.value = 'manual'
    gameNumber.value = null
    errorMsg.value = null
  }
})

async function submit() {
  submitting.value = true
  errorMsg.value = null

  try {
    await demosStore.linkToMatch(props.demoId, {
      match_id: matchId.value,
      link_type: linkType.value,
      game_number: gameNumber.value,
    })
    emit('linked')
    close()
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to link demo'
  } finally {
    submitting.value = false
  }
}

function close() {
  open.value = false
}
</script>
