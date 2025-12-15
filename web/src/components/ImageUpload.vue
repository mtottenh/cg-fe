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
        <v-img
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

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  modelValue?: string | null
  placeholder?: string
  placeholderIcon?: string
  shape?: 'square' | 'circle' | 'banner'
  aspectRatio?: number
  maxSize?: number // in MB
  accept?: string
  uploadEndpoint: string
  removable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  placeholder: 'Click or drag to upload',
  placeholderIcon: 'mdi-image-plus',
  shape: 'square',
  aspectRatio: 1,
  maxSize: 5,
  accept: 'image/jpeg,image/png,image/webp',
  removable: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
  (e: 'upload-start'): void
  (e: 'upload-complete', url: string): void
  (e: 'upload-error', error: string): void
  (e: 'remove'): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const errorMessage = ref<string | null>(null)
const localPreview = ref<string | null>(null)

const previewUrl = computed(() => localPreview.value || props.modelValue)

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
  await uploadFile(file)
}

async function uploadFile(file: File) {
  uploading.value = true
  uploadProgress.value = 0
  emit('upload-start')

  try {
    const formData = new FormData()
    formData.append('file', file)

    // Get auth token from localStorage (following the store pattern)
    const token = localStorage.getItem('token')

    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        uploadProgress.value = Math.round((e.loaded / e.total) * 100)
      }
    })

    await new Promise<void>((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText)
            const url = response.data?.url || response.url
            emit('update:modelValue', url)
            emit('upload-complete', url)
            localPreview.value = null
            resolve()
          } catch {
            reject(new Error('Invalid response format'))
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            reject(new Error(error.detail || error.message || 'Upload failed'))
          } catch {
            reject(new Error('Upload failed'))
          }
        }
      }

      xhr.onerror = () => reject(new Error('Network error'))
      xhr.ontimeout = () => reject(new Error('Upload timed out'))

      xhr.open('POST', props.uploadEndpoint)
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }
      xhr.send(formData)
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upload failed'
    errorMessage.value = message
    emit('upload-error', message)
    localPreview.value = null
  } finally {
    uploading.value = false
    uploadProgress.value = 0
  }
}

function handleRemove() {
  localPreview.value = null
  emit('update:modelValue', null)
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
