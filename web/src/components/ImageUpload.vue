<template>
  <div class="image-upload">
    <v-hover v-slot="{ isHovering, props: hoverProps }">
      <div
        v-bind="hoverProps"
        class="image-container"
        :class="[shapeClass, { 'has-image': previewUrl }]"
        @click="triggerFileInput"
        @dragover.prevent="isDragging = true"
        @dragleave="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <v-img alt="Image preview"
          v-if="previewUrl"
          :src="previewUrl"
          :aspect-ratio="aspectRatio"
          cover
          class="preview-image"
        />
        <div
          v-else
          class="placeholder d-flex flex-column align-center justify-center"
          :style="{ aspectRatio: aspectRatio }"
        >
          <v-icon size="48" color="grey-lighten-1">{{ placeholderIcon }}</v-icon>
          <span class="text-body-2 text-medium-emphasis mt-2">{{ placeholder }}</span>
        </div>

        <v-overlay
          :model-value="isHovering || isDragging"
          contained
          class="align-center justify-center"
          scrim="black"
        >
          <div class="text-center">
            <v-icon size="36" color="white" class="mb-2">
              {{ previewUrl ? 'mdi-camera-flip' : 'mdi-camera-plus' }}
            </v-icon>
            <div class="text-body-2 text-white">
              {{ previewUrl ? 'Change Image' : 'Upload Image' }}
            </div>
          </div>
        </v-overlay>
      </div>
    </v-hover>

    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      class="d-none"
      @change="handleFileSelect"
    />

    <v-progress-linear
      v-if="uploading"
      :model-value="uploadProgress"
      color="primary"
      height="4"
      class="mt-2"
    />

    <v-alert
      v-if="errorMessage"
      type="error"
      density="compact"
      class="mt-2"
      closable
      @click:close="errorMessage = null"
    >
      {{ errorMessage }}
    </v-alert>

    <div v-if="previewUrl && removable" class="mt-2 text-center">
      <v-btn
        size="small"
        variant="text"
        color="error"
        @click.stop="handleRemove"
      >
        <v-icon start>mdi-delete</v-icon>
        Remove
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts" generic="P extends MultipartPath">
import { ref, computed, watch } from 'vue'
import { getAuthToken } from '@/api/client'
import { refreshAccessToken } from '@/api/middleware'
import {
  buildUploadUrl,
  type MultipartPath,
  type PathParamsFor,
} from '@/api/uploadUrl'
import { useFileUpload } from '@/composables/useFileUpload'

interface ImageMeta {
  url: string | null
}

interface Props<Path extends MultipartPath> {
  placeholder?: string
  placeholderIcon?: string
  shape?: 'square' | 'circle' | 'banner'
  aspectRatio?: number
  maxSize?: number // in MB
  accept?: string
  /**
   * OpenAPI-typed path template to POST the upload to. `MultipartPath` is
   * restricted to paths whose POST accepts `multipart/form-data`, so typos
   * or non-upload endpoints are rejected at compile time. Example:
   * `path="/v1/league-teams/{team_id}/logo"`.
   */
  path: Path
  /**
   * Path parameters for `path`. Required when the template contains
   * placeholders (e.g. `{team_id}`); omitted for parameter-less endpoints
   * like `/v1/players/me/avatar`.
   */
  pathParams?: PathParamsFor<Path>
  /**
   * Field on the response body to pluck the uploaded image URL from. The
   * component reads `response.data?.[responseField]` first, then `response.url`.
   * Defaults to `url` to match endpoints returning `UploadResponse`.
   */
  responseField?: string
  removable?: boolean
}

const props = withDefaults(defineProps<Props<P>>(), {
  placeholder: 'Click or drag to upload',
  placeholderIcon: 'mdi-image-plus',
  shape: 'square',
  aspectRatio: 1,
  maxSize: 5,
  accept: 'image/jpeg,image/png,image/webp',
  pathParams: undefined,
  responseField: 'url',
  removable: true,
})

const imageUrl = defineModel<string | null>({ default: null })

