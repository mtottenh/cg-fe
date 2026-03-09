<template>
  <v-dialog :model-value="isOpen" max-width="400" persistent @update:model-value="onDialogUpdate">
    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>{{ message }}</v-card-text>
      <v-alert v-if="error" type="error" density="compact" class="mx-4 mb-2" closable @click:close="$emit('clear-error')">
        {{ error }}
      </v-alert>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="handleCancel">
          {{ cancelText || 'Cancel' }}
        </v-btn>
        <v-btn
          :color="confirmColor || color || 'primary'"
          variant="flat"
          :loading="loading"
          @click="handleConfirm"
        >
          {{ confirmText || actionLabel || 'Confirm' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  // v-model API (simple usage)
  modelValue?: boolean
  confirmText?: string
  cancelText?: string
  confirmColor?: string
  // useConfirmDialog() API
  open?: boolean
  actionLabel?: string
  color?: string
  loading?: boolean
  error?: string | null
  // shared
  title: string
  message: string
}>(), {
  modelValue: undefined,
  open: false,
  loading: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
  'clear-error': []
}>()

// Support both v-model and direct open prop
const isOpen = computed(() => props.modelValue ?? props.open)

function handleConfirm() {
  emit('confirm')
  emit('update:modelValue', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}

function onDialogUpdate(value: boolean) {
  if (!value) handleCancel()
}
</script>
