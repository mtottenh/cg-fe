# Evidence System Implementation (Phase 2 of 3)

## Priority: HIGH (Core Match Experience)

## CRITICAL: Read Architecture Document First

**Before doing ANYTHING, read `00-match-evidence-architecture.md` in this directory.**

This prompt is **Phase 2 of 3** in the Match Result & Evidence flow:
- Phase 1 (prompt 01): Result submission with evidence UI shell ← **MUST BE COMPLETE**
- **Phase 2 (this prompt)**: Full evidence upload/management
- Phase 3 (prompt 06): Demo catalog integration

## Prerequisites Check

**Before starting Phase 2, verify Phase 1 is complete:**
- [ ] `matchResults.ts` store exists and works
- [ ] Evidence shell components exist in `src/components/match/evidence/`
- [ ] Result submission panel includes `EvidenceAttachmentPanel`
- [ ] E2E tests for Phase 1 pass

If Phase 1 is not complete, **STOP** and complete prompt 01 first.

## Overview

Complete the **Evidence System** that was scaffolded in Phase 1. This enables actual file uploads, URL linking, and demo file management. After this phase, evidence attachment will fully work in result submission and disputes.

## IMPORTANT: Think Carefully

You are building on Phase 1's foundation. Consider:
- Existing component interfaces must be preserved
- New functionality extends, doesn't replace, Phase 1 components
- The `update:evidenceIds` emit must now return real IDs after upload
- "Browse Demos" tab stays as placeholder (Phase 3)

