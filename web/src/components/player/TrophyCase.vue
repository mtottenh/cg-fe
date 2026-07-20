<template>
  <v-card v-if="ownProfile || trophies.length > 0" data-testid="trophy-case">
    <v-card-title>
      <v-icon start color="amber-darken-2">mdi-trophy</v-icon>
      Trophies
      <v-chip v-if="trophies.length > 0" size="x-small" variant="tonal" class="ml-2">
        {{ trophies.length }}
      </v-chip>
    </v-card-title>
    <v-divider />

    <v-card-text v-if="loading" class="text-center pa-6">
      <v-progress-circular indeterminate color="primary" size="28" />
    </v-card-text>

    <v-list v-else-if="trophies.length > 0" lines="two">
      <v-list-item
        v-for="trophy in trophies"
        :key="trophy.result.id"
        data-testid="trophy-item"
      >
        <template v-slot:prepend>
          <v-avatar :color="trophy.award.color || 'amber-darken-2'" variant="tonal">
            <v-icon :icon="trophy.award.icon || 'mdi-trophy'" />
          </v-avatar>
        </template>
        <v-list-item-title>{{ trophy.award.name }}</v-list-item-title>
        <v-list-item-subtitle>
          <span v-if="trophy.scope_name">{{ trophy.scope_name }} · </span>
          {{ formatAwardValue(trophy.result.value) }}
        </v-list-item-subtitle>
        <template v-slot:append>
          <div class="d-flex align-center ga-1">
            <v-icon
              v-if="medalColor(trophy.result.rank)"
              :color="medalColor(trophy.result.rank)!"
              size="20"
            >
              mdi-medal
            </v-icon>
            <v-chip size="x-small" variant="tonal" data-testid="trophy-rank">
              Rank {{ trophy.result.rank }}
            </v-chip>
            <v-chip
              v-if="sharedTrophyIds.has(trophy.result.id)"
              size="x-small"
              variant="tonal"
              data-testid="trophy-shared"
            >
              shared
            </v-chip>
          </div>
        </template>
      </v-list-item>
    </v-list>

    <v-card-text v-else class="text-center text-medium-emphasis pa-6" data-testid="trophy-empty">
      <v-icon size="40" color="grey-lighten-1" class="mb-2">mdi-trophy-outline</v-icon>
      <p class="text-body-2">No trophies yet - place on an award podium to earn one.</p>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useAwardsStore, type PlayerTrophyResponse, type AwardScopeType } from '@/stores/awards'
import { formatAwardValue, medalColor } from '@/utils/awards'

const props = defineProps<{
  playerId: string
  ownProfile?: boolean
}>()

const awardsStore = useAwardsStore()

const loading = ref(false)
const trophies = ref<PlayerTrophyResponse[]>([])
/** Result ids whose rank is shared with at least one other player. */
const sharedTrophyIds = ref(new Set<string>())

async function detectSharedRanks(items: PlayerTrophyResponse[]) {
  // The trophy payload carries only this player's row; a rank is "shared"
  // when the award's standings hold another entry at the same rank.
  const shared = new Set<string>()
  await Promise.allSettled(
    items.map(async (trophy) => {
      try {
        const standings = await awardsStore.fetchStandings(
          trophy.award.scope_type as AwardScopeType,
          trophy.award.scope_id,
          trophy.award.id,
          25,
        )
        const atRank = standings.entries.filter((e) => e.rank === trophy.result.rank)
        if (atRank.length > 1) shared.add(trophy.result.id)
      } catch {
        // Standings unavailable (e.g. scope removed) — skip the marker.
      }
    }),
  )
  sharedTrophyIds.value = shared
}

async function fetchData() {
  if (!props.playerId) return
  loading.value = true
  try {
    trophies.value = await awardsStore.fetchPlayerTrophies(props.playerId)
    await detectSharedRanks(trophies.value)
  } catch {
    trophies.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.playerId, fetchData)
onMounted(fetchData)
</script>
