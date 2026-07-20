<template>
  <v-card variant="outlined">
    <!-- Banner -->
    <div class="tournament-banner">
      <v-img :alt="`${tournament.name} banner`"
        v-if="tournament.banner_url"
        :src="tournament.banner_url"
        height="200"
        cover
        class="banner-image"
      />
      <div v-else class="banner-placeholder d-flex align-center justify-center">
        <v-icon size="80" color="grey-lighten-1">mdi-tournament</v-icon>
      </div>

      <!-- Status Badge -->
      <v-chip
        :color="statusColor"
        size="large"
        class="status-badge"
        :variant="tournament.status === 'in_progress' ? 'flat' : 'elevated'"
      >
        <v-icon v-if="tournament.status === 'in_progress'" start>mdi-circle</v-icon>
        {{ statusLabel }}
      </v-chip>
    </div>

    <v-card-text>
      <v-row align="center">
        <v-col cols="auto">
          <!-- Logo -->
          <v-avatar size="80" rounded="lg">
            <v-img :alt="`${tournament.name} logo`" v-if="tournament.logo_url" :src="tournament.logo_url" />
            <v-icon v-else size="48">mdi-tournament</v-icon>
          </v-avatar>
        </v-col>

        <v-col>
          <!-- Game Badge -->
          <div v-if="game" class="d-flex align-center mb-2">
            <v-avatar size="24" rounded="sm" class="mr-2">
              <v-img alt="" v-if="game.icon_url" :src="game.icon_url" />
              <v-icon v-else size="16">mdi-gamepad-variant</v-icon>
            </v-avatar>
            <span class="text-subtitle-2 text-medium-emphasis">{{ game.display_name }}</span>
          </div>

          <!-- Title -->
          <h1 class="text-h4 font-weight-bold mb-2">{{ tournament.name }}</h1>

          <!-- Quick Info -->
          <div class="d-flex flex-wrap ga-3 align-center">
            <v-chip variant="tonal">
              <v-icon start size="small">mdi-tournament</v-icon>
              {{ formatLabel }}
            </v-chip>

            <v-chip variant="tonal">
              <v-icon start size="small">{{ participantIcon }}</v-icon>
              {{ participantLabel }}
            </v-chip>

            <v-chip variant="tonal">
              <v-icon start size="small">mdi-account-multiple</v-icon>
              {{ tournament.max_participants }} max
            </v-chip>

            <v-chip v-if="tournament.starts_at" variant="tonal">
              <v-icon start size="small">mdi-calendar</v-icon>
              {{ formatStartDate }}
            </v-chip>
          </div>
        </v-col>

        <v-col cols="auto" class="d-none d-md-flex">
          <!-- Share Button -->
          <v-btn aria-label="Share tournament" icon variant="tonal" @click="share">
            <v-icon>mdi-share-variant</v-icon>
          </v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TournamentResponse } from '@/stores/tournaments'
import type { GameSummary } from '@/stores/games'

const props = defineProps<{
  tournament: TournamentResponse
  game?: GameSummary
}>()

const statusColor = computed(() => {
  switch (props.tournament.status) {
    case 'draft':
      return 'grey'
    case 'published':
      return 'info'
    case 'registration_open':
      return 'success'
    case 'registration_closed':
      return 'warning'
    case 'check_in_open':
      return 'primary'
    case 'ready':
      return 'secondary'
    case 'in_progress':
      return 'primary'
    case 'completed':
      return 'success'
    case 'cancelled':
      return 'error'
    default:
      return 'grey'
  }
})

const statusLabel = computed(() => {
  switch (props.tournament.status) {
    case 'draft':
      return 'Coming Soon'
    case 'published':
      return 'Announced'
    case 'registration_open':
      return 'Registration Open'
    case 'registration_closed':
      return 'Registration Closed'
    case 'check_in_open':
      return 'Check-in Open'
    case 'ready':
      return 'Starting Soon'
    case 'in_progress':
      return 'Live Now'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return props.tournament.status
  }
})

const formatLabel = computed(() => {
  switch (props.tournament.format) {
    case 'single_elimination':
      return 'Single Elimination'
    case 'double_elimination':
      return 'Double Elimination'
    case 'round_robin':
      return 'Round Robin'
    case 'swiss':
      return 'Swiss'
    case 'groups_and_playoffs':
      return 'Groups & Playoffs'
    default:
      return props.tournament.format
  }
})

const participantIcon = computed(() => {
  return props.tournament.participant_type === 'team' ? 'mdi-account-group' : 'mdi-account'
})

const participantLabel = computed(() => {
  if (props.tournament.participant_type === 'team') {
    return `Teams (${props.tournament.team_size})`
  }
  return 'Solo'
})

const formatStartDate = computed(() => {
  if (!props.tournament.starts_at) return ''
  return new Date(props.tournament.starts_at).toLocaleDateString(undefined, {
    weekday: 'long',
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
.tournament-banner {
  position: relative;
}

.banner-image {
  filter: brightness(0.8);
}

.banner-placeholder {
  height: 200px;
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.2), rgba(var(--v-theme-secondary), 0.2));
}

.status-badge {
  position: absolute;
  bottom: -16px;
  right: 16px;
}
</style>
