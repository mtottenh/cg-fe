<template>
  <div
    class="upload-zone"
    :class="{ 'drag-over': isDragOver, disabled: disabled }"
    @dragover.prevent="handleDragOver"
    @dragleave="isDragOver = false"
    @drop.prevent="handleDrop"
    @click="triggerFileInput"
  >
    <v-icon size="48" :color="disabled ? 'grey-lighten-1' : 'grey'">mdi-cloud-upload</v-icon>
    <p class="mt-2">Drag & drop {{ acceptLabel }} here</p>
    <p class="text-caption text-grey">or click to browse</p>
    <p v-if="maxSize" class="text-caption text-grey mt-1">Max size: {{ formatFileSize(maxSize) }}</p>

    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      :multiple="multiple"
      hidden
      :disabled="disabled"
      @change="handleFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    accept?: string
    multiple?: boolean
    maxSize?: number
    disabled?: boolean
  }>(),
  {
    accept: 'image/*',
    multiple: false,
    maxSize: 10 * 1024 * 1024, // 10MB default
    disabled: false,
  }
)

const emit = defineEmits<{
  'file-selected': [file: File]
  'files-selected': [files: File[]]
  error: [message: string]
}>()

const fileInput = ref<HTMLInputElement>()
const isDragOver = ref(false)

const acceptLabel = computed(() => {
  if (props.accept?.includes('image')) return 'images'
  if (props.accept?.includes('.dem')) return 'demo files'
  return 'files'
})

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function handleDragOver(e: DragEvent) {
  if (props.disabled) return
  e.preventDefault()
  isDragOver.value = true
}

function triggerFileInput() {
  if (props.disabled) return
  fileInput.value?.click()
}

function validateFile(file: File): boolean {
  if (props.maxSize && file.size > props.maxSize) {
    emit('error', `File too large. Maximum size is ${formatFileSize(props.maxSize)}`)
    return false
  }
  return true
}

function handleDrop(e: DragEvent) {
  if (props.disabled) return
  isDragOver.value = false

  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length === 0) return

  if (props.multiple) {
    const validFiles = files.filter(validateFile)
    if (validFiles.length > 0) {
      emit('files-selected', validFiles)
    }
  } else {
    const file = files[0]
    if (!file) return
    if (validateFile(file)) {
      emit('file-selected', file)
    }
  }
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length === 0) return

  if (props.multiple) {
    const validFiles = files.filter(validateFile)
    if (validFiles.length > 0) {
      emit('files-selected', validFiles)
    }
  } else {
    const file = files[0]
    if (!file) return
    if (validateFile(file)) {
      emit('file-selected', file)
    }
  }

  // Reset input so same file can be selected again
  input.value = ''
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

.upload-zone:hover:not(.disabled),
.upload-zone.drag-over:not(.disabled) {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.05);
}

.upload-zone.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
