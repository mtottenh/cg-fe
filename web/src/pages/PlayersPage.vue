<template>
  <v-container class="py-8">
    <v-row align="center" class="mb-6">
      <v-col>
        <h1 class="text-h3">Players</h1>
      </v-col>
    </v-row>

    <v-row class="mb-4">
      <v-col cols="12" sm="6" md="4">
        <v-text-field
          v-model="search"
          label="Search players"
          prepend-inner-icon="mdi-magnify"
          clearable
          @update:model-value="debouncedSearch"
        />
      </v-col>
    </v-row>

    <v-alert v-if="playersStore.error" type="error" class="mb-4" closable>
      {{ playersStore.error }}
    </v-alert>

    <v-progress-linear v-if="playersStore.loading" indeterminate class="mb-4" />

    <v-row v-if="playersStore.players.length > 0">
      <v-col v-for="player in playersStore.players" :key="player.id" cols="12" sm="6" md="4" lg="3">
        <v-card :to="`/players/${player.id}`" class="h-100">
          <v-card-item>
            <template v-slot:prepend>
              <v-avatar color="secondary" size="48">
                <v-img v-if="player.avatar_url" :src="player.avatar_url" />
                <span v-else class="text-h6">{{ player.display_name.substring(0, 2).toUpperCase() }}</span>
              </v-avatar>
            </template>
            <v-card-title>{{ player.display_name }}</v-card-title>
            <v-card-subtitle v-if="player.country_code">
              {{ player.country_code }}
            </v-card-subtitle>
          </v-card-item>
          <v-card-actions>
            <v-spacer />
            <v-icon size="small">mdi-chevron-right</v-icon>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-else-if="!playersStore.loading">
      <v-col cols="12" class="text-center py-12">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-account-search-outline</v-icon>
        <h3 class="text-h5 text-medium-emphasis mb-2">No Players Found</h3>
        <p class="text-body-2 text-medium-emphasis">
          {{ search ? 'Try a different search term' : 'No players registered yet' }}
        </p>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePlayersStore } from '@/stores/players'

const playersStore = usePlayersStore()

const search = ref('')
let searchTimeout: number | null = null

onMounted(async () => {
  await playersStore.fetchPlayers()
})

function debouncedSearch() {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = window.setTimeout(async () => {
    await playersStore.fetchPlayers(1, 20, search.value || undefined)
  }, 300)
}
</script>
