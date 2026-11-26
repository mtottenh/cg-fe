<template>
  <v-dialog
    :model-value="dialog.state.open"
    max-width="520"
    persistent
    @update:model-value="(open: boolean) => { if (!open) dialog.cancel() }"
  >
    <v-card data-testid="reason-dialog">
      <v-card-title>{{ dialog.state.title }}</v-card-title>
      <v-card-text>
        <p class="mb-3">{{ dialog.state.message }}</p>
        <ul v-if="dialog.state.effects.length" class="pl-5 mb-3" data-testid="reason-dialog-effects">
          <li v-for="effect in dialog.state.effects" :key="effect">{{ effect }}</li>
        </ul>
        <v-alert
          v-if="dialog.state.warning"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ dialog.state.warning }}
        </v-alert>
        <v-text-field
          :model-value="dialog.state.reason"
          @update:model-value="dialog.setReason($event)"
          label="Reason (recorded in the match history)"
          variant="outlined"
          density="compact"
          maxlength="256"
          counter
          :error-messages="dialog.state.reason.trim() ? [] : ['A reason is required']"
          data-testid="reason-dialog-reason"
        />
        <v-alert
          v-if="dialog.state.dialogError"
          type="error"
          density="compact"
          class="mt-2"
          data-testid="reason-dialog-error"
        >
          {{ dialog.state.dialogError }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="dialog.state.loading" @click="dialog.cancel()">Cancel</v-btn>
        <v-btn
          :color="dialog.state.color"
          variant="flat"
          :loading="dialog.state.loading"
          :disabled="!dialog.state.reason.trim()"
          data-testid="reason-dialog-confirm"
          @click="dialog.execute()"
        >
          {{ dialog.state.actionLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { useReasonDialog } from '@/composables/useReasonDialog'

/** Binds a `useReasonDialog()` controller to its dialog. */
defineProps<{
  dialog: ReturnType<typeof useReasonDialog>
}>()
</script>
