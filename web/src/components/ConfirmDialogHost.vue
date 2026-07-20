<template>
  <ConfirmDialog
    :open="dialog.state.open"
    :title="dialog.state.title"
    :message="dialog.state.message"
    :action-label="dialog.state.actionLabel"
    :color="dialog.state.color"
    :loading="dialog.state.loading"
    :error="dialog.state.dialogError"
    @clear-error="dialog.clearError()"
    @confirm="dialog.execute"
    @cancel="dialog.cancel"
  />
</template>

<script setup lang="ts">
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import type { useConfirmDialog } from '@/composables/useConfirmDialog'

/**
 * Binds a `useConfirmDialog()` controller to the ConfirmDialog component in
 * one line: `<ConfirmDialogHost :dialog="confirmDialog" />`. Replaces the
 * ~10 identical binding lines previously copy-pasted at every call site
 * (some of which silently omitted the error bindings).
 */
defineProps<{
  dialog: ReturnType<typeof useConfirmDialog>
}>()
</script>
