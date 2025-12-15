<template>
  <v-card
    :class="['match-card', { 'compact': compact, 'clickable': clickable }]"
    :variant="variant"
    @click="handleClick"
  >
    <div class="match-content">
      <!-- Match number and status -->
      <div class="match-header d-flex justify-space-between align-center">
        <v-chip size="x-small" variant="tonal" color="grey">
          #{{ match.match_number }}
        </v-chip>
        <v-chip :color="statusColor" size="x-small" :variant="statusVariant">
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
              <v-img v-if="match.participant1_logo_url" :src="match.participant1_logo_url" />
              <v-icon v-else size="16">mdi-account</v-icon>
            </v-avatar>
            <span class="participant-name text-truncate">
              {{ match.participant1_name || 'TBD' }}
            </span>
            <v-chip v-if="match.participant1_seed" size="x-small" variant="text" class="ml-1">
              #{{ match.participant1_seed }}
            </v-chip>
          </div>
          <span class="score" :class="{ 'winning': isWinner(match.participant1_registration_id) }">
            {{ match.status === 'completed' ? match.participant1_score : '-' }}
          </span>
        </div>

        <!-- Participant 2 -->
        <div
          :class="['participant', { 'winner': isWinner(match.participant2_registration_id) }]"
        >
          <div class="participant-info">
            <v-avatar size="24" rounded="sm" class="mr-2">
              <v-img v-if="match.participant2_logo_url" :src="match.participant2_logo_url" />
              <v-icon v-else size="16">mdi-account</v-icon>
            </v-avatar>
            <span class="participant-name text-truncate">
              {{ match.participant2_name || 'TBD' }}
            </span>
            <v-chip v-if="match.participant2_seed" size="x-small" variant="text" class="ml-1">
              #{{ match.participant2_seed }}
            </v-chip>
          </div>
          <span class="score" :class="{ 'winning': isWinner(match.participant2_registration_id) }">
            {{ match.status === 'completed' ? match.participant2_score : '-' }}
          </span>
        </div>
      </div>

      <!-- Footer info -->
      <div v-if="!compact && (match.scheduled_at || match.match_format)" class="match-footer mt-2">
        <div class="d-flex justify-space-between text-caption text-grey">
          <span v-if="match.match_format">{{ formatMatchFormat(match.match_format) }}</span>
          <span v-if="match.scheduled_at">{{ formatDateTime(match.scheduled_at) }}</span>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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

const statusColor = computed(() => {
  switch (props.match.status) {
    case 'pending':
      return 'grey'
    case 'scheduling':
      return 'info'
    case 'scheduled':
      return 'primary'
    case 'checking_in':
      return 'warning'
    case 'pick_ban':
      return 'info'
    case 'in_progress':
      return 'primary'
    case 'awaiting_result':
      return 'warning'
    case 'completed':
      return 'success'
    case 'cancelled':
      return 'error'
    case 'disputed':
      return 'error'
    default:
      return 'grey'
  }
})

const statusVariant = computed(() => {
  return props.match.status === 'in_progress' ? 'flat' : 'tonal'
})

const statusLabel = computed(() => {
  switch (props.match.status) {
    case 'pending':
      return 'Pending'
    case 'scheduling':
      return 'Scheduling'
    case 'scheduled':
      return 'Scheduled'
    case 'checking_in':
      return 'Check-in'
    case 'pick_ban':
      return 'Pick/Ban'
    case 'in_progress':
      return 'Live'
    case 'awaiting_result':
      return 'Awaiting Result'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    case 'disputed':
      return 'Disputed'
    default:
      return props.match.status
  }
})

function isWinner(registrationId: string | null | undefined): boolean {
  if (!registrationId || !props.match.winner_registration_id) return false
  return props.match.winner_registration_id === registrationId
}

function formatMatchFormat(format: string): string {
  switch (format) {
    case 'bo1':
      return 'Bo1'
    case 'bo3':
      return 'Bo3'
    case 'bo5':
      return 'Bo5'
    case 'bo7':
      return 'Bo7'
    default:
      return format
  }
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
  max-width: 100px;
}

.compact .participant-name {
  max-width: 80px;
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
