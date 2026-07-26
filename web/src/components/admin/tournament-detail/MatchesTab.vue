<template>
  <v-card-text>
    <div v-if="hasEligibleMatches" class="mb-4">
      <v-btn
        color="primary"
        prepend-icon="mdi-play-circle"
        :loading="bulkStartLoading"
        @click="$emit('bulk-start')"
      >
        Start All Matches
      </v-btn>
    </div>
    <v-data-table
      :headers="headers"
      :items="matches"
      :loading="loading"
      :items-per-page="-1"
      density="comfortable"
    >
      <!-- P-85: rows carried no stable identity, so tests could only address
           them by participant name — ambiguous the moment a winner advances into
           a later round, which forced a two-name filter. The full match id is the
           only safe anchor: UUID v7 prefixes are timestamps, so ids created
           seconds apart share their first characters (§2). -->
      <template v-slot:item.match_number="{ item }">
        <v-chip size="small" variant="tonal" :data-testid="`match-row-${item.id}`">
          #{{ item.match_number }}
        </v-chip>
      </template>

      <template v-slot:item.participants="{ item }">
        <div class="d-flex align-center">
          <span :class="{ 'font-weight-bold': item.winner_registration_id === item.participant1_registration_id }">
            {{ item.participant1_name || 'TBD' }}
          </span>
          <span class="mx-2">vs</span>
          <span :class="{ 'font-weight-bold': item.winner_registration_id === item.participant2_registration_id }">
            {{ item.participant2_name || 'TBD' }}
          </span>
        </div>
      </template>

      <template v-slot:item.match_format="{ item }">
        <v-chip v-if="item.match_format" size="small" variant="tonal" color="primary">
          {{ formatMatchFormatShort(item.match_format) }}
        </v-chip>
      </template>

      <template v-slot:item.score="{ item }">
        <span v-if="item.status === 'completed'">
          {{ item.participant1_score }} - {{ item.participant2_score }}
        </span>
        <span v-else class="text-medium-emphasis">-</span>
      </template>

      <template v-slot:item.status="{ item }">
        <v-chip :color="getMatchStatusColor(item.status)" size="small">
          {{ formatMatchStatus(item.status) }}
        </v-chip>
      </template>

      <template v-slot:item.scheduled_at="{ item }">
        {{ item.scheduled_at ? formatDateTime(item.scheduled_at) : 'Not scheduled' }}
      </template>

      <template v-slot:item.actions="{ item }">
        <div class="d-flex ga-1">
          <v-btn aria-label="View match details" icon size="small" variant="text" @click="$emit('view-detail', item.id)">
            <v-icon>mdi-eye</v-icon>
            <v-tooltip activator="parent" location="top">View Details</v-tooltip>
          </v-btn>
          <v-menu v-if="getNextMatchStatus(item.status)">
            <template v-slot:activator="{ props: menuProps }">
              <v-btn
                size="small"
                variant="tonal"
                :color="getMatchActionColor(item.status)"
                v-bind="menuProps"
                :loading="matchTransitionLoadingId === item.id"
                :disabled="matchTransitionLoadingId !== null && matchTransitionLoadingId !== item.id"
              >
                {{ getMatchActionLabel(item.status) }}
                <v-icon end size="small">mdi-chevron-down</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item @click="$emit('transition', item.id, getNextMatchStatus(item.status)!)">
                <v-list-item-title>{{ getMatchActionLabel(item.status) }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
      </template>

      <template v-slot:no-data>
        <div class="text-center pa-4">
          <p class="text-medium-emphasis">No matches generated yet</p>
        </div>
      </template>
    </v-data-table>
  </v-card-text>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TournamentMatchResponse } from '@/stores/tournaments'
import { formatDateTime } from '@/utils/formatters'
import {
  getMatchStatusColor, formatMatchStatus, formatMatchFormatShort,
  getNextMatchStatus, getMatchActionLabel, getMatchActionColor,
} from '@/utils/matchStatus'

const props = defineProps<{
  matches: TournamentMatchResponse[]
  loading: boolean
  tournamentStatus: string | undefined
  bulkStartLoading: boolean
  matchTransitionLoadingId: string | null
}>()

defineEmits<{
  'view-detail': [matchId: string]
  'transition': [matchId: string, toStatus: string]
  'bulk-start': []
}>()

const hasEligibleMatches = computed(() => {
  if (props.tournamentStatus !== 'in_progress') return false
  return props.matches.some((m) => ['pending', 'ready', 'scheduled'].includes(m.status))
})

const headers = [
  { title: 'Match', key: 'match_number', width: '80px' },
  { title: 'Participants', key: 'participants' },
  { title: 'Format', key: 'match_format', width: '90px' },
  { title: 'Score', key: 'score', width: '100px' },
  { title: 'Status', key: 'status', width: '120px' },
  { title: 'Scheduled', key: 'scheduled_at', width: '150px' },
  { title: 'Actions', key: 'actions', width: '200px', sortable: false },
]
</script>
