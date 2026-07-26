<template>
  <v-snackbar v-model="snackbar.visible" :color="snackbar.color" :timeout="timeout">
    {{ snackbar.text }}
    <template #actions>
      <v-btn
        aria-label="Dismiss"
        icon
        variant="text"
        size="small"
        @click="snackbar.visible = false"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSnackbar } from '@/composables/useSnackbar'

const snackbar = useSnackbar()

/** Errors and warnings need more reading time than success/info toasts. */
const timeout = computed(() =>
  snackbar.color === 'error' || snackbar.color === 'warning' ? 8000 : 3000
)
</script>
