<template>
  <v-dialog v-model="open" max-width="520" persistent>
    <v-card v-if="team">
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Move "{{ team.team_name }}"</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">
          The team keeps its name, tag and roster, and is registered for the season you pick.
          It is withdrawn from any cup in the league it is leaving that has not started yet;
          the move is refused once the team has played a match or a cup it entered has a bracket.
        </p>

        <v-select
          v-model="targetLeagueId"
          aria-label="Target league"
          :items="leagueOptions"
          label="League"
          variant="outlined"
          density="compact"
          :loading="loadingLeagues"
        />

        <v-select
          v-model="targetSeasonId"
          aria-label="Target season"
          :items="seasonOptions"
          label="Season"
          variant="outlined"
          density="compact"
          :disabled="!targetLeagueId"
          :loading="loadingSeasons"
          :hint="targetLeagueId && seasonOptions.length === 0
            ? 'That league has no seasons to move the team into.'
            : undefined"
          persistent-hint
        />
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!targetSeasonId"
          @click="move"
        >
          Move Team
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
import {
  useLeagueTeamsStore,
  type LeagueTeamSummaryResponse,
  type MovedTeamResponse,
} from '@/stores/leagueTeams'
import ErrorAlert from '@/components/ErrorAlert.vue'

const props = defineProps<{
  team: LeagueTeamSummaryResponse | null
}>()

const emit = defineEmits<{ moved: [result: MovedTeamResponse] }>()
const open = defineModel<boolean>({ required: true })

const leaguesStore = useLeaguesStore()
const seasonsStore = useLeagueSeasonsStore()
const teamsStore = useLeagueTeamsStore()

const targetLeagueId = ref<string | null>(null)
const targetSeasonId = ref<string | null>(null)
const seasons = ref<LeagueSeasonResponse[]>([])
const loadingSeasons = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const loadingLeagues = computed(() => leaguesStore.fetchAllLeaguesState.loading)

/** Every league except the one the team is already in. Moving is a
 *  platform-admin action, so the admin listing is the right source. */
const leagueOptions = computed(() =>
  leaguesStore.allLeagues
    .filter(l => l.id !== props.team?.league_id && !l.archived_at)
    .map(l => ({ title: l.name, value: l.id }))
)

const seasonOptions = computed(() =>
  seasons.value.map(s => ({ title: s.name, value: s.id }))
)

watch(open, async (isOpen) => {
  if (!isOpen) return
  targetLeagueId.value = null
  targetSeasonId.value = null
  seasons.value = []
  error.value = null
  if (leaguesStore.allLeagues.length === 0) {
    await leaguesStore.fetchAllLeaguesAdmin().catch(() => {})
  }
})

// The seasons of the chosen league are the only valid destinations, so they
// are re-read rather than filtered from whatever the page happened to hold.
watch(targetLeagueId, async (leagueId) => {
  targetSeasonId.value = null
  seasons.value = []
  if (!leagueId) return
  loadingSeasons.value = true
  try {
    seasons.value = await seasonsStore.fetchSeasons(leagueId)
  } catch {
    error.value = seasonsStore.fetchSeasonsState.error ?? 'Failed to load seasons'
  } finally {
    loadingSeasons.value = false
  }
})

async function move() {
  if (!props.team || !targetLeagueId.value || !targetSeasonId.value) return
  saving.value = true
  error.value = null
  try {
    const result = await teamsStore.moveTeam(props.team.team_id, targetLeagueId.value, targetSeasonId.value)
    emit('moved', result)
    open.value = false
  } catch {
    error.value = teamsStore.moveTeamState.error ?? 'Failed to move team'
  } finally {
    saving.value = false
  }
}

function close() {
  error.value = null
  open.value = false
}
</script>
