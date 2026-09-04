<template>
  <v-dialog v-model="open" max-width="520" persistent>
    <v-card v-if="tournament">
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Move "{{ tournament.name }}"</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Re-files the tournament under another league, or detaches it from every league.
          Refused once anyone has registered — an entry belongs to a team in its league's
          season, and would be stranded by the move.
        </p>

        <v-select
          v-model="targetLeagueId"
          aria-label="Target league"
          :items="leagueOptions"
          label="League"
          variant="outlined"
          density="compact"
          clearable
          :loading="loadingLeagues"
          hint="Clear it to make this a standalone tournament."
          persistent-hint
        />

        <v-select
          v-model="targetSeasonId"
          aria-label="Target season"
          :items="seasonOptions"
          label="Season (optional)"
          variant="outlined"
          density="compact"
          clearable
          class="mt-4"
          :disabled="!targetLeagueId"
          :loading="loadingSeasons"
        />
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" @click="move">
          Move Tournament
        </v-btn>
      </v-card-actions>

      <ErrorAlert :error="error" class="ma-4" @clear="error = null" />
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLeaguesStore } from '@/stores/leagues'
import { useLeagueSeasonsStore, type LeagueSeasonResponse } from '@/stores/leagueSeasons'
import { useTournamentsStore, type TournamentSummaryResponse } from '@/stores/tournaments'
import ErrorAlert from '@/components/ErrorAlert.vue'

const props = defineProps<{
  tournament: TournamentSummaryResponse | null
}>()

const emit = defineEmits<{ moved: [] }>()
const open = defineModel<boolean>({ required: true })

const leaguesStore = useLeaguesStore()
const seasonsStore = useLeagueSeasonsStore()
const tournamentsStore = useTournamentsStore()

const targetLeagueId = ref<string | null>(null)
const targetSeasonId = ref<string | null>(null)
const seasons = ref<LeagueSeasonResponse[]>([])
const loadingSeasons = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const loadingLeagues = computed(() => leaguesStore.fetchAllLeaguesState.loading)

const leagueOptions = computed(() =>
  leaguesStore.allLeagues
    .filter(l => !l.archived_at)
    .map(l => ({ title: l.name, value: l.id }))
)

const seasonOptions = computed(() =>
  seasons.value.map(s => ({ title: s.name, value: s.id }))
)

watch(open, async (isOpen) => {
  if (!isOpen) return
  // Start from where the tournament is, so "change the season only" is a
  // one-field edit rather than a re-entry of both.
  targetLeagueId.value = props.tournament?.league_id ?? null
  targetSeasonId.value = props.tournament?.season_id ?? null
  error.value = null
  if (leaguesStore.allLeagues.length === 0) {
    await leaguesStore.fetchAllLeaguesAdmin().catch(() => {})
  }
  if (targetLeagueId.value) await loadSeasons(targetLeagueId.value)
})

watch(targetLeagueId, async (leagueId, previous) => {
  if (leagueId === previous) return
  targetSeasonId.value = null
  seasons.value = []
  if (leagueId) await loadSeasons(leagueId)
})

async function loadSeasons(leagueId: string) {
  loadingSeasons.value = true
  try {
    seasons.value = await seasonsStore.fetchSeasons(leagueId)
  } catch {
    error.value = seasonsStore.fetchSeasonsState.error ?? 'Failed to load seasons'
  } finally {
    loadingSeasons.value = false
  }
}

async function move() {
  if (!props.tournament) return
  saving.value = true
  error.value = null
  try {
    await tournamentsStore.moveTournament(
      props.tournament.id,
      targetLeagueId.value,
      targetLeagueId.value ? targetSeasonId.value : null,
    )
    emit('moved')
    open.value = false
  } catch {
    error.value = tournamentsStore.moveTournamentState.error ?? 'Failed to move tournament'
  } finally {
    saving.value = false
  }
}

function close() {
  error.value = null
  open.value = false
}
</script>
