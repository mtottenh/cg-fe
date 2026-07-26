<template>
  <div class="d-flex ga-2">
    <v-btn variant="tonal" prepend-icon="mdi-open-in-new" @click="$emit('view-public')">
      View Public
    </v-btn>
    <v-btn v-if="actions.canPublish.value" color="primary" prepend-icon="mdi-eye" @click="actions.publish">
      Publish
    </v-btn>
    <v-btn v-if="actions.canOpenRegistration.value" color="success" prepend-icon="mdi-account-plus" @click="actions.openRegistration">
      Open Registration
    </v-btn>
    <v-btn v-if="actions.canStart.value" color="primary" prepend-icon="mdi-play" @click="actions.start">
      Start Tournament
    </v-btn>
    <v-btn v-if="actions.canComplete.value" color="success" prepend-icon="mdi-flag-checkered" @click="actions.complete">
      Complete
    </v-btn>
    <v-btn v-if="actions.canFinalize.value" color="success" prepend-icon="mdi-check-all" @click="actions.finalize">
      Finalize
    </v-btn>
    <v-btn
      v-if="actions.canProcessNoShows.value"
      color="warning"
      variant="tonal"
      prepend-icon="mdi-account-alert"
      :loading="processNoShowsLoading"
      @click="actions.processNoShows"
    >
      Process No-Shows
    </v-btn>
    <v-btn v-if="actions.canCancel.value" color="error" variant="tonal" prepend-icon="mdi-cancel" @click="actions.cancel">
      Cancel
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import type { useTournamentAdminActions } from '@/composables/useTournamentAdminActions'

defineProps<{
  actions: ReturnType<typeof useTournamentAdminActions>
  processNoShowsLoading?: boolean
}>()

defineEmits<{
  'view-public': []
}>()
</script>
