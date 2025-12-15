<template>
  <div>
    <!-- Loading State -->
    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <!-- Error State -->
    <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <template v-if="league">
      <!-- League Header -->
      <v-row class="mb-6">
        <v-col cols="12">
          <v-card>
            <v-card-item>
              <template v-slot:prepend>
                <v-avatar size="80" rounded="lg" color="primary">
                  <v-img v-if="league.logo_url" :src="league.logo_url" />
                  <v-icon v-else size="40">mdi-trophy</v-icon>
                </v-avatar>
              </template>
              <v-card-title class="text-h4">{{ league.name }}</v-card-title>
              <v-card-subtitle>
                <v-chip size="small" variant="tonal" class="mr-2">
                  <v-icon start size="small">mdi-gamepad-variant</v-icon>
                  {{ gameName }}
                </v-chip>
                <v-chip size="small" :color="league.status === 'active' ? 'success' : 'grey'" variant="tonal">
                  {{ league.status }}
                </v-chip>
              </v-card-subtitle>
            </v-card-item>
            <v-card-text v-if="league.description">
              {{ league.description }}
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Season Selector -->
      <v-row class="mb-4">
        <v-col cols="12" sm="6" md="4">
          <v-select
            v-model="selectedSeasonId"
            :items="seasons"
            item-title="name"
            item-value="id"
            label="Select Season"
            prepend-inner-icon="mdi-calendar"
            :loading="loadingSeasons"
            @update:model-value="onSeasonChange"
          >
            <template v-slot:item="{ item, props }">
              <v-list-item v-bind="props">
                <template v-slot:append>
                  <v-chip size="x-small" :color="getSeasonStatusColor(item.raw.status)" variant="tonal">
                    {{ item.raw.status }}
                  </v-chip>
                </template>
              </v-list-item>
            </template>
          </v-select>
        </v-col>
        <v-col cols="12" sm="6" md="8" class="d-flex align-center justify-end">
          <v-btn
            v-if="authStore.isAuthenticated && selectedSeasonId && !hasTeamInSeason"
            color="primary"
            prepend-icon="mdi-plus"
            @click="showCreateTeamModal = true"
          >
            Create Team
          </v-btn>
          <v-chip v-else-if="hasTeamInSeason" color="success" variant="tonal">
            <v-icon start>mdi-check</v-icon>
            You have a team in this season
          </v-chip>
        </v-col>
      </v-row>

      <!-- Teams Grid -->
      <v-row class="mb-4">
        <v-col cols="12">
          <h2 class="text-h6 mb-4">
            <v-icon start>mdi-shield-account-outline</v-icon>
            Teams
            <v-chip size="small" variant="tonal" class="ml-2">{{ teams.length }}</v-chip>
          </h2>
        </v-col>
      </v-row>

      <v-progress-linear v-if="loadingTeams" indeterminate class="mb-4" />

      <v-row v-if="teams.length > 0">
        <v-col v-for="team in teams" :key="team.team_id" cols="12" sm="6" md="4" lg="3">
          <v-card class="h-100" hover @click="viewTeam(team)">
            <v-card-item>
              <template v-slot:prepend>
                <v-avatar color="secondary" size="48" rounded="lg">
                  <v-img v-if="team.team_logo_url" :src="team.team_logo_url" />
                  <span v-else class="text-body-2 font-weight-bold">{{ team.team_tag }}</span>
                </v-avatar>
              </template>
              <v-card-title>{{ team.team_name }}</v-card-title>
              <v-card-subtitle>[{{ team.team_tag }}]</v-card-subtitle>
            </v-card-item>
            <v-card-actions>
              <v-chip size="small" variant="tonal">
                <v-icon start size="small">mdi-account-group</v-icon>
                {{ team.active_member_count || 0 }} members
              </v-chip>
              <v-spacer />
              <v-icon size="small">mdi-chevron-right</v-icon>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>

      <!-- Empty Teams State -->
      <v-row v-else-if="!loadingTeams && selectedSeasonId">
        <v-col cols="12" class="text-center py-12">
          <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-shield-outline</v-icon>
          <h3 class="text-h5 text-medium-emphasis mb-2">No Teams Yet</h3>
          <p class="text-body-2 text-medium-emphasis mb-4">
            Be the first to create a team for this season!
          </p>
          <v-btn
            v-if="authStore.isAuthenticated"
            color="primary"
            prepend-icon="mdi-plus"
            @click="showCreateTeamModal = true"
          >
            Create Team
          </v-btn>
          <v-btn v-else color="primary" to="/login">
            Sign In to Create Team
          </v-btn>
        </v-col>
      </v-row>

      <!-- No Season Selected -->
      <v-row v-else-if="!loadingSeasons && seasons.length === 0">
        <v-col cols="12" class="text-center py-12">
          <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-calendar-remove</v-icon>
          <h3 class="text-h5 text-medium-emphasis mb-2">No Seasons Available</h3>
          <p class="text-body-2 text-medium-emphasis">
            This league doesn't have any seasons yet.
          </p>
        </v-col>
      </v-row>
    </template>

    <!-- Create Team Modal -->
    <v-dialog v-model="showCreateTeamModal" max-width="500">
      <v-card>
        <v-card-title>Create Team</v-card-title>
        <v-card-text>
          <v-form ref="createTeamForm" v-model="createTeamValid">
            <v-text-field
              v-model="newTeam.name"
              label="Team Name"
              :rules="[rules.required, rules.minLength(3), rules.maxLength(50)]"
              counter="50"
              class="mb-2"
            />
            <v-text-field
              v-model="newTeam.tag"
              label="Team Tag"
              :rules="[rules.required, rules.minLength(2), rules.maxLength(8)]"
              counter="8"
              hint="Short identifier for your team (2-8 characters)"
              class="mb-2"
            />
            <v-textarea
              v-model="newTeam.description"
              label="Description (optional)"
              rows="3"
              counter="500"
              :rules="[rules.maxLength(500)]"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCreateTeamModal = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="creatingTeam"
            :disabled="!createTeamValid"
            @click="createTeam"
          >
            Create Team
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Team Detail Modal -->
    <v-dialog v-model="showTeamDetailModal" max-width="600">
      <v-card v-if="selectedTeam">
        <v-card-item>
          <template v-slot:prepend>
            <v-avatar color="secondary" size="56" rounded="lg">
              <v-img v-if="selectedTeam.team_logo_url" :src="selectedTeam.team_logo_url" />
              <span v-else class="text-body-1 font-weight-bold">{{ selectedTeam.team_tag }}</span>
            </v-avatar>
          </template>
          <v-card-title>{{ selectedTeam.team_name }}</v-card-title>
          <v-card-subtitle>[{{ selectedTeam.team_tag }}]</v-card-subtitle>
          <template v-slot:append>
            <v-btn icon variant="text" @click="showTeamDetailModal = false">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </template>
        </v-card-item>
        <v-card-text>
          <h4 class="text-subtitle-1 font-weight-medium mb-2">
            <v-icon start size="small">mdi-account-group</v-icon>
            Roster ({{ selectedTeam.active_member_count }} members)
          </h4>

          <v-progress-linear v-if="loadingMembers" indeterminate class="mb-2" />

          <v-list v-else-if="teamMembers.length > 0" density="compact">
            <v-list-item v-for="member in teamMembers" :key="member.player_id">
              <template v-slot:prepend>
                <v-avatar size="32">
                  <v-img v-if="member.avatar_url" :src="member.avatar_url" />
                  <v-icon v-else>mdi-account</v-icon>
                </v-avatar>
              </template>
              <v-list-item-title>{{ member.display_name }}</v-list-item-title>
              <v-list-item-subtitle>
                <v-chip size="x-small" :color="member.role === 'captain' ? 'warning' : 'default'" variant="tonal">
                  {{ member.role }}
                </v-chip>
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>

          <p v-else class="text-medium-emphasis text-center py-4">No roster information available</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showTeamDetailModal = false">Close</v-btn>
          <v-btn
            color="primary"
            :to="{ path: `/teams/${selectedTeam.team_id}`, query: { season: selectedTeam.team_season_id } }"
          >
            View Full Details
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLeaguesStore } from '@/stores/leagues'
import { useLeagueSeasonsStore } from '@/stores/leagueSeasons'
import { useLeagueTeamsStore, type LeagueTeamSummaryResponse, type LeagueTeamMemberWithPlayer } from '@/stores/leagueTeams'
import { useGamesStore } from '@/stores/games'

