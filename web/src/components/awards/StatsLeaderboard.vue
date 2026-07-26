<template>
  <div data-testid="stats-leaderboard">
    <!-- Loading -->
    <div v-if="loading" class="pa-4" data-testid="stats-leaderboard-loading">
      <v-skeleton-loader type="table-heading, table-row-divider, table-row@4" />
    </div>

    <template v-else>
      <!-- Empty -->
      <div
        v-if="entries.length === 0"
        class="text-center pa-8"
        data-testid="stats-leaderboard-empty"
      >
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-chart-box-outline</v-icon>
        <h3 class="text-h6 mb-2">No Player Stats Yet</h3>
        <p class="text-medium-emphasis">
          Stats appear once demos are parsed and linked.
        </p>
      </div>

      <!-- Table -->
      <v-data-table
        v-else
        :headers="headers"
        :items="rankedEntries"
        :sort-by="sortBy"
        item-value="player_id"
        density="comfortable"
        data-testid="stats-leaderboard-table"
      >
        <template v-slot:header.adr="{ column }">
          <span>
            {{ column.title }}
            <v-tooltip activator="parent" location="top">Average Damage per Round</v-tooltip>
          </span>
        </template>
        <template v-slot:header.kd="{ column }">
          <span>
            {{ column.title }}
            <v-tooltip activator="parent" location="top">Kills divided by deaths</v-tooltip>
          </span>
        </template>
        <template v-slot:header.demos_counted="{ column }">
          <span>
            {{ column.title }}
            <v-tooltip activator="parent" location="top">Parsed demos counted for this player (sample size)</v-tooltip>
          </span>
        </template>

        <template v-slot:item.rank="{ item }">
          <span class="text-medium-emphasis" data-testid="stat-rank">#{{ item.rank }}</span>
        </template>

        <template v-slot:item.display_name="{ item }">
          <router-link
            :to="`/players/${item.player_id}`"
            class="d-inline-flex align-center text-decoration-none font-weight-medium"
            data-testid="stats-player-link"
          >
            <v-avatar size="28" class="mr-2">
              <v-img alt="" v-if="item.avatar_url" :src="item.avatar_url" />
              <v-icon v-else size="18">mdi-account</v-icon>
            </v-avatar>
            {{ item.display_name }}
          </router-link>
        </template>

        <template v-slot:item.kills="{ item }">
          <span data-testid="stat-kills">{{ Math.round(item.kills) }}</span>
        </template>

        <template v-slot:item.deaths="{ item }">
          <span data-testid="stat-deaths">{{ Math.round(item.deaths) }}</span>
        </template>

        <template v-slot:item.assists="{ item }">
          <span data-testid="stat-assists">{{ Math.round(item.assists) }}</span>
        </template>

        <template v-slot:item.total_damage="{ item }">
          <span data-testid="stat-damage">{{ Math.round(item.total_damage) }}</span>
        </template>

        <template v-slot:item.adr="{ item }">
          <span data-testid="stat-adr">{{ item.adr.toFixed(1) }}</span>
        </template>

        <template v-slot:item.kd="{ item }">
          <span data-testid="stat-kd">{{ item.kd.toFixed(2) }}</span>
        </template>

        <template v-slot:item.demos_counted="{ item }">
          <span data-testid="stat-demos">{{ Math.round(item.demos_counted) }}</span>
        </template>
      </v-data-table>
    </template>

    <v-alert
      v-if="awardsStore.fetchStatsLeaderboardState.error"
      type="error"
      class="mt-4"
      closable
      @click:close="awardsStore.fetchStatsLeaderboardState.error = null"
    >
      {{ awardsStore.fetchStatsLeaderboardState.error }}
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAwardsStore, type PlayerStatsEntryResponse } from '@/stores/awards'

const props = defineProps<{
  scope: 'tournament' | 'season'
  scopeId: string
}>()

const awardsStore = useAwardsStore()

const entries = ref<PlayerStatsEntryResponse[]>([])
const loading = ref(false)

// Default client-side sort: kills descending.
const sortBy = ref<{ key: string; order: 'asc' | 'desc' }[]>([{ key: 'kills', order: 'desc' }])

const headers = [
  // Rank is fixed to the primary metric (kills) so re-sorting other columns
  // never loses the "who is #1" anchor.
  { title: '#', key: 'rank', width: '56px', sortable: false },
  { title: 'Player', key: 'display_name', sortable: true },
  { title: 'Kills', key: 'kills', align: 'end' as const, sortable: true },
  { title: 'Deaths', key: 'deaths', align: 'end' as const, sortable: true },
  { title: 'K/D', key: 'kd', align: 'end' as const, sortable: true },
  { title: 'Assists', key: 'assists', align: 'end' as const, sortable: true },
  { title: 'Damage', key: 'total_damage', align: 'end' as const, sortable: true },
  { title: 'ADR', key: 'adr', align: 'end' as const, sortable: true },
  { title: 'Demos', key: 'demos_counted', align: 'end' as const, sortable: true },
]

/** Entries with a stable rank (by kills desc) and derived K/D. */
const rankedEntries = computed(() => {
  const byKills = [...entries.value].sort((a, b) => b.kills - a.kills)
  const rankByPlayer = new Map(byKills.map((e, i) => [e.player_id, i + 1]))
  return entries.value.map((e) => ({
    ...e,
    rank: rankByPlayer.get(e.player_id) ?? 0,
    kd: e.deaths > 0 ? e.kills / e.deaths : e.kills,
  }))
})

// Latest-wins token: scope can change (season switch) while a fetch is in
// flight; a slow earlier response must not overwrite the newer scope's rows.
let fetchSeq = 0

async function fetchData() {
  const seq = ++fetchSeq
  if (!props.scopeId) {
    entries.value = []
    return
  }
  loading.value = true
  try {
    const data = await awardsStore.fetchPlayerStatsLeaderboard(props.scope, props.scopeId, {
      sort: 'kills',
      // Bound the payload — without a limit the server returns every player
      // in the season.
      limit: 100,
    })
    if (seq === fetchSeq) entries.value = data
  } catch {
    // Error captured in store state
    if (seq === fetchSeq) entries.value = []
  } finally {
    if (seq === fetchSeq) loading.value = false
  }
}

watch(() => [props.scope, props.scopeId], fetchData)
onMounted(fetchData)

defineExpose({ refresh: fetchData })
</script>
