<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="1100"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <div class="d-flex align-center">
          <v-avatar size="32" rounded="sm" class="mr-3">
            <v-img v-if="league?.league_logo_url" :src="league.league_logo_url" />
            <v-icon v-else>mdi-trophy</v-icon>
          </v-avatar>
          <span>{{ league?.league_name }}</span>
        </div>
        <v-btn icon variant="text" @click="close">
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

      <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
        {{ snackbarText }}
      </v-snackbar>
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
import { ref, watch } from 'vue'
import { ApiError } from '@/api'
import { type UserLeagueMembership } from '@/stores/leagues'
import LeagueSeasonsPanel from './LeagueSeasonsPanel.vue'
import LeagueTeamsPanel from './LeagueTeamsPanel.vue'
import LeagueSeasonCreateModal from './LeagueSeasonCreateModal.vue'
import LeagueSeasonEditModal from './LeagueSeasonEditModal.vue'
import LeagueTeamCreateModal from './LeagueTeamCreateModal.vue'
import LeagueTeamDetailModal from './LeagueTeamDetailModal.vue'

interface LeagueSeason {
  id: string
  league_id: string
  name: string
  slug: string
  description: string | null
  status: string
  registration_start: string | null
  registration_end: string | null
  season_start: string | null
  season_end: string | null
  team_size_min: number | null
  team_size_max: number | null
  max_substitutes: number | null
  max_teams: number | null
  roster_lock_status: string
  created_by: string
  created_at: string
  updated_at: string
}

interface LeagueTeamSummary {
  team_id: string
  team_name: string
  team_tag: string
  team_logo_url: string | null
  team_status: string
  league_id: string
  owner_player_id: string
  season_id: string | null
  team_season_id: string | null
  season_status: string | null
  roster_lock_status: string | null
  team_size_min: number | null
  team_size_max: number | null
  active_member_count: number
  captain_count: number
  player_count: number
  substitute_count: number
}

const props = defineProps<{
  modelValue: boolean
  league: UserLeagueMembership | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  updated: []
}>()

// State
const activeTab = ref('seasons')
const error = ref<string | null>(null)

// Seasons
const seasons = ref<LeagueSeason[]>([])
const loadingSeasons = ref(false)
const selectedSeason = ref<LeagueSeason | null>(null)
const createSeasonModalOpen = ref(false)
const editSeasonModalOpen = ref(false)

// Teams
const teams = ref<LeagueTeamSummary[]>([])
const loadingTeams = ref(false)
const selectedSeasonId = ref<string | null>(null)
const selectedTeam = ref<LeagueTeamSummary | null>(null)
const createTeamModalOpen = ref(false)
const teamDetailModalOpen = ref(false)

// Snackbar
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Watch for dialog opening
watch(() => props.modelValue, async (isOpen) => {
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
    teams.value = []
  }
})

// API calls
async function fetchSeasons() {
  if (!props.league) return

  loadingSeasons.value = true
  try {
    const response = await fetch(`${API_URL}/v1/league-seasons?league_id=${props.league.league_id}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to fetch seasons')
    }

    const result = await response.json()
    seasons.value = result.data

    // Auto-select first season if available
    if (seasons.value.length > 0 && !selectedSeasonId.value && seasons.value[0]) {
      selectedSeasonId.value = seasons.value[0].id
    }
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to load seasons'
    }
  } finally {
    loadingSeasons.value = false
  }
}

async function fetchTeams() {
  if (!selectedSeasonId.value) return

  loadingTeams.value = true
  try {
    const response = await fetch(`${API_URL}/v1/league-seasons/${selectedSeasonId.value}/teams`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to fetch teams')
    }

    const result = await response.json()
    teams.value = result.data
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to load teams'
    }
  } finally {
    loadingTeams.value = false
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
  showSnackbar('Season created successfully', 'success')
  fetchSeasons()
  emit('updated')
}

function onSeasonSaved() {
  showSnackbar('Season updated successfully', 'success')
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
  showSnackbar('Team created successfully', 'success')
  fetchTeams()
  emit('updated')
}

function onTeamUpdated() {
  showSnackbar('Team updated successfully', 'success')
  fetchTeams()
  emit('updated')
}

// Helpers
function showSnackbar(text: string, color: string) {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

function close() {
  error.value = null
  emit('update:modelValue', false)
}
</script>