## Backend Endpoints to Integrate

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/matches/{match_id}/evidence` | List all evidence for match |
| `POST` | `/v1/matches/{match_id}/evidence/upload` | Upload evidence file (multipart) |
| `POST` | `/v1/matches/{match_id}/evidence/link` | Link external evidence URL |
| `POST` | `/v1/matches/{match_id}/evidence/link-demo` | Link demo to match (Phase 3 will use this) |
| `POST` | `/v1/matches/{match_id}/evidence/validate` | Validate uploaded evidence |
| `GET` | `/v1/matches/{match_id}/evidence/discover` | Discover demos from configured sources |
| `POST` | `/v1/matches/{match_id}/evidence/link-discovered` | Link a discovered demo |
| `GET` | `/v1/matches/{match_id}/evidence/{evidence_id}` | Get specific evidence |
| `DELETE` | `/v1/matches/{match_id}/evidence/{evidence_id}` | Delete evidence |
| `POST` | `/v1/matches/{match_id}/evidence/{evidence_id}/complete` | Mark evidence as complete |
| `GET` | `/v1/matches/{match_id}/evidence/{evidence_id}/access` | Get presigned URL for access |

## Implementation Tasks

### 1. Create Pinia Store: `src/stores/evidence.ts`

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

type EvidenceResponse = components['schemas']['EvidenceResponse']
type LinkEvidenceRequest = components['schemas']['LinkEvidenceRequest']
type ApiErrorResponse = components['schemas']['ApiError']

export type EvidenceType = 'screenshot' | 'external_link' | 'demo' | 'other'

export interface PendingUpload {
  localId: string
  file: File
  type: EvidenceType
  progress: number
  status: 'pending' | 'uploading' | 'complete' | 'error'
  error?: string
  evidenceId?: string // Set after upload completes
}

export const useEvidenceStore = defineStore('evidence', () => {
  // State
  const matchEvidence = ref<EvidenceResponse[]>([])
  const pendingUploads = ref<PendingUpload[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const uploadedEvidenceIds = computed(() =>
    pendingUploads.value
      .filter(u => u.status === 'complete' && u.evidenceId)
      .map(u => u.evidenceId!)
  )

  const hasUploadsInProgress = computed(() =>
    pendingUploads.value.some(u => u.status === 'uploading')
  )

  // Actions
  async function fetchEvidence(matchId: string): Promise<EvidenceResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/matches/{match_id}/evidence', {
        params: { path: { match_id: matchId } },
      })
      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }
      matchEvidence.value = data!.data
      return matchEvidence.value
    } catch (e: unknown) {
      if (e instanceof ApiError) error.value = e.detail
      else error.value = 'Failed to fetch evidence'
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Upload a file as evidence.
   * Updates pendingUploads with progress and final evidenceId.
   */
  async function uploadEvidence(
    matchId: string,
    file: File,
    type: EvidenceType,
    description?: string
  ): Promise<string> {
    const localId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`

    // Add to pending uploads
    pendingUploads.value.push({
      localId,
      file,
      type,
      progress: 0,
      status: 'uploading'
    })

    const upload = pendingUploads.value.find(u => u.localId === localId)!

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)
      if (description) formData.append('description', description)

      // Upload with progress tracking
      const evidenceId = await uploadWithProgress(
        `/v1/matches/${matchId}/evidence/upload`,
        formData,
        (progress) => { upload.progress = progress }
      )

      upload.status = 'complete'
      upload.evidenceId = evidenceId
      upload.progress = 100

      // Refresh evidence list
      await fetchEvidence(matchId)

      return evidenceId
    } catch (e) {
      upload.status = 'error'
      upload.error = e instanceof Error ? e.message : 'Upload failed'
      throw e
    }
  }

  /**
   * Link an external URL as evidence.
   */
  async function linkUrl(
    matchId: string,
    url: string,
    type: EvidenceType,
    description?: string
  ): Promise<string> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/matches/{match_id}/evidence/link', {
        params: { path: { match_id: matchId } },
        body: { url, type, description: description ?? null },
      })
      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      await fetchEvidence(matchId)
      return data!.data.id
    } catch (e: unknown) {
      if (e instanceof ApiError) error.value = e.detail
      else error.value = 'Failed to link evidence'
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Link an existing demo from the catalog as evidence.
   * This is called from the DemoSelector component (Phase 3).
   */
  async function linkDemo(matchId: string, demoId: string): Promise<string> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/matches/{match_id}/evidence/link-demo', {
        params: { path: { match_id: matchId } },
        body: { demo_id: demoId },
      })
      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      await fetchEvidence(matchId)
      return data!.data.id
    } catch (e: unknown) {
      if (e instanceof ApiError) error.value = e.detail
      else error.value = 'Failed to link demo'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteEvidence(matchId: string, evidenceId: string): Promise<void> {
    loading.value = true
    try {
      const { error: apiError } = await api.DELETE('/v1/matches/{match_id}/evidence/{evidence_id}', {
        params: { path: { match_id: matchId, evidence_id: evidenceId } },
      })
      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      // Remove from local state
      matchEvidence.value = matchEvidence.value.filter(e => e.id !== evidenceId)
      pendingUploads.value = pendingUploads.value.filter(u => u.evidenceId !== evidenceId)
    } finally {
      loading.value = false
    }
  }

  async function getAccessUrl(matchId: string, evidenceId: string): Promise<string> {
    const { data, error: apiError } = await api.GET('/v1/matches/{match_id}/evidence/{evidence_id}/access', {
      params: { path: { match_id: matchId, evidence_id: evidenceId } },
    })
    if (apiError) {
      const err = apiError as ApiErrorResponse
      throw new ApiError(err.status, err.detail, err.errors ?? undefined)
    }
    return data!.data.url
  }

  function removePendingUpload(localId: string) {
    pendingUploads.value = pendingUploads.value.filter(u => u.localId !== localId)
  }

  function clearPendingUploads() {
    pendingUploads.value = []
  }

  function clear() {
    matchEvidence.value = []
    pendingUploads.value = []
    loading.value = false
    error.value = null
  }

  function $reset() { clear() }

  return {
    // State
    matchEvidence,
    pendingUploads,
    loading,
    error,
    // Computed
    uploadedEvidenceIds,
    hasUploadsInProgress,
    // Actions
    fetchEvidence,
    uploadEvidence,
    linkUrl,
    linkDemo,
    deleteEvidence,
    getAccessUrl,
    removePendingUpload,
    clearPendingUploads,
    clear,
    $reset,
  }
})

