<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmColor?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

const dialog = ref(props.modelValue)

watch(() => props.modelValue, (value) => {
  dialog.value = value
})

watch(dialog, (value) => {
  emit('update:modelValue', value)
})

function confirm() {
  emit('confirm')
  dialog.value = false
}

function cancel() {
  emit('cancel')
  dialog.value = false
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="400" persistent>
    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>{{ message }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="cancel">
          {{ cancelText || 'Cancel' }}
        </v-btn>
        <v-btn :color="confirmColor || 'primary'" variant="flat" @click="confirm">
          {{ confirmText || 'Confirm' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
