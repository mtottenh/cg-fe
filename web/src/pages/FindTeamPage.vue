<template>
  <v-container class="pa-0">
    <div class="mb-4">
      <h1 class="text-h4">Find a team</h1>
      <p class="text-subtitle-1 text-medium-emphasis mb-0">Rosters taking players in your leagues. Ask to join, and the captain decides.</p>
    </div>

    <!-- Search and filters. The default view is only seasons a player can
         still join; past seasons are behind a switch, never mixed in. -->
    <v-card variant="outlined" class="mb-6" data-testid="find-team-filters">
      <v-card-text class="d-flex align-center ga-3 flex-wrap">
        <v-text-field
          v-model="search"
          label="Search teams"
          placeholder="Name or tag"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
          density="compact"
          style="min-width: 220px; max-width: 320px"
          data-testid="find-team-search"
        />
        <v-select
          v-model="leagueFilter"
          :items="leagueItems"
          label="League"
          aria-label="League"
          hide-details
          density="compact"
          style="min-width: 200px; max-width: 280px"
          data-testid="find-team-league"
        />
        <v-select
          v-model="seasonFilter"
          :items="seasonItems"
          label="Season"
          aria-label="Season"
          hide-details
          density="compact"
          style="min-width: 220px; max-width: 320px"
          data-testid="find-team-season"
        />
        <v-spacer />
        <v-switch v-model="openOnly" label="Open slots only" color="primary" hide-details density="compact" data-testid="find-team-open" />
        <v-switch v-model="showPast" label="Show past seasons" color="primary" hide-details density="compact" data-testid="find-team-past" />
      </v-card-text>
    </v-card>
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
      <EmptyState
        v-if="groups.length === 0"
        icon="mdi-filter-variant"
        :title="search ? 'No teams match' : (showPast ? 'Nothing here' : 'No season is taking players')"
        :subtitle="search ? 'Try another name or tag, or clear the search.' : (showPast ? 'Your leagues have no seasons to show.' : 'Switch on past seasons to browse old rosters, or check back when a season opens.')"
        variant="text"
        class="mt-4"
      />
      <div v-for="group in groups" :key="group.key" class="mb-8" data-testid="find-team-group">
        <div class="d-flex align-center ga-3 mb-3 flex-wrap">
          <h2 class="text-h6">{{ group.leagueName }}<span v-if="group.seasonName" class="text-medium-emphasis"> · {{ group.seasonName }}</span></h2>
          <v-chip v-if="!group.joinable" size="small" variant="tonal">{{ group.whyNotJoinable }}</v-chip>
          <v-chip v-if="group.myTeam" size="small" color="success" variant="tonal">
            <v-icon start size="small">mdi-check</v-icon>You're on {{ group.myTeam.team_name }}
          </v-chip>
          <v-spacer />
          <v-btn
            v-if="group.joinable && !group.myTeam && group.seasonId"
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
          :title="search ? 'No teams match' : (openOnly && group.joinable ? 'No open slots right now' : 'No teams')"
          :subtitle="search ? 'Try another name or tag.' : (group.joinable ? 'Create a team and invite players, or check back later.' : 'Nobody registered for this season.')"
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
                  v-else-if="group.joinable && team.team_season_id && !group.myTeam && slotsLeft(team) > 0"
                  color="primary"
                  variant="flat"
                  size="small"
                  :loading="applyingTo === team.team_season_id"
                  @click="askToJoin(team.team_season_id, team.team_name)"
                >
                  Ask to join
                </v-btn>
                <span v-else-if="group.joinable && slotsLeft(team) <= 0" class="text-caption text-medium-emphasis">Full</span>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </template>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import type { components } from '@/api/types'
import { ApiError } from '@/api'
import { useLeaguesStore } from '@/stores/leagues'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useSnackbar } from '@/composables/useSnackbar'
import EmptyState from '@/components/EmptyState.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import { seasonStatusMap, getStatusLabel } from '@/utils/statusMaps'

type LeagueTeamSummary = components['schemas']['LeagueTeamSummaryResponse']
type LeagueSeason = components['schemas']['LeagueSeasonResponse']
type MyTeam = components['schemas']['PlayerLeagueTeamMembershipResponse']

interface Group {
  key: string
  leagueId: string
  leagueName: string
  seasonId: string
  seasonName: string
  joinable: boolean
  whyNotJoinable: string | null
  myTeam: MyTeam | null
  teams: LeagueTeamSummary[]
}

const route = useRoute()
const router = useRouter()
const leaguesStore = useLeaguesStore()
const leagueTeamsStore = useLeagueTeamsStore()
const snackbar = useSnackbar()

const loading = ref(true)
const error = ref<string | null>(null)
const applied = ref(new Set<string>())
const applyingTo = ref<string | null>(null)

// Filters, mirrored into the URL so a link to "Season 2 of X" holds.
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const leagueFilter = ref<string>(typeof route.query.league === 'string' ? route.query.league : 'all')
const seasonFilter = ref<string>(typeof route.query.season === 'string' ? route.query.season : 'current')
const openOnly = ref(route.query.open !== '0')
const showPast = ref(route.query.past === '1')

/** Seasons per league (non-draft, as the listing returns them: archived ones are already hidden). */
const seasonsByLeague = ref(new Map<string, LeagueSeason[]>())
/** Teams per season, fetched on demand and kept for the session. */
const teamsBySeason = ref(new Map<string, LeagueTeamSummary[]>())
const loadingSeasons = ref(new Set<string>())

