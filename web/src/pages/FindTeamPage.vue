<template>
  <v-container class="pa-0">
    <div class="d-flex align-center justify-space-between mb-2 flex-wrap ga-4">
      <div>
        <h1 class="text-h4">Find a team</h1>
        <p class="text-subtitle-1 text-medium-emphasis mb-0">Rosters with open slots in your leagues. Ask to join, and the captain decides.</p>
      </div>
      <v-switch v-model="openOnly" label="Only teams with open slots" color="primary" hide-details density="compact" />
    </div>

    <ErrorAlert :error="error" @clear="error = null" />

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <EmptyState
      v-else-if="memberships.length === 0"
      icon="mdi-trophy-outline"
      title="Join a league first"
      subtitle="Teams belong to a league season. Once you are in a league, the teams looking for players show up here."
      class="mt-4"
    >
      <template #action>
        <v-btn color="primary" class="mt-4" prepend-icon="mdi-magnify" :to="{ name: 'leagues' }">Find a league</v-btn>
      </template>
    </EmptyState>

    <template v-else>
      <div v-for="group in groups" :key="group.leagueId" class="mb-8">
        <div class="d-flex align-center ga-3 mb-3 flex-wrap">
          <h2 class="text-h6">{{ group.leagueName }}<span v-if="group.seasonName" class="text-medium-emphasis"> · {{ group.seasonName }}</span></h2>
          <v-chip v-if="group.myTeam" size="small" color="success" variant="tonal">
            <v-icon start size="small">mdi-check</v-icon>You're on {{ group.myTeam.team_name }}
          </v-chip>
          <v-spacer />
          <v-btn
            v-if="!group.myTeam && group.seasonId"
            variant="text"
            color="primary"
            prepend-icon="mdi-plus"
            :to="{ name: 'league-detail', params: { id: group.leagueId }, query: { season: group.seasonId, tab: 'teams' } }"
          >
            Create a team
          </v-btn>
        </div>

        <EmptyState
          v-if="group.teams.length === 0"
          icon="mdi-account-group-outline"
          :title="group.seasonId ? (openOnly ? 'No open slots right now' : 'No teams yet') : 'No season open'"
          :subtitle="group.seasonId ? 'Create a team and invite players, or check back later.' : 'This league has not opened a season yet.'"
          variant="text"
        />

        <v-row v-else>
          <v-col v-for="team in group.teams" :key="team.team_season_id ?? team.team_id" cols="12" sm="6" md="4">
            <v-card variant="outlined" class="h-100 d-flex flex-column">
              <v-card-text class="d-flex align-center ga-3 pb-2">
                <v-avatar size="44" rounded="lg" color="primary">
                  <v-img v-if="team.team_logo_url" :src="team.team_logo_url" :alt="`${team.team_name} logo`" />
                  <span v-else class="text-subtitle-2 font-weight-bold">{{ team.team_tag.slice(0, 3) }}</span>
                </v-avatar>
                <div class="flex-grow-1 min-w-0">
                  <div class="text-subtitle-1 font-weight-medium text-truncate">{{ team.team_name }}</div>
                  <div class="text-caption text-medium-emphasis">{{ team.team_tag }}</div>
                </div>
                <v-chip size="small" :color="slotsLeft(team) > 0 ? 'success' : undefined" variant="tonal">
                  {{ team.active_member_count }} of {{ team.team_size_max ?? '?' }}
                </v-chip>
              </v-card-text>
              <v-spacer />
              <v-card-actions class="px-4 pb-3">
                <v-btn variant="text" :to="{ path: `/teams/${team.team_id}`, query: team.team_season_id ? { season: team.team_season_id } : {} }">View team</v-btn>
                <v-spacer />
                <v-chip v-if="group.myTeam && group.myTeam.team_season_id === team.team_season_id" size="small" color="success" variant="tonal">Your team</v-chip>
                <v-chip v-else-if="applied.has(team.team_season_id ?? '')" size="small" color="info" variant="tonal">Request sent</v-chip>
                <v-btn
                  v-else-if="team.team_season_id && !group.myTeam && slotsLeft(team) > 0"
                  color="primary"
                  variant="flat"
                  size="small"
                  :loading="applyingTo === team.team_season_id"
                  @click="askToJoin(team.team_season_id, team.team_name)"
                >
                  Ask to join
                </v-btn>
                <span v-else-if="slotsLeft(team) <= 0" class="text-caption text-medium-emphasis">Full</span>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </template>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { ApiError } from '@/api'
