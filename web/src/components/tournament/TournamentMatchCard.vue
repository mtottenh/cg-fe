<template>
  <v-card
    :class="['match-card', { 'compact': compact, 'clickable': clickable }]"
    :variant="variant"
    @click="handleClick"
  >
    <div class="match-content">
      <!-- Match number and best-of as quiet text (a bracket is a wall of
           these cards, and three chips a card was the loudest thing on it);
           the format still shows in compact mode because per-round formats
           mix Bo1 and Bo3 in one bracket. Only the status is a chip, and a
           finished match wears it as plain text so the live ones stand out. -->
      <div class="match-header d-flex justify-space-between align-center">
        <span class="text-caption text-medium-emphasis">
          #{{ match.match_number }}<template v-if="match.match_format"> · {{ formatMatchFormatShort(match.match_format) }}</template>
        </span>
        <v-chip :color="statusColor" size="x-small" :variant="statusVariant" class="status-chip">
          {{ statusLabel }}
        </v-chip>
      </div>

      <!-- Participants -->
      <div class="participants mt-2">
        <!-- Participant 1 -->
        <div
          :class="['participant', { 'winner': isWinner(match.participant1_registration_id) }]"
        >
          <div class="participant-info">
            <v-avatar size="24" rounded="sm" class="mr-2">
              <v-img alt="" v-if="match.participant1_logo_url" :src="match.participant1_logo_url" />
              <v-icon v-else size="16">mdi-account</v-icon>
            </v-avatar>
            <v-icon
              v-if="isWinner(match.participant1_registration_id)"
              size="x-small"
              color="success"
              class="mr-1"
              aria-label="Winner"
            >mdi-trophy</v-icon>
            <span class="participant-name text-truncate">
              {{ match.participant1_name || 'TBD' }}
              <v-tooltip activator="parent" location="top">{{ match.participant1_name || 'TBD' }}</v-tooltip>
            </span>
            <span v-if="match.participant1_seed" class="seed text-caption text-medium-emphasis ml-1">
              #{{ match.participant1_seed }}
            </span>
          </div>
          <span class="score" :class="{ 'winning': isWinner(match.participant1_registration_id) }">
            {{ showScores ? match.participant1_score : '-' }}
          </span>
        </div>

        <!-- Participant 2 -->
        <div
          :class="['participant', { 'winner': isWinner(match.participant2_registration_id) }]"
        >
          <div class="participant-info">
            <v-avatar size="24" rounded="sm" class="mr-2">
              <v-img alt="" v-if="match.participant2_logo_url" :src="match.participant2_logo_url" />
              <v-icon v-else size="16">mdi-account</v-icon>
            </v-avatar>
            <v-icon
              v-if="isWinner(match.participant2_registration_id)"
              size="x-small"
              color="success"
              class="mr-1"
              aria-label="Winner"
            >mdi-trophy</v-icon>
            <span class="participant-name text-truncate">
              {{ match.participant2_name || 'TBD' }}
              <v-tooltip activator="parent" location="top">{{ match.participant2_name || 'TBD' }}</v-tooltip>
            </span>
            <span v-if="match.participant2_seed" class="seed text-caption text-medium-emphasis ml-1">
              #{{ match.participant2_seed }}
            </span>
          </div>
          <span class="score" :class="{ 'winning': isWinner(match.participant2_registration_id) }">
            {{ showScores ? match.participant2_score : '-' }}
          </span>
        </div>
      </div>

      <!-- Footer info -->
      <div v-if="!compact && (match.scheduled_at || match.match_format)" class="match-footer mt-2">
        <div class="d-flex justify-space-between text-caption text-medium-emphasis">
          <span v-if="match.match_format">{{ formatMatchFormat(match.match_format) }}</span>
          <span v-if="match.scheduled_at">{{ formatDateTime(match.scheduled_at) }}</span>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { matchStatusMap, getStatusColor, getStatusLabel } from '@/utils/statusMaps'
import { formatMatchFormat, formatMatchFormatShort } from '@/utils/matchStatus'
import type { TournamentMatchResponse } from '@/stores/tournaments'

const props = withDefaults(
  defineProps<{
    match: TournamentMatchResponse
    compact?: boolean
    clickable?: boolean
    variant?: 'flat' | 'text' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  }>(),
  {
    compact: false,
    clickable: true,
    variant: 'outlined',
  }
)

const emit = defineEmits<{
  click: [match: TournamentMatchResponse]
}>()

// Status presentation comes from utils/statusMaps.ts (COVERAGE-PLAN.md §9c).
//
// These were two hand-rolled `switch` statements that had drifted from
// `TournamentMatchStatus` (portal-core/src/types/tournament.rs:231-255, mirrored
// by the `tournament_matches_check_status` CHECK in
// migrations/0030_create_tournaments.sql:369). They matched `scheduling`, which
// is NOT a match status, and omitted `ready` and `forfeit`, which ARE — so a
// match in either state hit `default` and leaked the raw enum onto the bracket
// and the tournament Matches tab.
const statusColor = computed(() => getStatusColor(matchStatusMap, props.match.status))

// A live Bo3 at 1-0 should show 1-0 on the card, not "- / -".
const showScores = computed(() =>
  ['in_progress', 'awaiting_result', 'completed', 'disputed'].includes(props.match.status)
)

const statusVariant = computed(() => {
  if (props.match.status === 'in_progress') return 'flat'
  if (props.match.status === 'completed') return 'text'
  return 'tonal'
})

const statusLabel = computed(() => getStatusLabel(matchStatusMap, props.match.status))

function isWinner(registrationId: string | null | undefined): boolean {
  if (!registrationId || !props.match.winner_registration_id) return false
  return props.match.winner_registration_id === registrationId
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function handleClick() {
  if (props.clickable) {
    emit('click', props.match)
  }
}
</script>

<style scoped>
.match-card {
  width: 100%;
  transition: all 0.2s ease;
}

.match-card.clickable:hover {
  cursor: pointer;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.match-card.compact {
  min-width: 180px;
}

.match-card.compact .match-content {
  padding: 8px;
}

.match-content {
  padding: 12px;
}

.match-header {
  margin-bottom: 4px;
}

.participants {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.participant {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  background-color: rgba(var(--v-theme-surface-variant), 0.3);
}

.participant.winner {
  background-color: rgba(var(--v-theme-success), 0.1);
}

.participant-info {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.participant-name {
  /* Use whatever width the card has; truncate only when it really runs out. */
  flex: 1 1 auto;
  min-width: 0;
}

.seed,
.status-chip {
  flex-shrink: 0;
}

.score {
  font-weight: 500;
  font-size: 14px;
  min-width: 20px;
  text-align: center;
}

.score.winning {
  color: rgb(var(--v-theme-success));
  font-weight: 700;
}

.match-footer {
  border-top: 1px solid rgba(var(--v-border-color), 0.1);
  padding-top: 8px;
}
</style>
