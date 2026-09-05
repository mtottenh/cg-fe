<template>
  <v-card variant="outlined">
    <v-card-text class="d-flex align-center ga-5 flex-wrap">
      <v-avatar size="56" rounded="lg" class="flex-shrink-0 header-tile">
        <v-img :alt="`${tournament.name} logo`" v-if="tournament.logo_url" :src="tournament.logo_url" />
        <v-icon v-else size="32">mdi-tournament</v-icon>
      </v-avatar>

      <div class="flex-grow-1" style="min-width: 280px">
        <div class="d-flex align-center ga-3 flex-wrap">
          <h1 class="text-h5 font-weight-medium">{{ tournament.name }}</h1>
          <v-chip v-if="game" size="small" variant="tonal">
            <v-avatar v-if="game.icon_url" start size="16" rounded="sm"><v-img alt="" :src="game.icon_url" /></v-avatar>
            <v-icon v-else start size="small">mdi-gamepad-variant</v-icon>
            {{ game.display_name }}
          </v-chip>
        </div>
        <div class="text-body-2 mt-1" data-testid="tournament-scope-line">
          <template v-for="(part, i) in metaParts" :key="i">
            <span v-if="i > 0" class="text-medium-emphasis"> · </span>
            <span :class="part.strong ? 'font-weight-bold' : ''">{{ part.text }}</span>
          </template>
        </div>
      </div>

      <div class="d-flex flex-column align-end ga-1 flex-shrink-0">
        <div class="d-flex align-center ga-2">
          <v-chip :color="statusColor" :variant="tournament.status === 'in_progress' ? 'flat' : 'tonal'" class="status-badge">
            <v-icon v-if="tournament.status === 'in_progress'" start size="small">mdi-circle</v-icon>
            {{ statusLabel }}<template v-if="closesLabel"> · {{ closesLabel }}</template>
          </v-chip>
          <v-btn aria-label="Share tournament" icon size="small" variant="text" @click="share">
            <v-icon size="small">mdi-share-variant</v-icon>
          </v-btn>
        </div>
        <span class="text-caption text-medium-emphasis d-flex align-center ga-1">
          <v-icon size="14">mdi-calendar</v-icon>
          {{ tournament.starts_at ? `Starts ${formatStartDate}` : 'Start date to be announced' }}
        </span>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { tournamentPublicStatusMap, tournamentStatusMap, getStatusColor, getStatusLabel } from '@/utils/statusMaps'
import { formatMatchFormat } from '@/utils/matchStatus'
import type { TournamentResponse } from '@/stores/tournaments'
import type { GameSummary } from '@/stores/games'

const props = withDefaults(
  defineProps<{
    tournament: TournamentResponse
    game?: GameSummary
    /** The league and season this cup runs inside — the one thing the old header left out. */
    leagueName?: string | null
    seasonName?: string | null
    /** Live entries, for "3 / 8 in". */
    enteredCount?: number | null
  }>(),
  { game: undefined, leagueName: null, seasonName: null, enteredCount: null },
)

// Status presentation comes from utils/statusMaps.ts (public voice first,
// admin map as the fallback so an unmapped status never leaks the enum).
const statusColor = computed(
  () =>
    tournamentPublicStatusMap[props.tournament.status]?.color ??
    getStatusColor(tournamentStatusMap, props.tournament.status),
)
const statusLabel = computed(
  () =>
    tournamentPublicStatusMap[props.tournament.status]?.label ??
    getStatusLabel(tournamentStatusMap, props.tournament.status),
)

const formatLabel = computed(() => {
  switch (props.tournament.format) {
    case 'single_elimination': return 'Single elimination'
    case 'double_elimination': return 'Double elimination'
    case 'round_robin': return 'Round robin'
    case 'swiss': return 'Swiss'
    case 'groups_and_playoffs': return 'Groups & playoffs'
    default: return props.tournament.format
  }
})

const metaParts = computed(() => {
  const parts: Array<{ text: string; strong?: boolean }> = []
  if (props.leagueName) parts.push({ text: props.leagueName })
  if (props.seasonName) parts.push({ text: props.seasonName })
  parts.push({ text: formatLabel.value })
  parts.push({ text: formatMatchFormat(props.tournament.default_match_format) })
  parts.push({
    text: props.tournament.participant_type === 'team'
      ? `Teams of ${props.tournament.team_size ?? '?'}`
      : 'Solo',
  })
  if (props.enteredCount != null) {
    parts.push({ text: `${props.enteredCount} / ${props.tournament.max_participants} in`, strong: true })
  }
  return parts
})

const closesLabel = computed(() => {
  if (!props.tournament.is_registration_open || !props.tournament.registration_end) return null
  return `closes ${new Date(props.tournament.registration_end).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
})

const formatStartDate = computed(() => {
  if (!props.tournament.starts_at) return ''
  return new Date(props.tournament.starts_at).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})

function share() {
  if (navigator.share) {
    navigator.share({
      title: props.tournament.name,
      url: window.location.href,
    })
  } else {
    navigator.clipboard.writeText(window.location.href)
  }
}
</script>

<style scoped>
.header-tile {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.35), rgba(var(--v-theme-secondary), 0.35));
}
</style>
