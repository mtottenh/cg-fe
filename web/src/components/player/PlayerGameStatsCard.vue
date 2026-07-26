<template>
  <template v-if="profiles.length > 0">
    <v-card v-for="profile in profiles" :key="profile.id" class="mb-4">
      <v-card-title class="text-subtitle-1 font-weight-medium">
        <v-icon start size="small">mdi-trophy-outline</v-icon>
        {{ gameName(profile.game_id) }} - Tournament Stats
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4">
        <!-- Match record — only show if player has matches -->
        <template v-if="profile.matches_played > 0">
          <v-divider class="my-3" />
          <div class="text-caption text-medium-emphasis text-uppercase mb-1">Match Record</div>
          <v-row dense>
            <v-col cols="4" sm="2" class="text-center py-1">
              <div class="text-body-1 font-weight-bold">{{ profile.matches_played }}</div>
              <div class="text-caption text-medium-emphasis">Matches</div>
            </v-col>
            <v-col cols="4" sm="2" class="text-center py-1">
              <div class="text-body-1 font-weight-bold text-success">{{ profile.wins }}</div>
              <div class="text-caption text-medium-emphasis">Wins</div>
            </v-col>
            <v-col cols="4" sm="2" class="text-center py-1">
              <div class="text-body-1 font-weight-bold text-error">{{ profile.losses }}</div>
              <div class="text-caption text-medium-emphasis">Losses</div>
            </v-col>
            <v-col v-if="profile.draws > 0" cols="4" sm="2" class="text-center py-1">
              <div class="text-body-1 font-weight-bold">{{ profile.draws }}</div>
              <div class="text-caption text-medium-emphasis">Draws</div>
            </v-col>
            <v-col cols="4" sm="2" class="text-center py-1">
              <div class="text-body-1 font-weight-bold">{{ profile.win_rate.toFixed(1) }}%</div>
              <div class="text-caption text-medium-emphasis">Win Rate</div>
            </v-col>
          </v-row>
        </template>

        <!-- Other stat categories — only show categories with non-zero values -->
        <template v-for="(stats, category) in nonEmptyStatsByCategory(profile)" :key="category">
          <v-divider class="my-3" />
          <div class="text-caption text-medium-emphasis text-uppercase mb-1">{{ category }}</div>
          <v-row dense>
            <v-col
              v-for="stat in stats"
              :key="stat.key"
              cols="4"
              sm="2"
              class="text-center py-1"
            >
              <div class="text-body-1 font-weight-bold">{{ stat.value }}</div>
              <div class="text-caption text-medium-emphasis">{{ stat.label }}</div>
            </v-col>
          </v-row>
        </template>
      </v-card-text>
    </v-card>
  </template>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import { useGamesStore } from '@/stores/games'
import type { components } from '@/api/types'

type PlayerGameProfileResponse = components['schemas']['PlayerGameProfileResponse']
type DisplayStatResponse = components['schemas']['DisplayStatResponse']

const props = defineProps<{
  playerId: string
}>()

const gamesStore = useGamesStore()
const profiles = ref<PlayerGameProfileResponse[]>([])

onMounted(async () => {
  // Ensure games are loaded for name lookup
  if (gamesStore.games.length === 0) {
    gamesStore.fetchGames()
  }

  try {
    const { data } = await api.GET('/v1/players/{player_id}/games', {
      params: { path: { player_id: props.playerId } },
    })
    if (data?.data) {
      profiles.value = data.data
    }
  } catch {
    // Silently fail — component just won't render
  }
})

function gameName(gameId: string): string {
  const game = gamesStore.games.find((g) => g.id === gameId)
  return game?.display_name ?? game?.short_name ?? 'Game'
}

function hasNonZeroValue(stat: DisplayStatResponse): boolean {
  const num = Number(stat.value)
  return isNaN(num) || num !== 0
}

function nonEmptyStatsByCategory(
  profile: PlayerGameProfileResponse,
): Record<string, DisplayStatResponse[]> {
  const grouped: Record<string, DisplayStatResponse[]> = {}
  for (const stat of profile.display_stats) {
    if (stat.category === 'Rating' || stat.category === 'General') continue
    if (!grouped[stat.category]) grouped[stat.category] = []
    grouped[stat.category]!.push(stat)
  }
  // Sort within each category
  for (const stats of Object.values(grouped)) {
    stats.sort((a, b) => a.sort_order - b.sort_order)
  }
  // Filter out categories where every stat is zero
  const result: Record<string, DisplayStatResponse[]> = {}
  for (const [category, stats] of Object.entries(grouped)) {
    if (stats.some(hasNonZeroValue)) {
      result[category] = stats
    }
  }
  return result
}
</script>