// Helper function for upload with progress
async function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const token = localStorage.getItem('token')

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText)
        resolve(response.data.id)
      } else {
        try {
          const error = JSON.parse(xhr.responseText)
          reject(new Error(error.detail || 'Upload failed'))
        } catch {
          reject(new Error('Upload failed'))
        }
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

    xhr.open('POST', `${import.meta.env.VITE_API_URL || ''}${url}`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  })
}
```

### 2. Update Evidence Components (from Phase 1)

#### Update `src/components/match/evidence/EvidenceAttachmentPanel.vue`

Replace the Phase 1 shell with full functionality:

```vue
<template>
  <v-card variant="outlined" class="evidence-attachment-panel">
    <v-card-title class="text-subtitle-1 d-flex align-center">
      Attach Evidence
      <v-chip v-if="totalAttached > 0" size="small" class="ml-2">
        {{ totalAttached }}
      </v-chip>
    </v-card-title>

    <v-card-text>
      <!-- Tab selector for evidence types -->
      <EvidenceTypeSelector
        v-model="activeTab"
        :link-enabled="true"
        :demo-enabled="true"
        :browse-enabled="false"  <!-- Phase 3 -->
      />

      <!-- Tab content -->
      <div class="tab-content mt-4">
        <!-- Upload Image: Now functional -->
        <div v-if="activeTab === 'upload'">
          <EvidenceUploadZone
            accept="image/*"
            :max-size="10 * 1024 * 1024"
            :uploading="isUploading"
            @file-selected="handleImageUpload"
          />
        </div>

        <!-- Link URL: Now functional -->
        <div v-else-if="activeTab === 'link'">
          <EvidenceLinkForm @submit="handleLinkSubmit" />
        </div>

        <!-- Demo Upload: Now functional -->
        <div v-else-if="activeTab === 'demo'">
          <EvidenceUploadZone
            accept=".dem"
            :max-size="500 * 1024 * 1024"
            :uploading="isUploading"
            @file-selected="handleDemoUpload"
          />
          <p class="text-caption text-grey mt-2">
            Upload CS2 demo files (.dem) up to 500MB
          </p>
        </div>

        <!-- Browse Demos: Placeholder for Phase 3 -->
        <div v-else-if="activeTab === 'browse'">
          <v-alert type="info" variant="tonal">
            <template #prepend>
              <v-icon>mdi-folder-search</v-icon>
            </template>
            Demo browser coming soon. You can upload demo files directly using the "Demo File" tab.
          </v-alert>
        </div>
      </div>

      <!-- Upload progress -->
      <div v-if="pendingUploads.length > 0" class="mt-4">
        <p class="text-subtitle-2 mb-2">Uploading...</p>
        <EvidenceUploadProgress
          v-for="upload in pendingUploads"
          :key="upload.localId"
          :upload="upload"
          @cancel="handleCancelUpload(upload.localId)"
        />
      </div>

      <!-- Attached evidence list -->
      <EvidenceList
        v-if="allEvidence.length > 0"
        :evidence="allEvidence"
        :can-remove="true"
        class="mt-4"
        @remove="handleRemoveEvidence"
        @preview="handlePreview"
      />

      <!-- Error display -->
      <v-alert v-if="error" type="error" variant="tonal" class="mt-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card-text>
  </v-card>

  <!-- Preview modal -->
  <EvidencePreview
    v-model="showPreview"
    :evidence="previewEvidence"
    :match-id="matchId"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useEvidenceStore, type PendingUpload, type EvidenceType } from '@/stores/evidence'
import EvidenceTypeSelector from './EvidenceTypeSelector.vue'
import EvidenceUploadZone from './EvidenceUploadZone.vue'
import EvidenceLinkForm from './EvidenceLinkForm.vue'
import EvidenceUploadProgress from './EvidenceUploadProgress.vue'
import EvidenceList from './EvidenceList.vue'
import EvidencePreview from './EvidencePreview.vue'

const props = defineProps<{
  matchId: string
}>()

const emit = defineEmits<{
  'update:evidenceIds': [ids: string[]]
}>()

const store = useEvidenceStore()

// Local state
const activeTab = ref<'upload' | 'link' | 'demo' | 'browse'>('upload')
const showPreview = ref(false)
const previewEvidence = ref<any>(null)
const error = ref<string | null>(null)

// Computed
const pendingUploads = computed(() =>
  store.pendingUploads.filter(u => u.status === 'uploading' || u.status === 'pending')
)

