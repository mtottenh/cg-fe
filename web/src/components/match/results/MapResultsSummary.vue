<template>
  <div v-if="rows.length > 0" data-testid="map-results-summary">
    <v-divider class="my-4" />
    <div class="text-subtitle-2 mb-2 text-center">Map Results</div>
    <div class="d-flex flex-column ga-1">
      <div
        v-for="row in rows"
        :key="row.gameNumber"
        class="d-flex align-center justify-center ga-3"
      >
        <span class="map-name text-body-2 text-right">{{ row.mapLabel }}</span>
        <span class="text-body-1 d-flex align-center ga-1">
          <!-- Trophy marks the winner — never color alone. -->
          <v-icon v-if="row.winner === 1" size="x-small" color="success">mdi-trophy</v-icon>
          <span :class="row.winner === 1 ? 'font-weight-bold text-success' : ''">
            {{ row.score1 }}
          </span>
          <span class="text-medium-emphasis">:</span>
          <span :class="row.winner === 2 ? 'font-weight-bold text-success' : ''">
            {{ row.score2 }}
          </span>
          <v-icon v-if="row.winner === 2" size="x-small" color="success">mdi-trophy</v-icon>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ResultClaimResponse } from '@/stores/matchResults'

const props = defineProps<{
  claim: ResultClaimResponse
  /** Vetoed maps in game order (real ids + display names), when available. */
  maps?: Array<{ id: string; name: string }>
}>()

/** Best-effort human label for a map id: veto list first, then de_-style
 * names, then a positional fallback. */
function mapLabel(mapId: string, gameNumber: number): string {
  const fromVeto = props.maps?.find((m) => m.id === mapId)?.name
  if (fromVeto) return fromVeto
  if (/^de_[a-z0-9_]+$/i.test(mapId)) {
    const bare = mapId.slice(3)
    return bare.charAt(0).toUpperCase() + bare.slice(1)
  }
  // Synthetic ids (map_1) or opaque UUIDs carry no display value.
  return `Map ${gameNumber}`
}

const rows = computed(() =>
  (props.claim.game_results ?? [])
    .slice()
    .sort((a, b) => a.game_number - b.game_number)
    // Unplayed games in a Bo3/Bo5 submission come through as 0-0 — noise.
    .filter((g) => g.participant1_score !== g.participant2_score)
    .map((g) => ({
      gameNumber: g.game_number,
      mapLabel: mapLabel(g.map_id, g.game_number),
      score1: g.participant1_score,
      score2: g.participant2_score,
      winner: g.participant1_score > g.participant2_score ? 1 : 2,
    }))
)
</script>

<style scoped>
.map-name {
  min-width: 90px;
}
</style>
