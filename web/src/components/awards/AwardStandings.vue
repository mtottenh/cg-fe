<template>
  <v-table density="compact" data-testid="award-standings">
    <thead>
      <tr>
        <th style="width: 70px">Rank</th>
        <th>Player</th>
        <th class="text-right">Value</th>
        <th class="text-right" style="width: 90px">Demos</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="entry in entries"
        :key="entry.player_id"
        :class="{ 'standings-you': entry.player_id === currentPlayerId }"
        :data-testid="entry.player_id === currentPlayerId ? 'standings-row-you' : 'standings-row'"
      >
        <td>
          <span class="d-inline-flex align-center">
            <v-icon
              v-if="medalColor(entry.rank)"
              size="16"
              :color="medalColor(entry.rank)!"
              class="mr-1"
            >
              mdi-medal
            </v-icon>
            {{ entry.rank }}
            <v-chip v-if="tiedRanks.has(entry.rank)" size="x-small" variant="tonal" class="ml-1">
              shared
            </v-chip>
          </span>
        </td>
        <td>
          <span class="d-inline-flex align-center">
            <v-avatar size="24" class="mr-2">
              <v-img v-if="entry.avatar_url" :src="entry.avatar_url" />
              <v-icon v-else size="16">mdi-account</v-icon>
            </v-avatar>
            {{ entry.display_name }}
            <v-chip
              v-if="entry.player_id === currentPlayerId"
              size="x-small"
              color="primary"
              variant="tonal"
              class="ml-2"
            >
              You
            </v-chip>
          </span>
        </td>
        <td class="text-right font-weight-medium">{{ formatAwardValue(entry.value) }}</td>
        <td class="text-right text-grey">{{ entry.demos_counted }}</td>
      </tr>
      <tr v-if="entries.length === 0">
        <td colspan="4" class="text-center text-grey py-4">No qualifying players yet</td>
      </tr>
    </tbody>
  </v-table>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LeaderboardEntryResponse } from '@/stores/awards'
import { sharedRanks, formatAwardValue, medalColor } from '@/utils/awards'

const props = defineProps<{
  entries: LeaderboardEntryResponse[]
  currentPlayerId?: string | null
}>()

const tiedRanks = computed(() => sharedRanks(props.entries))
</script>

<style scoped>
.standings-you {
  background: rgba(var(--v-theme-primary), 0.08);
}
</style>