import { useLeaguesStore } from '@/stores/leagues'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useSnackbar } from '@/composables/useSnackbar'
import EmptyState from '@/components/EmptyState.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'

type LeagueTeamSummary = components['schemas']['LeagueTeamSummaryResponse']
type LeagueSeason = components['schemas']['LeagueSeasonResponse']
type MyTeam = components['schemas']['PlayerLeagueTeamMembershipResponse']

interface Group {
  leagueId: string
  leagueName: string
  seasonId: string | null
  seasonName: string | null
  myTeam: MyTeam | null
  allTeams: LeagueTeamSummary[]
  teams: LeagueTeamSummary[]
}

const leaguesStore = useLeaguesStore()
const leagueTeamsStore = useLeagueTeamsStore()
const snackbar = useSnackbar()

const LIVE = ['active', 'playoffs', 'registration']
const loading = ref(true)
const error = ref<string | null>(null)
const openOnly = ref(true)
const raw = ref<Omit<Group, 'teams'>[]>([])
const applied = ref(new Set<string>())
const applyingTo = ref<string | null>(null)

const memberships = computed(() => leaguesStore.myLeagues.filter(m => m.league_status === 'active'))

const slotsLeft = (t: LeagueTeamSummary) => (t.team_size_max ?? 5) - t.active_member_count

const groups = computed<Group[]>(() =>
  raw.value.map(g => ({
    ...g,
    teams: [...g.allTeams]
      .filter(t => t.team_status === 'active' && (!openOnly.value || slotsLeft(t) > 0))
      .sort((a, b) => slotsLeft(b) - slotsLeft(a) || a.team_name.localeCompare(b.team_name)),
  })),
)

async function load() {
  loading.value = true
  error.value = null
  try {
    await Promise.all([
      leaguesStore.myLeagues.length ? Promise.resolve() : leaguesStore.fetchMyLeagues(),
      leagueTeamsStore.fetchMyTeams().catch(() => {}),
    ])
    const out: Omit<Group, 'teams'>[] = []
    for (const m of memberships.value) {
      const { data: leagueRes } = await api.GET('/v1/leagues/{league_id}', { params: { path: { league_id: m.league_id } } })
      const { data: seasonsRes } = await api.GET('/v1/league-seasons', { params: { query: { league_id: m.league_id } } })
      const seasons: LeagueSeason[] = (seasonsRes?.data ?? []).filter(s => s.status !== 'draft')
      const season =
        seasons.find(s => s.id === leagueRes?.data?.current_season_id) ??
        seasons.find(s => LIVE.includes(s.status)) ??
        null
      let teams: LeagueTeamSummary[] = []
      if (season) {
        const { data: teamsRes } = await api.GET('/v1/league-seasons/{season_id}/teams', { params: { path: { season_id: season.id }, query: { per_page: 100 } } })
        teams = teamsRes?.data ?? []
      }
      out.push({
        leagueId: m.league_id,
        leagueName: m.league_name,
        seasonId: season?.id ?? null,
        seasonName: season?.name ?? null,
        myTeam: season ? (leagueTeamsStore.myTeams.find(t => t.season_id === season.id && t.status === 'active') ?? null) : null,
        allTeams: teams,
      })
    }
    raw.value = out
  } catch (e) {
    error.value = e instanceof ApiError ? e.detail : 'Could not load teams'
  } finally {
    loading.value = false
  }
}

async function askToJoin(teamSeasonId: string, teamName: string) {
  applyingTo.value = teamSeasonId
  try {
    await leagueTeamsStore.applyToTeam(teamSeasonId)
    applied.value = new Set([...applied.value, teamSeasonId])
    snackbar.success(`Request sent to ${teamName}. The captain will accept or decline.`)
  } catch (e) {
    snackbar.error(e instanceof ApiError ? e.detail : 'Could not send the request')
  } finally {
    applyingTo.value = null
  }
}

onMounted(load)
</script>