const isUploading = computed(() => store.hasUploadsInProgress)

const allEvidence = computed(() => {
  // Combine uploaded evidence with completed pending uploads
  const uploaded = store.matchEvidence.map(e => ({
    id: e.id,
    name: e.name || e.filename || 'Evidence',
    type: e.type,
    thumbnailUrl: e.thumbnail_url,
    isUploaded: true
  }))

  const completed = store.pendingUploads
    .filter(u => u.status === 'complete')
    .map(u => ({
      id: u.evidenceId!,
      name: u.file.name,
      type: u.type,
      thumbnailUrl: URL.createObjectURL(u.file),
      isUploaded: true
    }))

  return [...uploaded, ...completed]
})

const totalAttached = computed(() => allEvidence.value.length)

// Watch for evidence changes and emit IDs
watch(
  () => store.uploadedEvidenceIds,
  (ids) => {
    emit('update:evidenceIds', [...store.matchEvidence.map(e => e.id), ...ids])
  },
  { immediate: true }
)

// Actions
async function handleImageUpload(file: File) {
  error.value = null
  try {
    await store.uploadEvidence(props.matchId, file, 'screenshot')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Upload failed'
  }
}

async function handleDemoUpload(file: File) {
  error.value = null
  try {
    await store.uploadEvidence(props.matchId, file, 'demo')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Upload failed'
  }
}

async function handleLinkSubmit(data: { url: string; type: EvidenceType; description?: string }) {
  error.value = null
  try {
    await store.linkUrl(props.matchId, data.url, data.type, data.description)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to link evidence'
  }
}

function handleCancelUpload(localId: string) {
  store.removePendingUpload(localId)
}

async function handleRemoveEvidence(evidenceId: string) {
  try {
    await store.deleteEvidence(props.matchId, evidenceId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remove evidence'
  }
}

function handlePreview(evidence: any) {
  previewEvidence.value = evidence
  showPreview.value = true
}

// Fetch existing evidence on mount
onMounted(async () => {
  try {
    await store.fetchEvidence(props.matchId)
  } catch (e) {
    // Silently fail - might be no evidence yet
  }
})
</script>
```

#### Create `src/components/match/evidence/EvidenceLinkForm.vue`

```vue
<template>
  <v-form @submit.prevent="handleSubmit">
    <v-text-field
      v-model="url"
      label="Evidence URL"
      placeholder="https://..."
      :rules="[rules.required, rules.url]"
      variant="outlined"
      density="compact"
    />

    <v-select
      v-model="type"
      :items="typeOptions"
      label="Evidence Type"
      variant="outlined"
      density="compact"
      class="mt-2"
    />

    <v-text-field
      v-model="description"
      label="Description (optional)"
      placeholder="Brief description of the evidence"
      variant="outlined"
      density="compact"
      class="mt-2"
    />

    <v-btn
      type="submit"
      color="primary"
      :disabled="!isValid"
      class="mt-2"
    >
      Add Link
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EvidenceType } from '@/stores/evidence'

const emit = defineEmits<{
  submit: [data: { url: string; type: EvidenceType; description?: string }]
}>()

const url = ref('')
const type = ref<EvidenceType>('external_link')
const description = ref('')

const typeOptions = [
  { title: 'External Link', value: 'external_link' },
  { title: 'Screenshot', value: 'screenshot' },
  { title: 'Other', value: 'other' },
]

const rules = {
  required: (v: string) => !!v || 'URL is required',
  url: (v: string) => {
    try {
      new URL(v)
      return true
    } catch {
      return 'Must be a valid URL'
    }
  }
}

const isValid = computed(() => {
  try {
    new URL(url.value)
    return true
  } catch {
    return false
  }
})

