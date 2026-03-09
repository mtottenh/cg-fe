<template>
  <v-menu>
    <template v-slot:activator="{ props: menuProps }">
      <v-btn icon size="small" variant="text" v-bind="menuProps">
        <v-icon>mdi-dots-vertical</v-icon>
      </v-btn>
    </template>

    <v-list density="compact">
      <!-- Draft Actions -->
      <template v-if="tournament.status === 'draft'">
        <v-list-item prepend-icon="mdi-pencil" @click="emit('action', 'edit')">
          <v-list-item-title>Edit</v-list-item-title>
        </v-list-item>
        <v-list-item prepend-icon="mdi-eye" @click="emit('action', 'publish')">
          <v-list-item-title>Publish</v-list-item-title>
        </v-list-item>
        <v-divider />
        <v-list-item prepend-icon="mdi-delete" class="text-error" @click="emit('action', 'delete')">
          <v-list-item-title>Delete</v-list-item-title>
        </v-list-item>
      </template>

      <!-- Published Actions -->
      <template v-else-if="tournament.status === 'published'">
        <v-list-item prepend-icon="mdi-pencil" @click="emit('action', 'edit')">
          <v-list-item-title>Edit</v-list-item-title>
        </v-list-item>
        <v-list-item prepend-icon="mdi-account-plus" @click="emit('action', 'open-registration')">
          <v-list-item-title>Open Registration</v-list-item-title>
        </v-list-item>
      </template>

      <!-- Registration Open Actions -->
      <template v-else-if="tournament.status === 'registration'">
        <v-list-item prepend-icon="mdi-pencil" @click="emit('action', 'edit')">
          <v-list-item-title>Edit</v-list-item-title>
        </v-list-item>
        <v-list-item prepend-icon="mdi-account-group" @click="emit('action', 'view-registrations')">
          <v-list-item-title>View Registrations</v-list-item-title>
        </v-list-item>
        <v-list-item prepend-icon="mdi-account-cancel" @click="emit('action', 'close-registration')">
          <v-list-item-title>Close Registration</v-list-item-title>
        </v-list-item>
      </template>

      <!-- Scheduled Actions (registration closed) -->
      <template v-else-if="tournament.status === 'scheduled'">
        <v-list-item prepend-icon="mdi-account-group" @click="emit('action', 'view-registrations')">
          <v-list-item-title>View Registrations</v-list-item-title>
        </v-list-item>
        <v-list-item prepend-icon="mdi-format-list-numbered" @click="emit('action', 'manage-seeding')">
          <v-list-item-title>Manage Seeding</v-list-item-title>
        </v-list-item>
        <v-list-item prepend-icon="mdi-play" @click="emit('action', 'start')">
          <v-list-item-title>Start Tournament</v-list-item-title>
        </v-list-item>
      </template>

      <!-- In Progress Actions -->
      <template v-else-if="tournament.status === 'in_progress'">
        <v-list-item prepend-icon="mdi-tournament" @click="emit('action', 'view-bracket')">
          <v-list-item-title>View Bracket</v-list-item-title>
        </v-list-item>
        <v-list-item prepend-icon="mdi-format-list-bulleted" @click="emit('action', 'manage-matches')">
          <v-list-item-title>Manage Matches</v-list-item-title>
        </v-list-item>
      </template>

      <!-- Completed Actions -->
      <template v-else-if="tournament.status === 'completed'">
        <v-list-item prepend-icon="mdi-tournament" @click="emit('action', 'view-bracket')">
          <v-list-item-title>View Bracket</v-list-item-title>
        </v-list-item>
        <v-list-item prepend-icon="mdi-trophy" @click="emit('action', 'view-results')">
          <v-list-item-title>View Results</v-list-item-title>
        </v-list-item>
        <v-list-item prepend-icon="mdi-check-all" @click="emit('action', 'finalize')">
          <v-list-item-title>Finalize</v-list-item-title>
        </v-list-item>
      </template>

      <!-- Finalized Actions -->
      <template v-else-if="tournament.status === 'finalized'">
        <v-list-item prepend-icon="mdi-tournament" @click="emit('action', 'view-bracket')">
          <v-list-item-title>View Bracket</v-list-item-title>
        </v-list-item>
        <v-list-item prepend-icon="mdi-trophy" @click="emit('action', 'view-results')">
          <v-list-item-title>View Results</v-list-item-title>
        </v-list-item>
      </template>

      <!-- Cancelled Actions -->
      <template v-else-if="tournament.status === 'cancelled'">
        <v-list-item prepend-icon="mdi-information" @click="emit('action', 'view-details')">
          <v-list-item-title>View Details</v-list-item-title>
        </v-list-item>
      </template>

      <!-- Common Actions (always available unless cancelled/finalized) -->
      <template v-if="!['cancelled', 'finalized'].includes(tournament.status)">
        <v-divider v-if="!['draft'].includes(tournament.status)" />
        <v-list-item prepend-icon="mdi-open-in-new" @click="emit('action', 'view-public')">
          <v-list-item-title>View Public Page</v-list-item-title>
        </v-list-item>
        <v-list-item v-if="!['completed', 'cancelled'].includes(tournament.status)" prepend-icon="mdi-cancel" class="text-error" @click="emit('action', 'cancel')">
          <v-list-item-title>Cancel Tournament</v-list-item-title>
        </v-list-item>
      </template>
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
import type { TournamentSummaryResponse } from '@/stores/tournaments'

defineProps<{
  tournament: TournamentSummaryResponse
}>()

const emit = defineEmits<{
  action: [action: string]
}>()
</script>
