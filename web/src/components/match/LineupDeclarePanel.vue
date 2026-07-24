<template>
  <v-card v-if="userRegistrationId" variant="outlined" class="mb-4">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-clipboard-account</v-icon>
      Declare your lineup
      <v-chip
        v-if="myLineup"
        size="x-small"
        :color="myLineup.status === 'locked' ? 'success' : 'info'"
        variant="tonal"
        class="ml-2"
      >
        {{ myLineup.status }}
      </v-chip>
    </v-card-title>
    <v-divider />
    <v-card-text>
      <p class="text-caption text-medium-emphasis mb-3">
        Tell your opponent who's playing. Optional — the lineup that counts is
        read from the demo. Editable until the match starts.
      </p>

      <v-alert
        v-if="locked"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-0"
      >
        The match has started — your lineup is locked.
      </v-alert>

      <template v-else>
        <div v-if="candidates.length === 0" class="text-caption text-medium-emphasis">
          No roster players found to choose from.
        </div>
        <v-list v-else density="compact" class="py-0">
          <v-list-item
            v-for="c in candidates"
            :key="c.playerId"
            class="px-0"
            @click="toggle(c.playerId)"
          >
            <template #prepend>
              <v-checkbox-btn
                :model-value="selected.includes(c.playerId)"
                density="compact"
                @click.stop="toggle(c.playerId)"
              />
            </template>
            <v-list-item-title class="text-body-2">{{ c.name }}</v-list-item-title>
          </v-list-item>
        </v-list>

        <div class="d-flex align-center mt-3" style="gap: 8px">
          <v-btn
            size="small"
            variant="text"
            :loading="lineupsStore.declareState.loading"
            @click="save(false)"
          >
            Save draft
          </v-btn>
          <v-btn
            size="small"
            color="primary"
            :disabled="selected.length === 0"
            :loading="lineupsStore.declareState.loading"
            @click="save(true)"
          >
            Submit lineup
          </v-btn>
        </div>
        <v-alert
          v-if="lineupsStore.declareState.error"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-2 mb-0"
        >
          {{ lineupsStore.declareState.error }}
        </v-alert>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useLineupsStore } from '@/stores/lineups'
import { useTournamentsStore } from '@/stores/tournaments'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'

const props = defineProps<{
  tournamentId: string
  matchId: string
  userRegistrationId: string | null
}>()

const lineupsStore = useLineupsStore()
const tournamentsStore = useTournamentsStore()
const leagueTeamsStore = useLeagueTeamsStore()

interface Candidate {
  playerId: string
  name: string
}
const candidates = ref<Candidate[]>([])
const selected = ref<string[]>([])

const myLineup = computed(() => lineupsStore.lineupFor(props.userRegistrationId))
const locked = computed(() => myLineup.value?.status === 'locked')

function toggle(playerId: string): void {
  const i = selected.value.indexOf(playerId)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(playerId)
}

/** Resolve the pickable players for the caller's registration. */
async function loadCandidates(): Promise<void> {
  if (!props.userRegistrationId) return
  const reg = tournamentsStore.registrations.find((r) => r.id === props.userRegistrationId)
  if (!reg) return

  if (reg.team_season_id) {
    const members = await leagueTeamsStore.fetchMembers(reg.team_season_id)
    candidates.value = members.map((m) => ({
      playerId: m.player_id,
      name: m.display_name ?? m.player_id,
    }))
  } else if (reg.player_id) {
    // Individual registration: the only candidate is the registered player.
    candidates.value = [{ playerId: reg.player_id, name: reg.participant_name ?? reg.player_id }]
  }

  // Pre-select whatever is already declared.
  if (myLineup.value) {
    selected.value = myLineup.value.players.map((p) => p.player_id)
  }
}

async function save(submit: boolean): Promise<void> {
  if (!props.userRegistrationId) return
  await lineupsStore.declareLineup(props.tournamentId, props.matchId, {
    registration_id: props.userRegistrationId,
    player_ids: selected.value,
    submit,
  })
}

onMounted(async () => {
  await lineupsStore.fetchLineups(props.tournamentId, props.matchId)
  await loadCandidates()
})
watch(() => props.userRegistrationId, loadCandidates)
</script>