function handleSubmit() {
  emit('submit', {
    url: url.value,
    type: type.value,
    description: description.value || undefined
  })
  // Reset form
  url.value = ''
  description.value = ''
}
</script>
```

#### Create `src/components/match/evidence/EvidenceUploadProgress.vue`

```vue
<template>
  <v-card variant="outlined" class="upload-progress mb-2">
    <v-card-text class="py-2">
      <div class="d-flex align-center">
        <v-icon class="mr-2" :color="statusColor">{{ statusIcon }}</v-icon>
        <span class="text-body-2 flex-grow-1 text-truncate">{{ upload.file.name }}</span>
        <v-btn
          v-if="upload.status === 'uploading'"
          icon="mdi-close"
          size="x-small"
          variant="text"
          @click="$emit('cancel')"
        />
      </div>

      <v-progress-linear
        v-if="upload.status === 'uploading'"
        :model-value="upload.progress"
        color="primary"
        class="mt-2"
      />

      <p v-if="upload.status === 'error'" class="text-error text-caption mt-1">
        {{ upload.error }}
      </p>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PendingUpload } from '@/stores/evidence'

const props = defineProps<{
  upload: PendingUpload
}>()

defineEmits<{
  cancel: []
}>()

const statusColor = computed(() => {
  switch (props.upload.status) {
    case 'uploading': return 'primary'
    case 'complete': return 'success'
    case 'error': return 'error'
    default: return 'grey'
  }
})

const statusIcon = computed(() => {
  switch (props.upload.status) {
    case 'uploading': return 'mdi-upload'
    case 'complete': return 'mdi-check-circle'
    case 'error': return 'mdi-alert-circle'
    default: return 'mdi-clock'
  }
})
</script>
```

#### Update `src/components/match/evidence/EvidenceUploadZone.vue`

Add max size and uploading state:

```vue
<template>
  <div
    class="upload-zone"
    :class="{ 'drag-over': isDragOver, 'disabled': uploading }"
    @dragover.prevent="!uploading && (isDragOver = true)"
    @dragleave="isDragOver = false"
    @drop.prevent="handleDrop"
    @click="!uploading && triggerFileInput()"
  >
    <v-progress-circular v-if="uploading" indeterminate color="primary" />
    <template v-else>
      <v-icon size="48" color="grey">mdi-cloud-upload</v-icon>
      <p class="mt-2">Drag & drop {{ acceptLabel }} here</p>
      <p class="text-caption">or click to browse</p>
      <p v-if="maxSize" class="text-caption text-grey">
        Max file size: {{ formatSize(maxSize) }}
      </p>
    </template>

    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      hidden
      @change="handleFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  accept?: string
  maxSize?: number
  uploading?: boolean
}>()

const emit = defineEmits<{
  'file-selected': [file: File]
}>()

const fileInput = ref<HTMLInputElement>()
const isDragOver = ref(false)

