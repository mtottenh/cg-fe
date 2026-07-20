<template>
  <v-card>
    <v-card-title>
      <v-icon start>mdi-sword-cross</v-icon>
      Recent Matches
      <v-chip v-if="matches.length > 0" size="small" class="ml-2">{{ matches.length }}</v-chip>
    </v-card-title>
    <v-divider />

    <v-progress-linear v-if="loading" indeterminate />

    <v-list v-if="matches.length > 0" lines="two" density="compact">
      <v-list-item
        v-for="match in matches"
        :key="match.id"
        :to="matchRoute(match)"
      >
        <template v-slot:prepend>
          <v-avatar
            :color="resultColor(match)"
            size="36"
            variant="tonal"
          >
            <v-icon size="small">{{ resultIcon(match) }}</v-icon>
          </v-avatar>
        </template>

        <v-list-item-title class="d-flex align-center">
          <span>{{ match.participant1_name || 'TBD' }}</span>
          <span class="mx-2 text-medium-emphasis">
            <template v-if="match.status === 'completed'">
              {{ match.participant1_score }} - {{ match.participant2_score }}
            </template>
            <template v-else>vs</template>
          </span>
          <span>{{ match.participant2_name || 'TBD' }}</span>
        </v-list-item-title>

        <v-list-item-subtitle>
          <v-chip size="x-small" :color="statusColor(match.status)" variant="tonal" class="mr-1">
            {{ match.status }}
          </v-chip>
          <span class="text-caption">{{ formatDate(match.scheduled_at || match.created_at) }}</span>
        </v-list-item-subtitle>

        <template v-slot:append>
          <v-icon size="small" color="grey">mdi-chevron-right</v-icon>
        </template>
      </v-list-item>
    </v-list>

    <v-card-text v-else-if="!loading" class="text-center text-medium-emphasis py-8">
      <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-sword-cross</v-icon>
      <p>No matches yet</p>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayersStore } from '@/stores/players'
import type { components } from '@/api/types'

type MatchResponse = components['schemas']['TournamentMatchResponse']

const playersStore = usePlayersStore()

const loading = computed(() => playersStore.fetchMyMatchesState.loading)
const { myMatches: matches } = storeToRefs(playersStore)

function matchRoute(match: MatchResponse) {
  // We need the tournament slug — use tournament_id as fallback
  return { name: 'match-detail', params: { tournamentSlug: match.tournament_id, matchId: match.id } }
}

function resultColor(match: MatchResponse): string {
  if (match.status !== 'completed') return 'grey'
  // Can't determine win/loss without knowing which participant is the current user
  return match.winner_registration_id ? 'success' : 'grey'
}

function resultIcon(match: MatchResponse): string {
  if (match.status === 'completed') return 'mdi-check'
  if (match.status === 'in_progress') return 'mdi-play'
  if (match.status === 'scheduled') return 'mdi-calendar'
  return 'mdi-clock'
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return 'success'
    case 'in_progress': return 'primary'
    case 'scheduled': return 'info'
    case 'cancelled': return 'error'
    default: return 'grey'
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

onMounted(() => {
  playersStore.fetchMyMatches({ limit: 10 })
})
</script>