const emit = defineEmits<{
  (e: 'upload-start'): void
  (e: 'upload-complete', url: string): void
  (e: 'upload-error', error: string): void
  (e: 'remove'): void
}>()

/** Fully-qualified URL for the configured upload endpoint. */
const endpoint = computed(() => buildUploadUrl(props.path, props.pathParams))

const { uploads, uploadFile: rawUpload, clear } = useFileUpload<ImageMeta>({
  async onUpload(file) {
    const formData = new FormData()
    formData.append('file', file)

    const token = getAuthToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return {
      url: endpoint.value,
      method: 'POST',
      headers,
      body: formData,
    }
  },

  /** Silent-refresh on 401 via the shared refresh promise (dedup'd with any
   *  concurrent openapi-fetch request). Returns true to request a retry. */
  async onUnauthorized() {
    return refreshAccessToken()
  },

  parseResponse(responseText) {
    const response = JSON.parse(responseText)
    const data = response.data || response
    const url = data[props.responseField] || data.url
    return { url }
  },
})

// React to upload state changes
const currentUpload = computed(() => uploads.value[uploads.value.length - 1] ?? null)
const uploading = computed(() => currentUpload.value?.status === 'uploading')
const uploadProgress = computed(() => currentUpload.value?.progress ?? 0)

watch(
  () => currentUpload.value?.status,
  (status) => {
    if (status === 'complete' && currentUpload.value?.meta.url) {
      const url = currentUpload.value.meta.url
      imageUrl.value = url
      emit('upload-complete', url)
      localPreview.value = null
      clear()
    } else if (status === 'error' && currentUpload.value) {
      const message = currentUpload.value.error || 'Upload failed'
      errorMessage.value = message
      emit('upload-error', message)
      localPreview.value = null
      clear()
    }
  },
)

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const errorMessage = ref<string | null>(null)
const localPreview = ref<string | null>(null)

const previewUrl = computed(() => localPreview.value || imageUrl.value)

const shapeClass = computed(() => {
  switch (props.shape) {
    case 'circle':
      return 'rounded-circle'
    case 'banner':
      return 'rounded-lg'
    default:
      return 'rounded-lg'
  }
})

function triggerFileInput() {
  fileInput.value?.click()
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  const file = files?.[0]
  if (file) {
    processFile(file)
  }
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files
  const file = files?.[0]
  if (file) {
    processFile(file)
  }
  // Reset input so same file can be selected again
  target.value = ''
}

function validateFile(file: File): string | null {
  // Check file type
  const allowedTypes = props.accept.split(',').map((t) => t.trim())
  if (!allowedTypes.includes(file.type)) {
    return `Invalid file type. Allowed: ${allowedTypes.join(', ')}`
  }

  // Check file size
  const maxBytes = props.maxSize * 1024 * 1024
  if (file.size > maxBytes) {
    return `File too large. Maximum size: ${props.maxSize}MB`
  }

  return null
}

async function processFile(file: File) {
  errorMessage.value = null

  // Validate file
  const validationError = validateFile(file)
  if (validationError) {
    errorMessage.value = validationError
    emit('upload-error', validationError)
    return
  }

  // Create local preview
  const reader = new FileReader()
  reader.onload = (e) => {
    localPreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)

  // Upload file
  emit('upload-start')
  await rawUpload(file, { url: null })
}

function handleRemove() {
  localPreview.value = null
  imageUrl.value = null
  emit('remove')
}
</script>

<style scoped>
.image-container {
  position: relative;
  cursor: pointer;
  overflow: hidden;
  background-color: rgb(var(--v-theme-surface-variant));
  border: 2px dashed rgb(var(--v-theme-outline));
  transition: border-color 0.2s;
}

.image-container:hover,
.image-container.dragging {
  border-color: rgb(var(--v-theme-primary));
}

.image-container.has-image {
  border-style: solid;
  border-color: transparent;
}

.placeholder {
  width: 100%;
  min-height: 150px;
}

.preview-image {
  width: 100%;
  height: 100%;
}

.rounded-circle .preview-image {
  border-radius: 50%;
}
</style>
