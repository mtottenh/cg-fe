<template>
  <div>
    <EvidenceDisplay
      :linked-demos="linkedDemos"
      :evidence="evidenceRecords"
      :loading="evidenceLoading"
      :detailed="true"
      :show-empty-state="true"
      :editable="true"
      @unlink="handleUnlinkDemo"
    />

    <!-- Link Demo Form -->
    <v-card variant="outlined" class="mt-4">
      <v-card-title class="text-subtitle-1">
        <v-icon class="mr-2">mdi-link-plus</v-icon>
        Link Demo to Match
      </v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" md="5">
            <v-text-field
              v-model="linkDemoId"
              label="Demo ID *"
              variant="outlined"
              density="compact"
              placeholder="UUID of the demo"
              hide-details
            />
          </v-col>
          <v-col cols="6" md="3">
            <v-select
              v-model="linkLinkType"
              :items="linkTypeOptions"
              label="Link Type"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field
              v-model.number="linkGameNumber"
              label="Game #"
              variant="outlined"
              density="compact"
              type="number"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="2" class="d-flex align-center">
            <v-btn
              color="primary"
              :loading="demosStore.linkToMatchState.loading"
              :disabled="!linkDemoId"
              @click="handleLinkDemo"
            >
              Link
            </v-btn>
          </v-col>
        </v-row>
        <v-alert v-if="linkError" type="error" density="compact" class="mt-3" closable @click:close="linkError = null">
          {{ linkError }}
        </v-alert>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEvidenceStore } from '@/stores/evidence'
import { useDemosStore } from '@/stores/demos'
import { useSnackbar } from '@/composables/useSnackbar'
import EvidenceDisplay from '@/components/match/evidence/EvidenceDisplay.vue'

const props = defineProps<{
  matchId: string | null
}>()

const evidenceStore = useEvidenceStore()
const demosStore = useDemosStore()
const snackbar = useSnackbar()

const linkDemoId = ref('')
const linkGameNumber = ref<number | null>(null)
const linkLinkType = ref('manual')
const linkError = ref<string | null>(null)

const linkTypeOptions = [
  { title: 'Manual', value: 'manual' },
  { title: 'Auto Matched', value: 'auto_matched' },
  { title: 'Evidence', value: 'evidence' },
]

const { linkedDemos, evidence: evidenceRecords } = storeToRefs(evidenceStore)
const evidenceLoading = computed(
  () => evidenceStore.fetchLinkedState.loading || evidenceStore.fetchEvidenceState.loading,
)

// Reset link form when the host modal switches matches.
watch(() => props.matchId, () => {
  linkDemoId.value = ''
  linkGameNumber.value = null
  linkLinkType.value = 'manual'
  linkError.value = null
})

async function handleLinkDemo() {
  if (!props.matchId || !linkDemoId.value) return
  linkError.value = null
  try {
    await demosStore.linkToMatch(linkDemoId.value, {
      match_id: props.matchId,
      link_type: linkLinkType.value,
      game_number: linkGameNumber.value,
    })
    snackbar.show('Demo linked to match', 'success')
    linkDemoId.value = ''
    linkGameNumber.value = null
    linkLinkType.value = 'manual'
    await evidenceStore.fetchLinkedDemos(props.matchId)
  } catch (e: unknown) {
    linkError.value = e instanceof Error ? e.message : 'Failed to link demo'
  }
}

async function handleUnlinkDemo(demoId: string) {
  if (!props.matchId) return
  try {
    await demosStore.unlinkFromMatch(demoId, props.matchId)
    snackbar.show('Demo unlinked', 'success')
    await evidenceStore.fetchLinkedDemos(props.matchId)
  } catch {
    snackbar.show('Failed to unlink demo', 'error')
  }
}
</script>
