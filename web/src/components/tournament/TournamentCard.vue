<template>
  <v-card
    class="tournament-card"
    :class="{ 'clickable': clickable }"
    variant="outlined"
    hover
    @click="handleClick"
  >
    <!-- Banner/Logo -->
    <div class="tournament-banner">
      <v-img :alt="`${tournament.name} logo`"
        v-if="tournament.logo_url"
        :src="tournament.logo_url"
        height="120"
        cover
      />
      <div v-else class="banner-placeholder d-flex align-center justify-center">
        <v-icon size="48" color="grey-lighten-1">mdi-tournament</v-icon>
      </div>

      <!-- Status Badge -->
      <v-chip
        :color="statusColor"
        size="small"
        class="status-badge"
        :variant="tournament.status === 'in_progress' ? 'flat' : 'tonal'"
      >
        <v-icon v-if="tournament.status === 'in_progress'" start size="small">mdi-circle</v-icon>
        {{ statusLabel }}
      </v-chip>
    </div>

    <v-card-text>
      <!-- Game Badge -->
      <div class="d-flex align-center mb-2">
        <v-avatar size="20" rounded="sm" class="mr-2">
          <v-img alt="" v-if="game?.icon_url" :src="game.icon_url" />
          <v-icon v-else size="14">mdi-gamepad-variant</v-icon>
        </v-avatar>
        <span class="text-caption text-medium-emphasis">{{ game?.display_name || 'Unknown Game' }}</span>
      </div>

      <!-- Tournament Name -->
      <h3 class="text-subtitle-1 font-weight-bold mb-2 text-truncate">
        {{ tournament.name }}
      </h3>

      <!-- Info Row -->
      <div class="d-flex flex-wrap ga-2 mb-2">
        <v-chip size="x-small" variant="tonal">
          {{ formatLabel }}
        </v-chip>
        <v-chip size="x-small" variant="tonal">
          <v-icon start size="12">{{ participantIcon }}</v-icon>
          {{ participantLabel }}
        </v-chip>
        <v-chip size="x-small" variant="tonal">
          {{ tournament.max_participants }} max
        </v-chip>
      </div>

      <!-- Start Date -->
      <div v-if="tournament.starts_at" class="d-flex align-center text-caption text-medium-emphasis">
        <v-icon size="14" class="mr-1">mdi-calendar</v-icon>
        {{ formatStartDate }}
      </div>
      <div v-else class="text-caption text-medium-emphasis">
        Start date TBD
      </div>
    </v-card-text>

    <!-- Registration CTA -->
    <v-card-actions v-if="tournament.is_registration_open">
      <v-btn color="success" variant="tonal" block size="small">
        <v-icon start size="small">mdi-account-plus</v-icon>
        Register Now
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGamesStore, type GameSummary } from '@/stores/games'
import type { TournamentSummaryResponse } from '@/stores/tournaments'

const gamesStore = useGamesStore()

const props = withDefaults(
  defineProps<{
    tournament: TournamentSummaryResponse
    clickable?: boolean
  }>(),
  {
    clickable: true,
  }
)

const emit = defineEmits<{
  click: [tournament: TournamentSummaryResponse]
}>()

const game = computed<GameSummary | undefined>(() => {
  return gamesStore.games.find((g) => g.id === props.tournament.game_id)
})

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
      return 'Register Now'
    case 'registration_closed':
      return 'Registration Closed'
    case 'check_in_open':
      return 'Check-in Open'
    case 'ready':
      return 'Starting Soon'
    case 'in_progress':
      return 'Live'
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
      return 'Single Elim'
    case 'double_elimination':
      return 'Double Elim'
    case 'round_robin':
      return 'Round Robin'
    case 'swiss':
      return 'Swiss'
    case 'groups_and_playoffs':
      return 'Groups + Playoffs'
    default:
      return props.tournament.format
  }
})

const participantIcon = computed(() => {
  return props.tournament.participant_type === 'team' ? 'mdi-account-group' : 'mdi-account'
})

const participantLabel = computed(() => {
  return props.tournament.participant_type === 'team' ? 'Teams' : 'Solo'
})

const formatStartDate = computed(() => {
  if (!props.tournament.starts_at) return ''
  const date = new Date(props.tournament.starts_at)
  const now = new Date()
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return date.toLocaleDateString()
  } else if (diffDays === 0) {
    return 'Today ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Tomorrow ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' })
  } else {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
})

function handleClick() {
  if (props.clickable) {
    emit('click', props.tournament)
  }
}
</script>

<style scoped>
.tournament-card {
  transition: all 0.2s ease;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tournament-card.clickable:hover {
  cursor: pointer;
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
}

.tournament-banner {
  position: relative;
}

.banner-placeholder {
  height: 120px;
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.1), rgba(var(--v-theme-secondary), 0.1));
}

.status-badge {
  position: absolute;
  top: 8px;
  right: 8px;
}

.v-card-text {
  flex: 1;
}
</style>