const acceptLabel = computed(() => {
  if (props.accept?.includes('image')) return 'images'
  if (props.accept?.includes('.dem')) return 'demo files'
  return 'files'
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function triggerFileInput() {
  fileInput.value?.click()
}

function validateAndEmit(file: File) {
  if (props.maxSize && file.size > props.maxSize) {
    alert(`File too large. Maximum size is ${formatSize(props.maxSize)}`)
    return
  }
  emit('file-selected', file)
}

function handleDrop(e: DragEvent) {
  isDragOver.value = false
  if (props.uploading) return
  const file = e.dataTransfer?.files[0]
  if (file) validateAndEmit(file)
}

function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) validateAndEmit(file)
  // Reset input so same file can be selected again
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<style scoped>
.upload-zone {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.upload-zone:hover:not(.disabled), .upload-zone.drag-over {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.05);
}
.upload-zone.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
```

#### Create `src/components/match/evidence/EvidencePreview.vue`

```vue
<template>
  <v-dialog v-model="modelValue" max-width="800">
    <v-card v-if="evidence">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title>{{ evidence.name }}</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="modelValue = false" />
      </v-toolbar>

      <v-card-text class="pa-0">
        <!-- Image preview -->
        <img
          v-if="evidence.type === 'screenshot'"
          :src="previewUrl"
          class="preview-image"
          @error="handleImageError"
        />

        <!-- Demo info -->
        <div v-else-if="evidence.type === 'demo'" class="pa-4">
          <v-icon size="64" color="grey" class="mb-4">mdi-file-video</v-icon>
          <p class="text-h6">{{ evidence.name }}</p>
          <p class="text-caption">Demo file</p>
        </div>

        <!-- External link -->
        <div v-else-if="evidence.type === 'external_link'" class="pa-4">
          <v-icon size="64" color="grey" class="mb-4">mdi-link</v-icon>
          <p class="text-h6">External Link</p>
          <v-btn :href="evidence.url" target="_blank" color="primary">
            Open Link
          </v-btn>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-btn v-if="evidence.type !== 'external_link'" @click="handleDownload">
          <v-icon start>mdi-download</v-icon>
          Download
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="modelValue = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useEvidenceStore } from '@/stores/evidence'

const props = defineProps<{
  evidence: any
  matchId: string
}>()

const modelValue = defineModel<boolean>()
const store = useEvidenceStore()
const previewUrl = ref('')

watch(() => props.evidence, async (evidence) => {
  if (evidence && evidence.type === 'screenshot') {
    try {
      previewUrl.value = await store.getAccessUrl(props.matchId, evidence.id)
    } catch {
      previewUrl.value = evidence.thumbnailUrl || ''
    }
  }
}, { immediate: true })

function handleImageError() {
  previewUrl.value = '/placeholder-image.png'
}

async function handleDownload() {
  const url = await store.getAccessUrl(props.matchId, props.evidence.id)
  window.open(url, '_blank')
}
</script>

<style scoped>
.preview-image {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
}
</style>
```

### 3. Add Evidence Tab to Match Detail Page

Update `src/pages/tournaments/MatchDetailPage.vue` to include an Evidence tab:

```vue
<!-- Add to tabs -->
<v-tab value="evidence">
  <v-icon start>mdi-file-multiple</v-icon>
  Evidence
  <v-chip v-if="evidenceCount > 0" size="x-small" class="ml-2">
    {{ evidenceCount }}
  </v-chip>
</v-tab>

<!-- Add tab content -->
<v-tab-item value="evidence">
  <EvidenceGallery :match-id="matchId" />
</v-tab-item>
```

#### Create `src/components/match/evidence/EvidenceGallery.vue`

```vue
<template>
  <v-container>
    <v-row v-if="loading">
      <v-col cols="12" class="text-center">
        <v-progress-circular indeterminate />
      </v-col>
    </v-row>

    <v-row v-else-if="evidence.length === 0">
      <v-col cols="12">
        <v-alert type="info" variant="tonal">
          No evidence has been attached to this match yet.
        </v-alert>
      </v-col>
    </v-row>

    <v-row v-else>
      <v-col
        v-for="item in evidence"
        :key="item.id"
        cols="12"
        sm="6"
        md="4"
        lg="3"
      >
        <EvidenceCard
          :evidence="item"
          :can-remove="canManage"
          @preview="handlePreview"
          @remove="handleRemove"
        />
      </v-col>
    </v-row>

    <EvidencePreview
      v-model="showPreview"
      :evidence="previewEvidence"
      :match-id="matchId"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useEvidenceStore } from '@/stores/evidence'
import { useAuthStore } from '@/stores/auth'
import EvidenceCard from './EvidenceCard.vue'
import EvidencePreview from './EvidencePreview.vue'

const props = defineProps<{
  matchId: string
}>()

const evidenceStore = useEvidenceStore()
const authStore = useAuthStore()

const showPreview = ref(false)
const previewEvidence = ref<any>(null)

const loading = computed(() => evidenceStore.loading)
const evidence = computed(() => evidenceStore.matchEvidence)
const canManage = computed(() => {
  // Check if current user is admin or participant
  return authStore.isAdmin // Simplified - expand as needed
})

function handlePreview(item: any) {
  previewEvidence.value = item
  showPreview.value = true
}

async function handleRemove(evidenceId: string) {
  if (confirm('Remove this evidence?')) {
    await evidenceStore.deleteEvidence(props.matchId, evidenceId)
  }
}

onMounted(() => {
  evidenceStore.fetchEvidence(props.matchId)
})
</script>
```

### 4. E2E Tests: `e2e/evidence.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './fixtures/auth.fixture'
import path from 'path'

