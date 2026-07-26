<template>
  <div>
    <!--
      P-136: `:match-id` was missing here, and `matchId` was an OPTIONAL prop on
      `EvidenceDisplay` that gated the entire Actions column and `getAccessUrl`.
      So on the admin match-detail Evidence tab — the surface a dispute is
      resolved from — an admin could not open or download a single piece of
      evidence, and nothing reported a failure because nothing was rendered.
      The prop is required now, so this can only be forgotten again by failing
      to compile.
    -->
    <EvidenceDisplay
      v-if="matchId"
      :match-id="matchId"
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
          aria-label="Link Type"
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

/**
 * P-158: one gesture, one meaning.
 *
 * This used to call `demosStore.unlinkFromMatch`, i.e.
 * `DELETE /v1/admin/demos/{demo_id}/link/{match_id}`, which removes only the
 * `demo_match_link`. The participant-facing Unlink on the same component
 * (`DemoBrowser`, `ResultSubmissionPanel`) calls `unlinkDemoEvidence`, which
 * removes the evidence row too. So the identical button, rendered by the
 * identical component, did two different things depending on who was looking at
 * it — and the admin's version left the demo listed in the Evidence Records
 * table directly beneath it, with nothing on screen saying why. An admin
 * resolving a dispute has to be able to predict what a button does.
 *
 * Both now go through `unlinkDemoEvidence`. The API keeps the two rows together
 * from either direction (the admin link-delete route removes the paired
 * evidence row as well), so the surfaces cannot drift apart again by accident.
 */
async function handleUnlinkDemo(demoLinkId: string) {
  if (!props.matchId) return
  try {
    await evidenceStore.unlinkDemoEvidence(props.matchId, demoLinkId)
    snackbar.show('Demo unlinked', 'success')
    await Promise.all([
      evidenceStore.fetchLinkedDemos(props.matchId),
      evidenceStore.fetchEvidence(props.matchId),
    ])
  } catch {
    snackbar.show(evidenceStore.unlinkDemoState.error || 'Failed to unlink demo', 'error')
  }
}
</script>
