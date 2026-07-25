<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-account-group</v-icon>
      Lineups
      <v-spacer />
      <v-btn
        icon="mdi-refresh"
        size="small"
        variant="text"
        :loading="store.fetchState.loading"
        aria-label="Refresh lineups"
        @click="reload"
      />
    </v-card-title>
    <v-divider />
    <v-card-text>
      <p class="text-caption text-medium-emphasis mb-4">
        Who actually played. A declared lineup becomes visible to the opponent
        once the match starts; per-map lineups are derived from the demo.
      </p>

      <v-row>
        <v-col
          v-for="side in sides"
          :key="side.registrationId ?? side.name"
          cols="12"
          md="6"
        >
          <div class="text-subtitle-2 mb-1 d-flex align-center">
            {{ side.name }}
            <v-chip
              v-if="side.lineup"
              size="x-small"
              :color="statusColor(side.lineup.status)"
              variant="tonal"
              class="ml-2"
            >
              {{ getStatusLabel(lineupStatusMap, side.lineup.status) }}
            </v-chip>
          </div>

          <div v-if="!side.lineup" class="text-caption text-medium-emphasis">
            No lineup yet.
          </div>

          <div
            v-else-if="!side.lineup.players_visible"
            class="text-caption text-medium-emphasis d-flex align-center"
          >
            <v-icon size="x-small" start>mdi-lock-outline</v-icon>
            Hidden until the match starts.
          </div>

          <v-list v-else density="compact" class="py-0">
            <v-list-item
              v-for="p in side.lineup.players"
              :key="p.id"
              class="px-0"
            >
              <template #prepend>
                <v-icon
                  size="small"
                  :color="p.is_substitute ? 'warning' : 'success'"
                >
                  {{ p.is_substitute ? 'mdi-account-arrow-right' : 'mdi-account-check' }}
                </v-icon>
              </template>
              <v-list-item-title class="text-body-2">
                {{ p.player_id }}
                <v-chip
                  v-if="p.is_substitute"
                  size="x-small"
                  color="warning"
                  variant="tonal"
                  class="ml-1"
                >
                  sub
                </v-chip>
                <span
                  v-if="p.game_number != null"
                  class="text-caption text-medium-emphasis ml-1"
                >
                  map {{ p.game_number }}
                </span>
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { lineupStatusMap, getStatusLabel } from '@/utils/statusMaps'
import { computed, onMounted, watch } from 'vue'
import { useLineupsStore, type LineupStatus } from '@/stores/lineups'

const props = defineProps<{
  tournamentId: string
  matchId: string
  participant1RegistrationId?: string | null
  participant2RegistrationId?: string | null
  participant1Name?: string | null
  participant2Name?: string | null
}>()

const store = useLineupsStore()

const sides = computed(() => [
  {
    name: props.participant1Name || 'Team 1',
    registrationId: props.participant1RegistrationId ?? null,
    lineup: store.lineupFor(props.participant1RegistrationId),
  },
  {
    name: props.participant2Name || 'Team 2',
    registrationId: props.participant2RegistrationId ?? null,
    lineup: store.lineupFor(props.participant2RegistrationId),
  },
])

function statusColor(status: LineupStatus): string {
  switch (status) {
    case 'locked':
      return 'success'
    case 'submitted':
      return 'info'
    default:
      return 'grey'
  }
}

async function reload(): Promise<void> {
  await store.fetchLineups(props.tournamentId, props.matchId)
}

onMounted(reload)
watch(() => props.matchId, reload)
</script>
