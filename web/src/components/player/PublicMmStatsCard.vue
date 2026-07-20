<template>
  <v-card>
    <v-card-title class="text-subtitle-1 font-weight-medium">
      <v-icon start size="small">mdi-gamepad-variant</v-icon>
      CS2 - Public Matchmaking
    </v-card-title>
    <v-divider />

    <v-progress-linear v-if="mmStatsLoading" indeterminate />

    <v-alert v-if="mmStatsError" type="error" class="ma-4">
      {{ mmStatsError }}
    </v-alert>

    <v-card-text v-if="mmStatsNotTracked" class="text-center text-medium-emphasis">
      No public matchmaking data available for this player.
    </v-card-text>

    <v-card-text v-if="mmStats" class="pa-4">
      <!-- Rating section -->
      <div class="text-caption text-medium-emphasis text-uppercase mb-1">Rating</div>
      <v-row dense>
        <v-col cols="6" sm="3" class="text-center py-1">
          <div
            class="text-h5 font-weight-bold"
            :style="mmStats.rank_color ? { color: mmStats.rank_color } : {}"
          >
            {{ mmStats.rating.toLocaleString() }}
          </div>
          <div class="text-caption text-medium-emphasis">CS Rating</div>
        </v-col>
        <v-col cols="6" sm="3" class="text-center py-1">
          <div class="text-body-1 font-weight-bold">
            {{ mmStats.peak_rating.toLocaleString() }}
          </div>
          <div class="text-caption text-medium-emphasis">Peak Rating</div>
        </v-col>
        <v-col v-if="mmStats.rank_tier" cols="6" sm="3" class="text-center py-1">
          <v-chip
            size="small"
            :color="mmStats.rank_color ?? undefined"
            variant="tonal"
          >
            {{ mmStats.rank_tier }}
          </v-chip>
          <div class="text-caption text-medium-emphasis mt-1">Rank Tier</div>
        </v-col>
      </v-row>

      <!-- Rating History Chart -->
      <template v-if="chartEntries.length > 1">
        <v-divider class="my-3" />
        <div class="text-caption text-medium-emphasis text-uppercase mb-2">Rating History</div>
        <div style="height: 200px; position: relative;">
          <Line :data="chartData" :options="chartOptions" />
        </div>
      </template>

      <!-- Match Record -->
      <v-divider class="my-3" />
      <div class="text-caption text-medium-emphasis text-uppercase mb-1">Match Record</div>
      <v-row dense>
        <v-col cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold">{{ mmStats.matches_played }}</div>
          <div class="text-caption text-medium-emphasis">Matches</div>
        </v-col>
        <v-col cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold text-success">{{ mmStats.wins }}</div>
          <div class="text-caption text-medium-emphasis">Wins</div>
        </v-col>
        <v-col cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold text-error">{{ mmStats.losses }}</div>
          <div class="text-caption text-medium-emphasis">Losses</div>
        </v-col>
        <v-col v-if="mmStats.draws > 0" cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold">{{ mmStats.draws }}</div>
          <div class="text-caption text-medium-emphasis">Draws</div>
        </v-col>
        <v-col cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold">{{ mmStats.win_rate.toFixed(1) }}%</div>
          <div class="text-caption text-medium-emphasis">Win Rate</div>
        </v-col>
      </v-row>

      <!-- Combat Stats -->
      <v-divider class="my-3" />
      <div class="text-caption text-medium-emphasis text-uppercase mb-1">Combat</div>
      <v-row dense>
        <v-col cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold">{{ mmStats.kd_ratio.toFixed(2) }}</div>
          <div class="text-caption text-medium-emphasis">K/D</div>
        </v-col>
        <v-col cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold">{{ mmStats.kills.toLocaleString() }}</div>
          <div class="text-caption text-medium-emphasis">Kills</div>
        </v-col>
        <v-col cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold">{{ mmStats.deaths.toLocaleString() }}</div>
          <div class="text-caption text-medium-emphasis">Deaths</div>
        </v-col>
        <v-col cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold">{{ mmStats.assists.toLocaleString() }}</div>
          <div class="text-caption text-medium-emphasis">Assists</div>
        </v-col>
        <v-col cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold">{{ mmStats.hs_percent.toFixed(1) }}%</div>
          <div class="text-caption text-medium-emphasis">HS%</div>
        </v-col>
        <v-col cols="4" sm="2" class="text-center py-1">
          <div class="text-body-1 font-weight-bold">{{ mmStats.mvps }}</div>
          <div class="text-caption text-medium-emphasis">MVPs</div>
        </v-col>
      </v-row>

      <!-- Multi-kills (only if any > 0) -->
      <template v-if="mmStats.entry_3k + mmStats.entry_4k + mmStats.entry_5k > 0">
        <v-row dense class="mt-1">
          <v-col v-if="mmStats.entry_3k > 0" cols="4" sm="2" class="text-center py-1">
            <div class="text-body-1 font-weight-bold">{{ mmStats.entry_3k }}</div>
            <div class="text-caption text-medium-emphasis">3K</div>
          </v-col>
          <v-col v-if="mmStats.entry_4k > 0" cols="4" sm="2" class="text-center py-1">
            <div class="text-body-1 font-weight-bold">{{ mmStats.entry_4k }}</div>
            <div class="text-caption text-medium-emphasis">4K</div>
          </v-col>
          <v-col v-if="mmStats.entry_5k > 0" cols="4" sm="2" class="text-center py-1">
            <div class="text-body-1 font-weight-bold">{{ mmStats.entry_5k }}</div>
            <div class="text-caption text-medium-emphasis">ACE</div>
          </v-col>
        </v-row>
      </template>

      <!-- Recent Matches -->
      <template v-if="matchHistory.length > 0">
        <v-divider class="my-3" />
        <div class="text-caption text-medium-emphasis text-uppercase mb-2">Recent Matches</div>
        <div class="match-table-wrap">
          <v-table density="compact">
            <thead>
              <tr>
                <th>Map</th>
                <th>Result</th>
                <th>Score</th>
                <th>K/D/A</th>
                <th>HS</th>
                <th class="text-end">Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="match in matchHistory" :key="match.id">
                <td>{{ match.map || 'Unknown' }}</td>
                <td>
                  <v-chip
                    size="x-small"
                    :color="resultColor(match.match_result)"
                    variant="tonal"
                  >
                    {{ match.match_result.toUpperCase() }}
                  </v-chip>
                </td>
                <td>{{ match.team_scores[0] }}–{{ match.team_scores[1] }}</td>
                <td>{{ match.kills }}/{{ match.deaths }}/{{ match.assists }}</td>
                <td>{{ match.headshots }}</td>
                <td class="text-end text-medium-emphasis">
                  {{ formatRelativeTime(match.match_time) }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <div v-if="matchHistoryHasMore" class="text-center mt-2">
          <v-btn
            variant="text"
            size="small"
            :loading="matchHistoryLoading"
            @click="loadMoreMatchHistory"
          >
            Load More
          </v-btn>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js'
import { usePlayerStats } from '@/composables/usePlayerStats'
import { formatRelativeTime } from '@/utils/formatters'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const props = defineProps<{
  playerId: string
}>()

const {
  mmStats,
  mmStatsLoading,
  mmStatsError,
  mmStatsNotTracked,
  ratingHistory,
  matchHistory,
  matchHistoryLoading,
  matchHistoryHasMore,
  fetchMmStats,
  fetchRatingHistory,
  fetchMatchHistory,
  loadMoreMatchHistory,
} = usePlayerStats(props.playerId)

onMounted(() => {
  Promise.all([fetchMmStats(), fetchRatingHistory(), fetchMatchHistory()])
})

// Chart data — filter out rating=0, reverse to chronological
const chartEntries = computed(() =>
  [...ratingHistory.value].filter((r) => r.rating > 0).reverse(),
)

const chartData = computed(() => ({
  labels: chartEntries.value.map((r) =>
    new Date(r.recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  ),
  datasets: [
    {
      label: 'CS Rating',
      data: chartEntries.value.map((r) => r.rating),
      borderColor: '#FF6F00',
      backgroundColor: 'rgba(255, 111, 0, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 2,
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { mode: 'index' as const, intersect: false },
  },
  scales: {
    x: {
      ticks: { maxTicksToAuto: 8, maxRotation: 45 },
      grid: { display: false },
    },
    y: {
      beginAtZero: false,
      grid: { color: 'rgba(255, 255, 255, 0.08)' },
    },
  },
}

function resultColor(result: string): string {
  if (result === 'win') return 'success'
  if (result === 'loss') return 'error'
  return 'grey'
}
</script>

<style scoped>
.match-table-wrap {
  overflow-x: auto;
}
</style>
