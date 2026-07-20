<template>
  <v-dialog
    v-model="open"
    max-width="1100"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <div class="d-flex align-center">
          <v-avatar size="32" rounded="sm" class="mr-3">
            <v-img alt="" v-if="league?.league_logo_url" :src="league.league_logo_url" />
            <v-icon v-else>mdi-trophy</v-icon>
          </v-avatar>
          <span>{{ league?.league_name }}</span>
        </div>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-tabs v-model="activeTab" color="primary">
        <v-tab value="seasons">
          <v-icon start>mdi-calendar</v-icon>
          Seasons
          <v-chip v-if="seasons.length > 0" size="x-small" class="ml-2">{{ seasons.length }}</v-chip>
        </v-tab>
        <v-tab value="teams">
          <v-icon start>mdi-account-group</v-icon>
          Teams
          <v-chip v-if="teams.length > 0" size="x-small" class="ml-2">{{ teams.length }}</v-chip>
        </v-tab>
      </v-tabs>

      <v-divider />

      <v-card-text style="min-height: 500px">
        <v-window v-model="activeTab">
          <!-- Seasons Tab -->
          <v-window-item value="seasons">
            <LeagueSeasonsPanel
              :league-id="league?.league_id || ''"
              :seasons="seasons"
              :loading="loadingSeasons"
              @create="openCreateSeasonModal"
              @edit="openEditSeasonModal"
              @view-teams="viewSeasonTeams"
              @refresh="fetchSeasons"
            />
          </v-window-item>

          <!-- Teams Tab -->
          <v-window-item value="teams">
            <LeagueTeamsPanel
              :league-id="league?.league_id || ''"
              :seasons="seasons"
              :selected-season-id="selectedSeasonId"
              :teams="teams"
              :loading="loadingTeams"
              @update:selected-season-id="selectedSeasonId = $event"
              @create="openCreateTeamModal"
              @manage="openTeamDetailModal"
              @refresh="fetchTeams"
            />
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Close</v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>

    </v-card>

    <!-- Season Create Modal -->
    <LeagueSeasonCreateModal
      v-model="createSeasonModalOpen"
      :league-id="league?.league_id || ''"
      @created="onSeasonCreated"
    />

    <!-- Season Edit Modal -->
    <LeagueSeasonEditModal
      v-model="editSeasonModalOpen"
      :season="selectedSeason"
      @saved="onSeasonSaved"
    />

    <!-- Team Create Modal -->
    <LeagueTeamCreateModal
      v-model="createTeamModalOpen"
      :season-id="selectedSeasonId || ''"
      @created="onTeamCreated"
    />

    <!-- Team Detail Modal -->
    <LeagueTeamDetailModal
      v-model="teamDetailModalOpen"
      :team="selectedTeam"
      :season-id="selectedSeasonId || ''"
      @updated="onTeamUpdated"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { type UserLeagueMembership } from '@/stores/leagues'
import {
  useLeagueSeasonsStore,
  type LeagueSeasonResponse,
} from '@/stores/leagueSeasons'
import {
  useLeagueTeamsStore,
  type LeagueTeamSummaryResponse,
} from '@/stores/leagueTeams'
import LeagueSeasonsPanel from './LeagueSeasonsPanel.vue'
import LeagueTeamsPanel from './LeagueTeamsPanel.vue'
import LeagueSeasonCreateModal from './LeagueSeasonCreateModal.vue'
import LeagueSeasonEditModal from './LeagueSeasonEditModal.vue'
import LeagueTeamCreateModal from './LeagueTeamCreateModal.vue'
import LeagueTeamDetailModal from './LeagueTeamDetailModal.vue'

type LeagueSeason = LeagueSeasonResponse
type LeagueTeamSummary = LeagueTeamSummaryResponse

const props = defineProps<{  league: UserLeagueMembership | null
}>()

const emit = defineEmits<{  updated: []
}>()

const open = defineModel<boolean>({ required: true })

// Stores drive the data now; local refs previously mirrored raw-fetch results.
const leagueSeasonsStore = useLeagueSeasonsStore()
const leagueTeamsStore = useLeagueTeamsStore()

// State
const activeTab = ref('seasons')
const error = ref<string | null>(null)

// Seasons + teams come from store collections
const seasons = computed<LeagueSeason[]>(() => leagueSeasonsStore.seasons)
const loadingSeasons = computed(() => leagueSeasonsStore.fetchSeasonsState.loading)
const selectedSeason = ref<LeagueSeason | null>(null)
const createSeasonModalOpen = ref(false)
const editSeasonModalOpen = ref(false)

const teams = computed<LeagueTeamSummary[]>(() => leagueTeamsStore.teams)
const loadingTeams = computed(() => leagueTeamsStore.fetchTeamsInSeasonState.loading)
const selectedSeasonId = ref<string | null>(null)
const selectedTeam = ref<LeagueTeamSummary | null>(null)
const createTeamModalOpen = ref(false)
const teamDetailModalOpen = ref(false)

// Snackbar
const snackbar = useSnackbar()

// Watch for dialog opening
watch(open, async (isOpen) => {
  if (isOpen && props.league) {
    activeTab.value = 'seasons'
    selectedSeasonId.value = null
    await fetchSeasons()
  }
})

// Watch for season selection change
watch(selectedSeasonId, () => {
  if (selectedSeasonId.value) {
    fetchTeams()
  } else {
    leagueTeamsStore.clearTeams()
  }
})

async function fetchSeasons() {
  if (!props.league) return
  try {
    await leagueSeasonsStore.fetchSeasons(props.league.league_id)
    // Auto-select first season if available
    const list = leagueSeasonsStore.seasons
    if (list.length > 0 && !selectedSeasonId.value && list[0]) {
      selectedSeasonId.value = list[0].id
    }
  } catch {
    error.value = leagueSeasonsStore.fetchSeasonsState.error ?? 'Failed to load seasons'
  }
}

async function fetchTeams() {
  if (!selectedSeasonId.value) return
  try {
    await leagueTeamsStore.fetchTeamsInSeason(selectedSeasonId.value)
  } catch {
    error.value = leagueTeamsStore.fetchTeamsInSeasonState.error ?? 'Failed to load teams'
  }
}

// Season handlers
function openCreateSeasonModal() {
  createSeasonModalOpen.value = true
}

function openEditSeasonModal(season: LeagueSeason) {
  selectedSeason.value = season
  editSeasonModalOpen.value = true
}

function viewSeasonTeams(season: LeagueSeason) {
  selectedSeasonId.value = season.id
  activeTab.value = 'teams'
}

function onSeasonCreated() {
  snackbar.show('Season created successfully', 'success')
  fetchSeasons()
  emit('updated')
}

function onSeasonSaved() {
  snackbar.show('Season updated successfully', 'success')
  fetchSeasons()
  emit('updated')
}

// Team handlers
function openCreateTeamModal() {
  createTeamModalOpen.value = true
}

function openTeamDetailModal(team: LeagueTeamSummary) {
  selectedTeam.value = team
  teamDetailModalOpen.value = true
}

function onTeamCreated() {
  snackbar.show('Team created successfully', 'success')
  fetchTeams()
  emit('updated')
}

function onTeamUpdated() {
  snackbar.show('Team updated successfully', 'success')
  fetchTeams()
  emit('updated')
}

// Helpers
function close() {
  error.value = null
  open.value = false
}
</script>