const route = useRoute()
const authStore = useAuthStore()
const leaguesStore = useLeaguesStore()
const seasonsStore = useLeagueSeasonsStore()
const teamsStore = useLeagueTeamsStore()
const gamesStore = useGamesStore()

const loading = ref(false)
const loadingSeasons = ref(false)
const loadingTeams = ref(false)
const loadingMembers = ref(false)
const creatingTeam = ref(false)
const error = ref<string | null>(null)

const selectedSeasonId = ref<string | null>(null)
const showCreateTeamModal = ref(false)
const showTeamDetailModal = ref(false)
const selectedTeam = ref<LeagueTeamSummaryResponse | null>(null)
const teamMembers = ref<LeagueTeamMemberWithPlayer[]>([])
const createTeamValid = ref(false)

const newTeam = ref({
  name: '',
  tag: '',
  description: '',
})

const rules = {
  required: (v: string) => !!v || 'Required',
  minLength: (min: number) => (v: string) => (v && v.length >= min) || `Must be at least ${min} characters`,
  maxLength: (max: number) => (v: string) => (!v || v.length <= max) || `Must be at most ${max} characters`,
}

const league = computed(() => leaguesStore.currentLeague)
const seasons = computed(() => seasonsStore.seasons)
const teams = computed(() => teamsStore.teams)

