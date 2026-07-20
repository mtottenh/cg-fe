<template>
  <v-card variant="outlined" class="evidence-attachment-panel">
    <v-card-title class="text-subtitle-1 d-flex align-center">
      <v-icon start size="small">mdi-paperclip</v-icon>
      Attach Evidence
      <span class="text-caption text-medium-emphasis ml-2">(recommended)</span>
    </v-card-title>

    <v-card-text>
      <!-- Tab selector for evidence types -->
      <EvidenceTypeSelector
        v-model="activeTab"
        :link-enabled="true"
        :demo-enabled="true"
        :browse-enabled="true"
      />

      <!-- Tab content -->
      <div class="tab-content mt-4">
        <!-- Upload Screenshot -->
        <div v-if="activeTab === 'upload'">
          <EvidenceUploadZone
            accept="image/*"
            :max-size="10 * 1024 * 1024"
            @file-selected="handleUploadFile"
            @error="handleError"
          />
        </div>

        <!-- Link URL -->
        <div v-else-if="activeTab === 'link'">
          <v-form @submit.prevent="handleLinkSubmit">
            <v-text-field
              v-model="linkForm.name"
              label="Name"
              placeholder="e.g. Match VOD"
              density="compact"
              variant="outlined"
              :rules="[v => !!v || 'Name is required']"
              class="mb-2"
            />
            <v-text-field
              v-model="linkForm.url"
              label="URL"
              placeholder="https://youtube.com/watch?v=..."
              density="compact"
              variant="outlined"
              :rules="[v => !!v || 'URL is required']"
              class="mb-2"
            />
            <v-select
              v-model="linkForm.evidenceType"
              :items="[{ title: 'Video', value: 'video' }, { title: 'Link', value: 'link' }]"
              label="Type"
              density="compact"
              variant="outlined"
              class="mb-2"
            />
            <v-btn
              type="submit"
              color="primary"
              size="small"
              :loading="evidenceStore.linkEvidenceState.loading"
              :disabled="!linkForm.name || !linkForm.url"
            >
              Add Link
            </v-btn>
          </v-form>
        </div>

        <!-- Demo Upload -->
        <div v-else-if="activeTab === 'demo'">
          <EvidenceUploadZone
            accept=".dem"
            :max-size="500 * 1024 * 1024"
            @file-selected="handleDemoFile"
            @error="handleError"
          />
        </div>

        <!-- Browse Demos -->
        <div v-else-if="activeTab === 'browse'">
          <DemoBrowser
            :match-id="matchId"
            :match-format="matchFormat"
            @update:demo-link-ids="demoLinkIds = $event; $emit('update:demoLinkIds', $event)"
          />
        </div>
      </div>

      <!-- Upload progress list -->
      <div v-if="uploader.uploads.value.length > 0" class="mt-4">
        <p class="text-subtitle-2 mb-2">Uploads ({{ uploader.uploads.value.length }})</p>
        <div v-for="item in uploader.uploads.value" :key="item.localId" class="upload-item d-flex align-center mb-2">
          <v-icon size="small" class="mr-2" :color="statusColor(item.status)">
            {{ statusIcon(item.status) }}
          </v-icon>
          <div class="flex-grow-1">
            <div class="text-body-2 text-truncate" style="max-width: 200px">{{ item.file.name }}</div>
            <v-progress-linear
              v-if="item.status === 'uploading' || item.status === 'completing'"
              :model-value="item.progress"
              color="primary"
              height="4"
              rounded
            />
            <div v-if="item.error" class="text-caption text-error">{{ item.error }}</div>
          </div>
          <v-btn aria-label="Remove upload" icon variant="text" size="x-small" @click="uploader.removeUpload(item.localId)">
            <v-icon size="small">mdi-close</v-icon>
          </v-btn>
        </div>
      </div>

      <!-- Linked evidence items -->
      <div v-if="linkedItems.length > 0" class="mt-4">
        <p class="text-subtitle-2 mb-2">Linked ({{ linkedItems.length }})</p>
        <v-chip v-for="item in linkedItems" :key="item.id" size="small" class="mr-1 mb-1" closable @click:close="removeLinkedItem(item.id)">
          {{ item.name }}
        </v-chip>
      </div>

      <!-- Error display -->
      <v-alert v-if="errorMessage" type="error" variant="tonal" closable class="mt-4" @click:close="errorMessage = null">
        {{ errorMessage }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, watch, toRef } from 'vue'
import EvidenceTypeSelector, { type EvidenceTab } from './EvidenceTypeSelector.vue'
import EvidenceUploadZone from './EvidenceUploadZone.vue'
import DemoBrowser from './DemoBrowser.vue'
import { useEvidenceUpload, type UploadStatus } from '@/composables/useEvidenceUpload'
import { useEvidenceStore } from '@/stores/evidence'

const props = withDefaults(defineProps<{
  matchId: string
  matchFormat?: 'bo1' | 'bo3' | 'bo5' | 'bo7'
}>(), {
  matchFormat: 'bo1',
})

const emit = defineEmits<{
  'update:evidenceIds': [ids: string[]]
  'update:demoLinkIds': [ids: string[]]
}>()

const evidenceStore = useEvidenceStore()
const uploader = useEvidenceUpload(toRef(props, 'matchId'))

const activeTab = ref<EvidenceTab>('upload')
const demoLinkIds = ref<string[]>([])
const errorMessage = ref<string | null>(null)

// Linked evidence from the link tab
const linkedItems = ref<{ id: string; name: string }[]>([])

const linkForm = ref({
  name: '',
  url: '',
  evidenceType: 'video' as string,
})

function handleUploadFile(file: File) {
  uploader.uploadFile(file, 'screenshot')
}

function handleDemoFile(file: File) {
  uploader.uploadFile(file, 'demo')
}

async function handleLinkSubmit() {
  try {
    const result = await evidenceStore.linkEvidence(props.matchId, {
      name: linkForm.value.name,
      url: linkForm.value.url,
      evidence_type: linkForm.value.evidenceType,
    })
    linkedItems.value.push({ id: result.id, name: linkForm.value.name })
    linkForm.value = { name: '', url: '', evidenceType: 'video' }
  } catch {
    errorMessage.value = 'Failed to add link'
  }
}

function removeLinkedItem(id: string) {
  linkedItems.value = linkedItems.value.filter((i) => i.id !== id)
  emitIds()
}

function handleError(message: string) {
  errorMessage.value = message
}

function statusIcon(status: UploadStatus) {
  switch (status) {
    case 'uploading':
    case 'completing':
      return 'mdi-upload'
    case 'complete':
      return 'mdi-check-circle'
    case 'error':
      return 'mdi-alert-circle'
  }
}

function statusColor(status: UploadStatus) {
  switch (status) {
    case 'uploading':
    case 'completing':
      return 'primary'
    case 'complete':
      return 'success'
    case 'error':
      return 'error'
  }
}

function emitIds() {
  const ids = [
    ...uploader.completedEvidenceIds.value,
    ...linkedItems.value.map((i) => i.id),
  ]
  emit('update:evidenceIds', ids)
}

// Emit evidence IDs whenever uploads complete or linked items change
watch(
  [() => uploader.completedEvidenceIds.value, () => linkedItems.value],
  () => emitIds(),
  { deep: true }
)
</script>

<style scoped>
.evidence-attachment-panel {
  background: transparent;
}
</style>
