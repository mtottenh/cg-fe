<template>
  <v-card v-if="showCard" data-testid="pug-stats-card">
    <v-card-title class="d-flex align-center ga-2">
      <v-icon icon="mdi-tire" size="small" />
      PUG stats
      <v-tooltip location="top">
        <template #activator="{ props: tooltipProps }">
          <v-icon
            v-bind="tooltipProps"
            icon="mdi-information-outline"
            size="x-small"
            class="text-medium-emphasis"
          />
        </template>
        Pick-up games only — kept separate from tournament stats and ratings
      </v-tooltip>
    </v-card-title>
    <v-card-text>
      <v-row dense>
        <v-col v-for="stat in tiles" :key="stat.label" cols="4" sm="2">
          <div class="text-center">
            <div class="text-h6" :data-testid="`pug-stat-${stat.key}`">{{ stat.value }}</div>
            <div class="text-caption text-medium-emphasis">{{ stat.label }}</div>
          </div>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
/**
 * Career PUG aggregates — the deliberately separate stats feed. Numbers are
 * demo-derived (`demos.category = 'pug'`) plus W/L from completed pugs;
 * tournament profiles and ratings never include them.
 */
import { computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePugsStore } from '@/stores/pugs'

const props = defineProps<{ playerId: string }>()

const pugsStore = usePugsStore()
const { pugStats } = storeToRefs(pugsStore)

const showCard = computed(
  () => pugStats.value != null && (pugStats.value.matches_played > 0 || pugStats.value.demos_counted > 0)
)

const tiles = computed(() => {
  const stats = pugStats.value
  if (!stats) return []
  const kd =
    stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(0)
  return [
    { key: 'played', label: 'PUGs', value: String(stats.matches_played) },
    { key: 'record', label: 'W – L', value: `${stats.wins} – ${stats.losses}` },
    { key: 'kd', label: 'K/D', value: kd },
    { key: 'kills', label: 'Kills', value: String(stats.kills) },
    { key: 'adr', label: 'ADR', value: stats.avg_adr.toFixed(1) },
    { key: 'hs', label: 'HS%', value: `${stats.avg_hs_percentage.toFixed(0)}%` },
  ]
})

async function load(): Promise<void> {
  if (!props.playerId) return
  await pugsStore.fetchPugStats(props.playerId).catch(() => {})
}

onMounted(load)
watch(() => props.playerId, load)
</script>
