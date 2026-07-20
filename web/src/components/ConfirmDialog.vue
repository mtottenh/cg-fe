<template>
  <v-dialog :model-value="open" max-width="400" persistent @update:model-value="onDialogUpdate">
    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>{{ message }}</v-card-text>
      <v-alert v-if="error" type="error" density="compact" class="mx-4 mb-2" closable @click:close="$emit('clear-error')">
        {{ error }}
      </v-alert>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="handleCancel">
          {{ cancelLabel }}
        </v-btn>
        <v-btn
          :color="color"
          variant="flat"
          :loading="loading"
          @click="$emit('confirm')"
        >
          {{ actionLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
// Single controlled API, driven by useConfirmDialog() — prefer rendering via
// <ConfirmDialogHost :dialog="confirmDialog" /> instead of binding by hand.
withDefaults(defineProps<{
  open: boolean
  title: string
  message: string
  actionLabel?: string
  cancelLabel?: string
  color?: string
  loading?: boolean
  error?: string | null
}>(), {
  actionLabel: 'Confirm',
  cancelLabel: 'Cancel',
  color: 'primary',
  loading: false,
  error: null,
})

const emit = defineEmits<{
  confirm: []
  cancel: []
  'clear-error': []
}>()

function handleCancel() {
  emit('cancel')
}

function onDialogUpdate(value: boolean) {
  if (!value) handleCancel()
}
</script>
