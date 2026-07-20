<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">All Teams</h1>
    </div>

    <ErrorAlert :error="error" retryable @clear="error = null" @retry="fetchTeams()" />

    <!-- Filters -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row>
          <v-col cols="12" md="4">
            <v-select
              v-model="selectedLeagueId"
              :items="myLeagues"
              item-title="league_name"
              item-value="league_id"
              label="Select League"
              variant="outlined"
              density="compact"
              clearable
              prepend-inner-icon="mdi-trophy"
              :loading="loadingLeagues"
              @update:model-value="onLeagueChange"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-select
              v-model="selectedSeasonId"
              :items="seasons"
              item-title="name"
              item-value="id"
              label="Select Season"
              variant="outlined"
              density="compact"
              clearable
              prepend-inner-icon="mdi-calendar"
              :loading="loadingSeasons"
              :disabled="!selectedLeagueId"
              @update:model-value="onSeasonChange"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-refresh"
              :loading="loadingTeams"
              :disabled="!selectedSeasonId"
              @click="fetchTeams"
            >
              Refresh Teams
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- No selection state -->
    <v-card v-if="!selectedLeagueId" class="pa-8 text-center">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-filter</v-icon>
      <h3 class="text-h6 mb-2">Select a League to View Teams</h3>
      <p class="text-medium-emphasis">Choose a league from the dropdown above, then select a season to see all teams.</p>
    </v-card>

    <!-- League selected but no season -->
    <v-card v-else-if="!selectedSeasonId" class="pa-8 text-center">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-calendar</v-icon>
      <h3 class="text-h6 mb-2">Select a Season</h3>
      <p class="text-medium-emphasis">Choose a season to view teams registered for that season.</p>
    </v-card>

    <!-- Loading state -->
    <v-card v-else-if="loadingTeams && teams.length === 0" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-medium-emphasis mt-4">Loading teams...</p>
    </v-card>

    <!-- Teams Table -->
    <v-card v-else>
      <div class="table-scroll">
        <v-data-table
          :headers="headers"
          :items="teams"
          :loading="loadingTeams"
          :items-per-page="20"
          class="elevation-0"
        >
          <template v-slot:item.team_logo_url="{ item }">
            <v-avatar size="36">
              <v-img alt="" v-if="item.team_logo_url" :src="item.team_logo_url" />
              <v-icon v-else>mdi-account-group</v-icon>
            </v-avatar>
          </template>

          <template v-slot:item.team_name="{ item }">
            <div>
              <div class="font-weight-medium">{{ item.team_name }}</div>
              <div class="text-caption text-medium-emphasis">[{{ item.team_tag }}]</div>
            </div>
          </template>

          <template v-slot:item.team_status="{ item }">
            <v-chip
              :color="getStatusColor(item.team_status)"
              size="small"
              variant="flat"
            >
              {{ item.team_status }}
            </v-chip>
          </template>

          <template v-slot:item.active_member_count="{ item }">
            {{ item.active_member_count }} members
          </template>

          <template v-slot:item.actions="{ item }">
            <v-btn aria-label="View team details"
              icon
              size="small"
              variant="text"
              @click="viewTeamDetail(item)"
              title="View Details"
            >
              <v-icon>mdi-eye</v-icon>
            </v-btn>
          </template>

          <template v-slot:no-data>
            <div class="text-center pa-8">
              <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-account-group-outline</v-icon>
              <p class="text-medium-emphasis">No teams registered for this season</p>
            </div>
          </template>

          <template v-slot:bottom>
            <div class="d-flex justify-center pa-4">
              <v-pagination
                v-model="currentPage"
                :length="pagination.total_pages"
                :total-visible="7"
                @update:model-value="goToPage"
              />
            </div>
            <div class="text-center text-caption text-medium-emphasis pb-2">
              Showing {{ teams.length }} of {{ pagination.total_items }} teams
            </div>
          </template>
        </v-data-table>
      </div>
    </v-card>

    <!-- Team Detail Modal -->
    <LeagueTeamDetailModal
      v-model="detailModalOpen"
      :team="selectedTeam"
      :season-id="selectedSeasonId || ''"
      @updated="fetchTeams"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useLeaguesStore, type UserLeagueMembership } from '@/stores/leagues'
