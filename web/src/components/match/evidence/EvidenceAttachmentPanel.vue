<template>
  <v-card variant="outlined" class="evidence-attachment-panel">
    <v-card-title class="text-subtitle-1 d-flex align-center">
      <v-icon start size="small">mdi-paperclip</v-icon>
      Attach Evidence
      <span class="text-caption text-grey ml-2">(recommended)</span>
    </v-card-title>

    <v-card-text>
      <!-- Tab selector for evidence types -->
      <EvidenceTypeSelector
        v-model="activeTab"
        :link-enabled="false"
        :demo-enabled="false"
        :browse-enabled="false"
      />

      <!-- Tab content -->
      <div class="tab-content mt-4">
        <!-- Upload Image: Basic UI now, full functionality in Phase 2 -->
        <div v-if="activeTab === 'upload'">
          <EvidenceUploadZone
            accept="image/*"
            :max-size="10 * 1024 * 1024"
            @file-selected="handleFileSelected"
            @error="handleError"
          />
          <p class="text-caption text-grey mt-2">
            Evidence upload will be available soon. Files selected here will be shown but not
            uploaded.
          </p>
        </div>

        <!-- Link URL: Placeholder for Phase 2 -->
        <div v-else-if="activeTab === 'link'">
          <v-alert type="info" variant="tonal">
            External link attachment coming in Phase 2.
          </v-alert>
        </div>

        <!-- Demo Upload: Placeholder for Phase 2 -->
        <div v-else-if="activeTab === 'demo'">
          <v-alert type="info" variant="tonal">
            Demo file upload coming in Phase 2.
          </v-alert>
        </div>

        <!-- Browse Demos: Placeholder for Phase 3 -->
        <div v-else-if="activeTab === 'browse'">
          <v-alert type="info" variant="tonal"> Demo browser coming in Phase 3. </v-alert>
        </div>
      </div>

      <!-- Attached evidence list (local only in Phase 1) -->
      <EvidenceList
        v-if="localEvidence.length > 0"
        :evidence="localEvidence"
        class="mt-4"
        @remove="removeEvidence"
      />

      <!-- Error display -->
      <v-alert v-if="errorMessage" type="error" variant="tonal" closable class="mt-4" @click:close="errorMessage = null">
        {{ errorMessage }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import EvidenceTypeSelector, { type EvidenceTab } from './EvidenceTypeSelector.vue'
import EvidenceUploadZone from './EvidenceUploadZone.vue'
import EvidenceList from './EvidenceList.vue'
import type { LocalEvidence } from './EvidenceCard.vue'

/**
 * Evidence attachment panel for result submission and disputes.
 *
 * Phase 1: UI shell only, files stored locally but not uploaded.
 * Phase 2: Full upload functionality, actual evidence IDs emitted.
 * Phase 3: Demo browser integration.
 */

defineProps<{
  matchId: string
}>()

// Emits - ready for Phase 2 integration
const emit = defineEmits<{
  'update:evidenceIds': [ids: string[]]
}>()

// Local state (Phase 1: no actual uploads)
const activeTab = ref<EvidenceTab>('upload')
const localEvidence = ref<LocalEvidence[]>([])
const errorMessage = ref<string | null>(null)

function handleFileSelected(file: File) {
  // Phase 1: Store locally only, show in list
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // Create object URL for preview
  const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined

  localEvidence.value.push({
    localId,
    name: file.name,
    type: 'image',
    preview,
    status: 'pending', // Phase 1: stays pending
  })

  // Phase 1: Emit empty array (no real evidence IDs yet)
  // Phase 2 will emit actual evidence IDs after upload
  emit('update:evidenceIds', [])
}

function removeEvidence(localId: string) {
  const item = localEvidence.value.find((e) => e.localId === localId)
  if (item?.preview) {
    URL.revokeObjectURL(item.preview)
  }
  localEvidence.value = localEvidence.value.filter((e) => e.localId !== localId)
  emit('update:evidenceIds', [])
}

function handleError(message: string) {
  errorMessage.value = message
}

// Cleanup object URLs when component unmounts
watch(
  () => localEvidence.value,
  (_, oldVal) => {
    // This is a simple cleanup - in Phase 2 we'll need more sophisticated management
  },
  { deep: true }
)
</script>

<style scoped>
.evidence-attachment-panel {
  background: transparent;
}
</style>