const memberships = computed(() => leaguesStore.myLeagues.filter(m => m.league_status === 'active'))
const slotsLeft = (t: LeagueTeamSummary) => (t.team_size_max ?? 5) - t.active_member_count

/** A season a player can still join: taking registrations, or running with an open roster. */
function isJoinable(s: LeagueSeason): boolean {
  if (s.status === 'registration') return true
  return (s.status === 'active' || s.status === 'playoffs') && s.roster_lock_status === 'open'
}
function whyNot(s: LeagueSeason): string {
  if (s.status === 'completed' || s.status === 'cancelled') return 'Season over'
  if (s.roster_lock_status !== 'open') return 'Roster locked'
  return getStatusLabel(seasonStatusMap, s.status)
}

const leagueItems = computed(() => [
  { title: 'All my leagues', value: 'all' },
  ...memberships.value.map(m => ({ title: m.league_name, value: m.league_id })),
])
const seasonItems = computed(() => {
  const items: Array<{ title: string; value: string }> = [{ title: showPast.value ? 'All seasons' : 'Seasons taking players', value: 'current' }]
  const leagues = leagueFilter.value === 'all' ? memberships.value : memberships.value.filter(m => m.league_id === leagueFilter.value)
  for (const m of leagues) {
    for (const s of seasonsByLeague.value.get(m.league_id) ?? []) {
      if (!showPast.value && !isJoinable(s)) continue
      items.push({ title: leagues.length > 1 ? `${m.league_name} · ${s.name}` : s.name, value: s.id })
    }
  }
  return items
})

/** Which seasons the page is showing right now, per league. */
const seasonsInView = computed(() => {
  const out: Array<{ leagueId: string; leagueName: string; season: LeagueSeason }> = []
  for (const m of memberships.value) {
    if (leagueFilter.value !== 'all' && m.league_id !== leagueFilter.value) continue
    for (const s of seasonsByLeague.value.get(m.league_id) ?? []) {
      if (seasonFilter.value !== 'current') {
        if (s.id === seasonFilter.value) out.push({ leagueId: m.league_id, leagueName: m.league_name, season: s })
        continue
      }
      if (isJoinable(s) || showPast.value) out.push({ leagueId: m.league_id, leagueName: m.league_name, season: s })
    }
  }
  return out
})

const groups = computed<Group[]>(() => {
  const q = search.value.trim().toLowerCase()
  return seasonsInView.value.map(({ leagueId, leagueName, season }) => {
    const joinable = isJoinable(season)
    const teams = [...(teamsBySeason.value.get(season.id) ?? [])]
      .filter(t => t.team_status === 'active')
      .filter(t => !q || t.team_name.toLowerCase().includes(q) || t.team_tag.toLowerCase().includes(q))
      .filter(t => !openOnly.value || !joinable || slotsLeft(t) > 0)
      .sort((a, b) => slotsLeft(b) - slotsLeft(a) || a.team_name.localeCompare(b.team_name))
    return {
      key: `${leagueId}:${season.id}`,
      leagueId,
      leagueName,
      seasonId: season.id,
      seasonName: season.name,
      joinable,
      whyNotJoinable: joinable ? null : whyNot(season),
      myTeam: leagueTeamsStore.myTeams.find(t => t.season_id === season.id && t.status === 'active') ?? null,
      teams,
    }
  })
})

async function ensureTeams(seasonId: string) {
  if (teamsBySeason.value.has(seasonId) || loadingSeasons.value.has(seasonId)) return
  loadingSeasons.value = new Set([...loadingSeasons.value, seasonId])
  try {
    const { data } = await api.GET('/v1/league-seasons/{season_id}/teams', { params: { path: { season_id: seasonId }, query: { per_page: 100 } } })
    teamsBySeason.value = new Map([...teamsBySeason.value, [seasonId, data?.data ?? []]])
  } finally {
    const next = new Set(loadingSeasons.value); next.delete(seasonId); loadingSeasons.value = next
  }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    await Promise.all([
      leaguesStore.myLeagues.length ? Promise.resolve() : leaguesStore.fetchMyLeagues(),
      leagueTeamsStore.fetchMyTeams().catch(() => {}),
    ])
    const byLeague = new Map<string, LeagueSeason[]>()
    for (const m of memberships.value) {
      const { data: seasonsRes } = await api.GET('/v1/league-seasons', { params: { query: { league_id: m.league_id } } })
      byLeague.set(m.league_id, (seasonsRes?.data ?? []).filter(s => s.status !== 'draft' && !s.archived_at))
    }
    seasonsByLeague.value = byLeague
    await Promise.all(seasonsInView.value.map(v => ensureTeams(v.season.id)))
  } catch (e) {
    error.value = e instanceof ApiError ? e.detail : 'Could not load teams'
  } finally {
    loading.value = false
  }
}

// Fetch rosters for whatever the filters bring into view; keep the URL in step.
watch(seasonsInView, (view) => { for (const v of view) void ensureTeams(v.season.id) })
watch([search, leagueFilter, seasonFilter, openOnly, showPast], ([q, league, season, open, past]) => {
  const query: Record<string, string> = {}
  if (q) query.q = q
  if (league !== 'all') query.league = league
  if (season !== 'current') query.season = season
  if (!open) query.open = '0'
  if (past) query.past = '1'
  router.replace({ query })
})
// A season pick that the league filter no longer offers falls back to the default.
watch(seasonItems, (items) => {
  if (!items.some(i => i.value === seasonFilter.value)) seasonFilter.value = 'current'
})

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
