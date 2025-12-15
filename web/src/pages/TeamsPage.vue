<template>
  <v-container class="py-8">
    <v-row align="center" class="mb-6">
      <v-col>
        <h1 class="text-h3">Teams</h1>
      </v-col>
      <v-col cols="auto">
        <v-btn color="primary" to="/teams/new">
          <v-icon start>mdi-plus</v-icon>
          Create Team
        </v-btn>
      </v-col>
    </v-row>

    <v-alert v-if="teamsStore.error" type="error" class="mb-4" closable>
      {{ teamsStore.error }}
    </v-alert>

    <v-progress-linear v-if="teamsStore.loading" indeterminate class="mb-4" />

    <v-row v-if="teamsStore.teams.length > 0">
      <v-col v-for="team in teamsStore.teams" :key="team.id" cols="12" sm="6" md="4">
        <v-card :to="`/teams/${team.id}`" class="h-100">
          <v-card-item>
            <template v-slot:prepend>
              <v-avatar color="primary" size="48">
                <v-img v-if="team.logo_url" :src="team.logo_url" />
                <span v-else class="text-h6">{{ team.tag.substring(0, 2) }}</span>
              </v-avatar>
            </template>
            <v-card-title>{{ team.name }}</v-card-title>
            <v-card-subtitle class="team-tag">[{{ team.tag }}]</v-card-subtitle>
          </v-card-item>
          <v-card-text v-if="team.description">
            <p class="text-body-2 text-medium-emphasis text-truncate">
              {{ team.description }}
            </p>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-icon size="small" class="mr-1">mdi-chevron-right</v-icon>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-else-if="!teamsStore.loading">
      <v-col cols="12" class="text-center py-12">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-account-group-outline</v-icon>
        <h3 class="text-h5 text-medium-emphasis mb-2">No Teams Yet</h3>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Be the first to create a team!
        </p>
        <v-btn color="primary" to="/teams/new">Create Team</v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useTeamsStore } from '@/stores/teams'

const teamsStore = useTeamsStore()

onMounted(async () => {
  await teamsStore.fetchTeams()
})
</script>