import { useLeagueSeasonsStore, type LeagueSeasonResponse } from '@/stores/leagueSeasons'
import { useLeagueTeamsStore, type LeagueTeamSummaryResponse } from '@/stores/leagueTeams'
import LeagueTeamDetailModal from '@/components/admin/LeagueTeamDetailModal.vue'
import { teamStatusMap, getStatusColor as mapStatusColor } from '@/utils/statusMaps'
import ErrorAlert from '@/components/ErrorAlert.vue'
import type { components } from '@/api/types'

type PaginationMeta = components['schemas']['PaginationMeta']

// Stores
const leaguesStore = useLeaguesStore()
const seasonsStore = useLeagueSeasonsStore()
const teamsStore = useLeagueTeamsStore()

// State
const myLeagues = ref<UserLeagueMembership[]>([])
const seasons = ref<LeagueSeasonResponse[]>([])
const teams = ref<LeagueTeamSummaryResponse[]>([])
const selectedLeagueId = ref<string | null>(null)
const selectedSeasonId = ref<string | null>(null)
const loadingLeagues = ref(false)
const loadingSeasons = ref(false)
const loadingTeams = ref(false)
const error = ref<string | null>(null)
const currentPage = ref(1)
const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

// Detail modal
const detailModalOpen = ref(false)
const selectedTeam = ref<LeagueTeamSummaryResponse | null>(null)

// Admin roles
const ADMIN_ROLES = ['owner', 'admin', 'moderator']

// Table headers
const headers = [
  { title: '', key: 'team_logo_url', width: '60px', sortable: false },
  { title: 'Team', key: 'team_name' },
  { title: 'Status', key: 'team_status', width: '100px' },
  { title: 'Members', key: 'active_member_count', width: '100px' },
  { title: 'Actions', key: 'actions', width: '80px', sortable: false, align: 'center' as const },
]

// Helpers
const getStatusColor = (status: string) => mapStatusColor(teamStatusMap, status)

// API calls
async function fetchMyLeagues() {
  loadingLeagues.value = true
  try {
    await leaguesStore.fetchMyLeagues()
    // Filter to only leagues where user has admin permissions
    myLeagues.value = leaguesStore.myLeagues.filter(l =>
      ADMIN_ROLES.includes(l.membership_type)
    )
  } catch {
    error.value = leaguesStore.error || 'Failed to load leagues'
  } finally {
    loadingLeagues.value = false
  }
}

async function onLeagueChange() {
  // Clear season and teams when league changes
  selectedSeasonId.value = null
  seasons.value = []
  teams.value = []

  if (!selectedLeagueId.value) return

  loadingSeasons.value = true
  try {
    await seasonsStore.fetchSeasons(selectedLeagueId.value)
    seasons.value = seasonsStore.seasons
  } catch {
    error.value = seasonsStore.error || 'Failed to load seasons'
  } finally {
    loadingSeasons.value = false
  }
}

async function onSeasonChange() {
  teams.value = []
  if (!selectedSeasonId.value) return
  fetchTeams()
}

async function fetchTeams(page = 1) {
  if (!selectedSeasonId.value) return

  loadingTeams.value = true
  error.value = null
  try {
    await teamsStore.fetchTeamsInSeason(selectedSeasonId.value, page, 20)
    teams.value = teamsStore.teams
    pagination.value = teamsStore.pagination
    currentPage.value = page
  } catch {
    error.value = teamsStore.error || 'Failed to load teams'
  } finally {
    loadingTeams.value = false
  }
}

function goToPage(page: number) {
  fetchTeams(page)
}

function viewTeamDetail(team: LeagueTeamSummaryResponse) {
  selectedTeam.value = team
  detailModalOpen.value = true
}

onMounted(() => {
  fetchMyLeagues()
})
</script>

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
