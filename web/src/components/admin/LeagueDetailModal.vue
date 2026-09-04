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
              @set-archived="setSeasonArchived"
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
              :include-archived="includeArchivedTeams"
              @update:selected-season-id="selectedSeasonId = $event"
              @update:include-archived="setIncludeArchivedTeams"
              @create="openCreateTeamModal"
              @manage="openTeamDetailModal"
              :can-move="authStore.isAdmin"
              @set-archived="setTeamArchived"
              @move="openMoveTeamModal"
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

    <MoveTeamModal
      v-model="moveTeamModalOpen"
      :team="selectedTeam"
      @moved="onTeamMoved"
    />

    <ConfirmDialogHost :dialog="confirmDialog" />

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
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
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
import MoveTeamModal from './MoveTeamModal.vue'
import { useAuthStore } from '@/stores/auth'

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
const authStore = useAuthStore()

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
/** Archived teams are hidden by default even here: this listing doubles as
 *  the roster view. Turning it on is how an archived team is reached to be
 *  restored. */
const includeArchivedTeams = ref(false)
const createTeamModalOpen = ref(false)
const teamDetailModalOpen = ref(false)
const moveTeamModalOpen = ref(false)

// Snackbar
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

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
    // Operator view: archived seasons are listed (greyed), because this is
    // where they are restored from.
    await leagueSeasonsStore.fetchSeasons(props.league.league_id, true)
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
    await leagueTeamsStore.fetchTeamsInSeason(
      selectedSeasonId.value,
      1,
      20,
      includeArchivedTeams.value,
    )
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

function openMoveTeamModal(team: LeagueTeamSummary) {
  selectedTeam.value = team
  moveTeamModalOpen.value = true
}

function onTeamMoved() {
  snackbar.show('Team moved', 'success')
  fetchTeams()
  emit('updated')
}

function onTeamUpdated() {
  snackbar.show('Team updated successfully', 'success')
  fetchTeams()
  emit('updated')
}

/** Archive or restore a season. Confirm-gated in the archiving direction
 *  only: putting something away is the direction that surprises people. */
function setSeasonArchived(season: LeagueSeason, archived: boolean) {
  if (!archived) {
    void runSeasonArchive(season, false)
    return
  }
  confirmDialog.confirm({
    title: `Archive "${season.name}"?`,
    message:
      'The season stops appearing to players, along with its teams. Nothing is deleted, its ' +
      'status is unchanged, and you can restore it from this panel.',
    action: 'Archive',
    handler: () => runSeasonArchive(season, true),
  })
}

async function runSeasonArchive(season: LeagueSeason, archived: boolean) {
  await leagueSeasonsStore.setSeasonArchived(season.id, archived)
  snackbar.show(archived ? 'Season archived' : 'Season restored', 'success')
  await fetchSeasons()
  emit('updated')
}

function setIncludeArchivedTeams(value: boolean) {
  includeArchivedTeams.value = value
  fetchTeams()
}

/** Archive or restore a team. Confirm-gated in the archiving direction only. */
function setTeamArchived(team: LeagueTeamSummary, archived: boolean) {
  if (!archived) {
    void runTeamArchive(team, false)
    return
  }
  confirmDialog.confirm({
    title: `Archive "${team.team_name}"?`,
    message:
      'The team stops appearing to players and in this roster. Nothing is deleted and the ' +
      'team is not disbanded — turn on "Show archived" here to restore it.',
    action: 'Archive',
    handler: () => runTeamArchive(team, true),
  })
}

async function runTeamArchive(team: LeagueTeamSummary, archived: boolean) {
  await leagueTeamsStore.setTeamArchived(team.team_id, archived)
  snackbar.show(archived ? 'Team archived' : 'Team restored', 'success')
  await fetchTeams()
  emit('updated')
}

// Helpers
function close() {
  error.value = null
  open.value = false
}
</script>