test.describe('Evidence System (Phase 2)', () => {
  test.describe('Evidence Upload', () => {
    test('should upload screenshot via file picker', async ({ page }) => {
      await loginAsAdmin(page)
      // Navigate to match with result submission
      // Select file, verify upload completes
    })

    test('should show upload progress', async ({ page }) => {
      await loginAsAdmin(page)
      // Start upload, verify progress indicator visible
    })

    test('should validate file type', async ({ page }) => {
      await loginAsAdmin(page)
      // Try to upload wrong type, verify rejection
    })

    test('should enforce file size limit', async ({ page }) => {
      await loginAsAdmin(page)
      // Try large file, verify rejection
    })

    test('uploaded evidence appears in list', async ({ page }) => {
      await loginAsAdmin(page)
      // Upload file, verify appears in evidence list
    })
  })

  test.describe('External Links', () => {
    test('should add external evidence link', async ({ page }) => {
      await loginAsAdmin(page)
      // Switch to Link tab, enter URL, submit
    })

    test('should validate URL format', async ({ page }) => {
      await loginAsAdmin(page)
      // Enter invalid URL, verify validation error
    })
  })

  test.describe('Demo Upload', () => {
    test('should accept .dem files', async ({ page }) => {
      await loginAsAdmin(page)
      // Switch to Demo tab, verify accepts .dem
    })

    test('should allow large demo files', async ({ page }) => {
      await loginAsAdmin(page)
      // Upload demo, verify 500MB limit shown
    })
  })

  test.describe('Evidence Gallery', () => {
    test('should display evidence in Evidence tab', async ({ page }) => {
      await loginAsAdmin(page)
      // Navigate to Evidence tab, verify evidence displayed
    })

    test('should preview evidence on click', async ({ page }) => {
      await loginAsAdmin(page)
      // Click evidence, verify preview modal
    })

    test('should download evidence', async ({ page }) => {
      await loginAsAdmin(page)
      // Click download, verify download starts
    })
  })

  test.describe('Evidence in Results (Integration)', () => {
    test('evidence IDs should be passed to result submission', async ({ page }) => {
      await loginAsAdmin(page)
      // Upload evidence, submit result
      // Verify evidence linked to result
    })

    test('opponent should see evidence when confirming', async ({ page }) => {
      await loginAsAdmin(page)
      // As opponent, view submitted result
      // Verify evidence is visible
    })
  })

  test.describe('Browse Demos (Placeholder)', () => {
    test('should show coming soon for Browse Demos tab', async ({ page }) => {
      await loginAsAdmin(page)
      // Click Browse Demos, verify placeholder shown
    })
  })
})
```

## File Structure (Phase 2 Additions)

```
src/
├── stores/
│   └── evidence.ts                        # NEW
├── components/
│   └── match/
│       └── evidence/
│           ├── EvidenceAttachmentPanel.vue  # UPDATED
│           ├── EvidenceTypeSelector.vue     # From Phase 1
│           ├── EvidenceUploadZone.vue       # UPDATED
│           ├── EvidenceList.vue             # From Phase 1
│           ├── EvidenceCard.vue             # UPDATED
│           ├── EvidenceLinkForm.vue         # NEW
│           ├── EvidenceUploadProgress.vue   # NEW
│           ├── EvidencePreview.vue          # NEW
│           └── EvidenceGallery.vue          # NEW
└── pages/
    └── tournaments/
        └── MatchDetailPage.vue              # UPDATED (add Evidence tab)
e2e/
└── evidence.spec.ts                         # NEW
```

## Phase 2 Completion Checklist

- [ ] Phase 1 is complete and tests pass
- [ ] `evidence.ts` store created with all methods
- [ ] `EvidenceAttachmentPanel.vue` updated with real upload functionality
- [ ] Link URL tab works
- [ ] Demo File upload tab works
- [ ] Browse Demos tab shows placeholder (Phase 3)
- [ ] Evidence tab added to match detail page
- [ ] Evidence preview works
- [ ] Evidence IDs properly passed to result submission
- [ ] E2E tests pass
- [ ] No TypeScript errors
- [ ] Build succeeds

## What Phase 3 Will Add

Phase 3 (Demo Catalog) will:
1. Create `demos.ts` store
2. Create `DemoSelector.vue` component
3. Enable "Browse Demos" tab in `EvidenceAttachmentPanel`
4. Create standalone demo catalog pages
5. Link demos to matches as evidence

**The "Browse Demos" tab must remain a placeholder until Phase 3.**
