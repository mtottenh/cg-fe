<template>
  <v-card
    class="award-card h-100"
    :class="{ 'award-card--finalized': isFinalized }"
    :style="accentStyle"
    variant="elevated"
    data-testid="award-card"
  >
    <v-card-item>
      <template v-slot:prepend>
        <v-avatar :color="award.color || 'primary'" variant="tonal" size="44">
          <v-icon :icon="award.icon || 'mdi-trophy'" />
        </v-avatar>
      </template>
      <v-card-title class="d-flex align-center" data-testid="award-name">
        {{ award.name }}
      </v-card-title>
      <v-card-subtitle v-if="award.description">{{ award.description }}</v-card-subtitle>
      <template v-slot:append>
        <v-chip
          v-if="isFinalized"
          size="small"
          color="amber-darken-2"
          variant="flat"
          prepend-icon="mdi-trophy"
          data-testid="award-finalized-chip"
        >
          Finalized
        </v-chip>
        <v-chip
          v-else
          size="small"
          color="info"
          variant="tonal"
          prepend-icon="mdi-chart-line"
          data-testid="award-live-chip"
        >
          Live
        </v-chip>
      </template>
    </v-card-item>

    <v-divider />

    <!-- Podium: top 3 (ties share ranks) -->
    <v-card-text v-if="loading" class="text-center py-4">
      <v-progress-circular indeterminate size="24" color="primary" />
    </v-card-text>
    <v-card-text v-else-if="podium.length > 0" class="py-2">
      <v-list density="compact" class="pa-0 bg-transparent" data-testid="award-podium">
        <v-list-item
          v-for="entry in podium"
          :key="entry.player_id"
          class="px-1"
          data-testid="podium-entry"
        >
          <template v-slot:prepend>
            <v-icon :color="medalColor(entry.rank) ?? 'grey'" size="22">mdi-medal</v-icon>
          </template>
          <v-list-item-title>
            <span class="d-inline-flex align-center">
              {{ entry.display_name }}
              <v-chip
                v-if="tiedRanks.has(entry.rank)"
                size="x-small"
                variant="tonal"
                class="ml-2"
                data-testid="shared-rank-chip"
              >
                shared
              </v-chip>
            </span>
          </v-list-item-title>
          <template v-slot:append>
            <span class="font-weight-bold" data-testid="podium-value">
              {{ formatAwardValue(entry.value) }}
            </span>
          </template>
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-card-text v-else class="text-center text-grey py-4" data-testid="award-no-standings">
      No qualifying stats yet
    </v-card-text>

    <template v-if="entries && entries.length > 0">
      <v-divider />
      <v-card-actions class="py-0">
        <v-spacer />
        <v-btn
          size="small"
          variant="text"
          :append-icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          data-testid="award-expand"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Hide standings' : 'Full standings' }}
        </v-btn>
      </v-card-actions>
      <v-expand-transition>
        <div v-show="expanded">
          <v-divider />
          <AwardStandings :entries="entries" :current-player-id="currentPlayerId" />
        </div>
      </v-expand-transition>
    </template>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { AwardResponse, LeaderboardEntryResponse } from '@/stores/awards'
import { sharedRanks, formatAwardValue, medalColor } from '@/utils/awards'
import AwardStandings from './AwardStandings.vue'

const props = defineProps<{
  award: AwardResponse
  entries?: LeaderboardEntryResponse[]
  loading?: boolean
  currentPlayerId?: string | null
}>()

const expanded = ref(false)

const isFinalized = computed(() => props.award.status === 'finalized')

const podium = computed(() =>
  (props.entries ?? []).filter((e) => e.rank <= 3),
)

const tiedRanks = computed(() => sharedRanks(props.entries ?? []))

const accentStyle = computed(() => {
  const color = props.award.color || null
  const accent = color ? `4px solid ${color}` : '4px solid rgb(var(--v-theme-primary))'
  return { borderLeft: accent }
})
</script>

<style scoped>
.award-card--finalized {
  box-shadow:
    0 0 0 1px rgba(255, 193, 7, 0.45),
    0 2px 8px rgba(255, 193, 7, 0.15) !important;
}
</style>