const gameName = computed(() => {
  if (!league.value) return ''
  const game = gamesStore.games.find(g => g.id === league.value!.game_id)
  return game?.display_name || game?.slug || 'Unknown Game'
})

const hasTeamInSeason = computed(() => {
  if (!selectedSeasonId.value || !authStore.isAuthenticated) return false
  return teamsStore.myTeams.some(t => t.season_id === selectedSeasonId.value)
})

onMounted(async () => {
  const leagueId = route.params.id as string

  loading.value = true
  try {
    // Load games for display
    await gamesStore.fetchGames()

    // Load league details
    await leaguesStore.fetchLeague(leagueId)

    if (league.value) {
      // Load seasons
      loadingSeasons.value = true
      await seasonsStore.fetchSeasons(leagueId)
      loadingSeasons.value = false

      // Auto-select active season or first available
      const activeSeason = seasons.value.find(s => s.status === 'active')
      if (activeSeason) {
        selectedSeasonId.value = activeSeason.id
      } else if (seasons.value.length > 0) {
        const firstSeason = seasons.value[0]
        if (firstSeason) {
          selectedSeasonId.value = firstSeason.id
        }
      }

      // Load user's teams if authenticated
      if (authStore.isAuthenticated) {
        await teamsStore.fetchMyTeams()
      }
    }
  } catch (e) {
    error.value = 'Failed to load league details'
    console.error(e)
  } finally {
    loading.value = false
  }
})

watch(selectedSeasonId, async (newSeasonId) => {
  if (newSeasonId) {
    loadingTeams.value = true
    try {
      await teamsStore.fetchTeamsInSeason(newSeasonId)
    } catch (e) {
      console.error('Failed to load teams:', e)
    } finally {
      loadingTeams.value = false
    }
  }
})

function onSeasonChange() {
  // Teams will be loaded by the watcher
}

function getSeasonStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'success'
    case 'upcoming': return 'info'
    case 'completed': return 'grey'
    default: return 'grey'
  }
}

async function viewTeam(team: LeagueTeamSummaryResponse) {
  selectedTeam.value = team
  showTeamDetailModal.value = true
  teamMembers.value = []

  // Load team members if we have a team_season_id
  if (team.team_season_id) {
    loadingMembers.value = true
    try {
      teamMembers.value = await teamsStore.fetchMembers(team.team_season_id)
    } catch (e) {
      console.error('Failed to load team members:', e)
    } finally {
      loadingMembers.value = false
    }
  }
}

async function createTeam() {
  if (!selectedSeasonId.value || !createTeamValid.value) return

  creatingTeam.value = true
  try {
    await teamsStore.createTeam(selectedSeasonId.value, {
      name: newTeam.value.name,
      tag: newTeam.value.tag,
      description: newTeam.value.description || undefined,
    })

    // Refresh teams list and user's teams
    await Promise.all([
      teamsStore.fetchTeamsInSeason(selectedSeasonId.value),
      teamsStore.fetchMyTeams(),
    ])

    // Reset form and close modal
    newTeam.value = { name: '', tag: '', description: '' }
    showCreateTeamModal.value = false
  } catch (e) {
    console.error('Failed to create team:', e)
    error.value = teamsStore.error || 'Failed to create team'
  } finally {
    creatingTeam.value = false
  }
}
</script>
