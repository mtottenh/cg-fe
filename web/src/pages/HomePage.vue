<template>
  <v-container>
    <ErrorAlert
      :error="gamesStore.fetchGamesState.error"
      retryable
      @clear="gamesStore.fetchGamesState.error = null"
      @retry="gamesStore.fetchGames()"
    />

    <!-- Authenticated User View -->
    <template v-if="authStore.isAuthenticated">
      <!-- Welcome Header -->
      <v-row class="mb-6">
        <v-col>
          <h1 class="text-h4">
            Welcome{{ isNewHere ? '' : ' back' }}{{ authStore.player?.display_name ? `, ${authStore.player.display_name}` : '' }}!
          </h1>
          <p class="text-body-1 text-medium-emphasis">
            {{ welcomeLine }}
          </p>
        </v-col>
      </v-row>

      <!-- Get playing: the path to a roster, with the next step lit -->
      <v-card v-if="!loadingTeams && myTeams.length === 0" variant="outlined" class="mb-8 get-playing" data-testid="get-playing">
        <v-card-title class="text-subtitle-1">Get playing</v-card-title>
        <v-divider />
        <v-card-text>
          <v-row>
            <v-col v-for="(step, i) in playSteps" :key="step.title" cols="12" md="4" class="d-flex ga-3">
              <v-avatar
                size="32"
                :color="step.state === 'done' ? 'success' : step.state === 'current' ? 'primary' : undefined"
                :variant="step.state === 'pending' ? 'outlined' : 'flat'"
              >
                <v-icon v-if="step.state === 'done'" size="18">mdi-check</v-icon>
                <span v-else class="text-body-2 font-weight-medium">{{ i + 1 }}</span>
              </v-avatar>
              <div class="flex-grow-1">
                <div class="text-subtitle-2" :class="{ 'text-medium-emphasis': step.state === 'pending' }">{{ step.title }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ step.text }}</div>
                <div v-if="step.state === 'current'" class="d-flex ga-2 mt-2 flex-wrap">
                  <v-btn
                    v-for="action in step.actions"
                    :key="action.label"
                    :color="action.primary ? 'primary' : undefined"
                    :variant="action.primary ? 'flat' : 'text'"
                    size="small"
                    :to="action.to"
                  >
                    {{ action.label }}
                  </v-btn>
                </div>
              </div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Game Selection Grid -->
      <v-row class="mb-8">
        <v-col cols="12">
          <h2 class="text-h6 mb-4">
            <v-icon start>mdi-gamepad-variant</v-icon>
            Choose Your Game
          </h2>
        </v-col>
        <v-col v-if="gamesStore.fetchGamesState.loading" cols="12" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" />
        </v-col>
        <v-col v-else-if="activeGames.length === 0" cols="12" class="text-center py-8">
          <v-icon size="48" color="grey">mdi-gamepad-variant-outline</v-icon>
          <p class="text-medium-emphasis mt-2">No games available</p>
        </v-col>
        <template v-else>
          <v-col v-for="game in activeGames" :key="game.id" cols="6" sm="4" md="3" lg="2">
            <v-card
              class="game-card text-center pa-4"
              :to="{ name: 'leagues', query: { game: game.id } }"
              hover
            >
              <v-avatar size="64" class="mb-2" rounded="lg">
                <v-img alt="" v-if="game.icon_url" :src="game.icon_url" />
                <v-icon v-else size="32">mdi-gamepad-variant</v-icon>
              </v-avatar>
              <div class="text-subtitle-2 font-weight-medium">{{ game.display_name }}</div>
              <div class="text-caption text-medium-emphasis">
                {{ getLeagueCountForGame(game.id) }} leagues
              </div>
            </v-card>
          </v-col>
        </template>
      </v-row>

      <!-- Action Items Widget -->
      <v-row class="mb-2">
        <v-col cols="12">
          <CaptainActionsWidget />
        </v-col>
      </v-row>

      <!-- My Hub Section -->
      <v-row>
        <!-- My Teams Widget -->
        <v-col cols="12" md="6">
          <v-card>
            <v-card-title class="d-flex align-center">
              <v-icon start>mdi-shield-account</v-icon>
              My Teams
              <v-spacer />
              <v-btn variant="text" size="small" :to="{ name: 'my-teams' }">View All</v-btn>
            </v-card-title>
            <v-card-text>
              <v-progress-linear v-if="loadingTeams" indeterminate class="mb-2" />
              <template v-else-if="myTeams.length > 0">
                <v-list density="compact">
                  <v-list-item
                    v-for="membership in myTeams.slice(0, 3)"
                    :key="membership.team_id"
                    :to="`/teams/${membership.team_id}`"
                  >
                    <template v-slot:prepend>
                      <v-avatar size="32" color="primary" rounded="lg">
                        <span class="text-caption">{{ membership.team_tag }}</span>
                      </v-avatar>
                    </template>
                    <v-list-item-title>{{ membership.team_name }}</v-list-item-title>
                    <!-- P-132: `role` is `LeagueTeamRole`, not a display string. -->
                    <v-list-item-subtitle>{{ getRoleLabel(membership.role) }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </template>
              <div v-else class="text-center py-4">
                <v-icon size="32" color="grey">mdi-account-group-outline</v-icon>
                <p class="text-caption text-medium-emphasis mt-2">No teams yet</p>
                <v-btn v-if="myLeagues.length > 0" variant="tonal" size="small" :to="{ name: 'find-team' }" class="mt-2">
                  Find a team
                </v-btn>
                <v-btn v-else variant="tonal" size="small" :to="{ name: 'leagues' }" class="mt-2">
                  Find a league
                </v-btn>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Invitations Widget -->
        <v-col cols="12" md="6">
          <v-card>
            <v-card-title class="d-flex align-center">
              <v-icon start>mdi-email</v-icon>
              Invitations
              <v-badge
                v-if="myInvitations.length > 0"
                :content="myInvitations.length"
                color="error"
                inline
                class="ml-2"
              />
              <v-spacer />
              <v-btn variant="text" size="small" :to="{ name: 'invitations' }">View All</v-btn>
            </v-card-title>
            <v-card-text>
              <v-progress-linear v-if="loadingInvitations" indeterminate class="mb-2" />
              <template v-else-if="myInvitations.length > 0">
                <v-list density="compact">
                  <v-list-item
                    v-for="invite in myInvitations.slice(0, 3)"
                    :key="invite.id"
                    :to="{ name: 'invitations' }"
                  >
                    <template v-slot:prepend>
                      <v-avatar size="32" color="secondary" rounded="lg">
                        <span class="text-caption">{{ invite.team_tag }}</span>
                      </v-avatar>
                    </template>
                    <v-list-item-title>{{ invite.team_name }}</v-list-item-title>
                    <v-list-item-subtitle>Invited you to join</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </template>
              <div v-else class="text-center py-4">
                <v-icon size="32" color="grey">mdi-email-outline</v-icon>
                <p class="text-caption text-medium-emphasis mt-2">No pending invitations</p>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Upcoming Matches Widget -->
      <v-row class="mt-2">
        <v-col cols="12">
          <v-card>
            <v-card-title class="d-flex align-center">
              <v-icon start>mdi-sword-cross</v-icon>
              Upcoming Matches
              <v-badge
                v-if="upcomingMatches.length > 0"
                :content="upcomingMatches.length"
                color="primary"
                inline
                class="ml-2"
              />
              <v-spacer />
              <v-btn
                variant="text"
                size="small"
                :to="{ name: 'tournaments', query: { status: 'in_progress' } }"
              >
                View All
              </v-btn>
            </v-card-title>
            <v-card-text>
              <v-progress-linear v-if="loadingMatches" indeterminate class="mb-2" />
              <template v-else-if="upcomingMatches.length > 0">
                <v-list density="compact">
                  <v-list-item
                    v-for="um in upcomingMatches.slice(0, 3)"
                    :key="um.match.id"
                    :to="{
                      name: 'match-detail',
                      params: { tournamentSlug: um.tournamentSlug, matchId: um.match.id },
                    }"
                  >
                    <template v-slot:prepend>
                      <v-avatar size="32" color="primary" rounded="lg">
                        <v-icon size="16">mdi-sword-cross</v-icon>
                      </v-avatar>
                    </template>
                    <v-list-item-title>
                      {{ um.match.participant1_name || 'TBD' }} vs {{ um.match.participant2_name || 'TBD' }}
                    </v-list-item-title>
                    <v-list-item-subtitle>
                      {{ um.tournamentName }}
                      <template v-if="um.match.scheduled_at">
                        &middot; {{ formatMatchTime(um.match.scheduled_at) }}
                      </template>
                    </v-list-item-subtitle>
                    <template v-slot:append>
                      <v-chip :color="matchStatusColor(um.match.status)" size="x-small" variant="tonal">
                        {{ matchStatusLabel(um.match.status) }}
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </template>
              <div v-else class="text-center py-4">
                <v-icon size="32" color="grey">mdi-sword-cross</v-icon>
                <p class="text-caption text-medium-emphasis mt-2">No upcoming matches</p>
                <v-btn variant="tonal" size="small" :to="{ name: 'tournaments' }" class="mt-2">
                  Browse Tournaments
                </v-btn>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Guest View: what is on, then how to get in -->
    <div v-else class="landing mx-auto">
      <div class="mb-10" style="max-width: 640px">
        <h1 class="text-h3 font-weight-bold mb-4">CS2 10 Mans</h1>
        <p class="text-h6 font-weight-regular text-medium-emphasis mb-6" style="line-height: 1.5">
          Amateur five-a-side leagues and cups, run by the people who play in them.
          Watch tonight's bracket first; sign in when you want to enter.
        </p>
        <div class="d-flex align-center ga-2 flex-wrap">
          <!-- Steam is the only sign-in method (accounts ARE Steam
               identities) — send guests straight there. -->
          <v-btn color="primary" size="large" to="/login" prepend-icon="mdi-steam" data-testid="landing-sign-in">
            Sign in with Steam
          </v-btn>
          <v-btn variant="text" size="large" :to="{ name: 'leagues' }">Browse leagues</v-btn>
        </div>
      </div>

      <v-progress-linear v-if="loadingLanding" indeterminate class="mb-6" />
      <div v-else class="d-flex flex-column ga-3 mb-10" data-testid="landing-rows">
        <v-card v-for="row in landingRows" :key="row.kind" :to="row.to" hover>
          <v-card-text class="d-flex align-center ga-5">
            <v-avatar size="48" rounded="lg" color="surface-variant" class="flex-shrink-0">
              <v-icon>{{ row.icon }}</v-icon>
            </v-avatar>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="text-caption text-uppercase landing-eyebrow">{{ row.eyebrow }}</div>
              <div class="text-h6">{{ row.title }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ row.text }}</div>
            </div>
            <v-btn variant="tonal" class="flex-shrink-0">{{ row.action }}</v-btn>
          </v-card-text>
        </v-card>
        <v-card v-if="landingRows.length === 0" variant="outlined">
          <v-card-text class="text-body-2 text-medium-emphasis">
            Nothing is running right now. Leagues and cups appear here as soon as one opens.
          </v-card-text>
        </v-card>
      </div>

      <v-card variant="outlined">
        <v-card-title class="text-subtitle-1">How it works</v-card-title>
        <v-divider />
        <v-card-text>
          <v-row>
            <v-col v-for="(step, i) in HOW_IT_WORKS" :key="step.title" cols="6" md="3">
              <div class="text-h5 font-weight-medium text-primary">{{ i + 1 }}</div>
              <div class="text-subtitle-2">{{ step.title }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ step.text }}</div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useGamesStore } from '@/stores/games'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useLeaguesStore } from '@/stores/leagues'
import { api } from '@/api'
import { unwrapApi } from '@/stores/helpers'
import type { components } from '@/api/types'
import CaptainActionsWidget from '@/components/CaptainActionsWidget.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import { matchStatusMap, teamRoleMap, getStatusColor, getStatusLabel } from '@/utils/statusMaps'
import { formatMatchFormat } from '@/utils/matchStatus'

type TournamentMatchResponse = components['schemas']['TournamentMatchResponse']
type TournamentResponse = components['schemas']['TournamentResponse']

/** One line of the signed-out landing: what is on, and where it leads. */
interface LandingRow {
  kind: 'live' | 'open' | 'league'
  eyebrow: string
  icon: string
  title: string
  text: string
  action: string
  to: object
}

const HOW_IT_WORKS = [
  { title: 'Sign in with Steam', text: 'No separate password.' },
  { title: 'Join a league', text: 'Open leagues take anyone.' },
  { title: 'Make or join a team', text: 'Rosters are per season, five a side.' },
  { title: 'Enter a cup', text: 'Check in, veto maps, play, report.' },
]

interface UpcomingMatch {
  match: TournamentMatchResponse
  tournamentName: string
  tournamentSlug: string
}

const authStore = useAuthStore()
const gamesStore = useGamesStore()
const leagueTeamsStore = useLeagueTeamsStore()
const leaguesStore = useLeaguesStore()

const loadingTeams = ref(true)
const loadingInvitations = ref(false)
const loadingMatches = ref(false)
const loadingLanding = ref(false)
const upcomingMatches = ref<UpcomingMatch[]>([])
const landingRows = ref<LandingRow[]>([])

/**
 * Match statuses that mean the match is OVER — nothing left for the player to
 * do on it. Everything else in `matchStatusMap` is, by definition, a state the
 * player may still need to act on, so the active list is derived rather than
 * hand-maintained.
 *
 * The previous hand-written list carried `scheduling` (never a backend status)
 * and omitted `ready`, `pick_ban` and `awaiting_result` — so a match sitting in
 * map veto, or waiting on the player to submit a result, was hidden from
 * "Upcoming Matches" exactly when the player needed to act. See
 * COVERAGE-PLAN.md §9b P-20. Keys mirror `TournamentMatchStatus`
 * (api/crates/portal-core/src/types/tournament.rs:231).
 */
const TERMINAL_MATCH_STATUSES = new Set(['completed', 'cancelled', 'forfeit', 'disputed'])

const ACTIVE_MATCH_STATUSES = Object.keys(matchStatusMap).filter(
  s => !TERMINAL_MATCH_STATUSES.has(s)
)

const activeGames = computed(() => gamesStore.games.filter(g => g.status === 'active'))
const { myTeams, myInvitations } = storeToRefs(leagueTeamsStore)
const { myLeagues } = storeToRefs(leaguesStore)

/** Nothing joined yet: greet, don't welcome back. */
const isNewHere = computed(() => !loadingTeams.value && myTeams.value.length === 0 && myLeagues.value.length === 0)
const welcomeLine = computed(() => {
  if (loadingTeams.value || myTeams.value.length > 0) return 'Choose a game to get started'
  if (myLeagues.value.length === 0) return 'Three steps and you are on a roster.'
  return `You are in ${myLeagues.value[0]!.league_name}. Next: join or make a team.`
})

/**
 * The three steps to a roster, with the next one lit. Only shown while the
 * player has no team; a captain sees the action widget instead.
 */
const playSteps = computed(() => {
  const inLeague = myLeagues.value.length > 0
  const league = myLeagues.value[0]
  const createTeam = league
    ? { name: 'league-detail', params: { id: league.league_id }, query: { tab: 'teams' } }
    : { name: 'leagues' }
  return [
    {
      title: 'Join a league',
      text: 'Open leagues take anyone.',
      state: inLeague ? 'done' : 'current',
      actions: [{ label: 'Find a league', to: { name: 'leagues' }, primary: true }],
    },
    {
      title: 'Join or make a team',
      text: 'Rosters are per season, five a side.',
      state: inLeague ? 'current' : 'pending',
      actions: [
        { label: 'Find a team', to: { name: 'find-team' }, primary: true },
        { label: 'Create a team', to: createTeam, primary: false },
      ],
    },
    {
      title: 'Enter a cup',
      text: 'Check in, veto maps, play, report.',
      state: 'pending',
      actions: [],
    },
  ] as const
})

onMounted(async () => {
  // Fetch games for all users
  await gamesStore.fetchGames()

  // Fetch user-specific data if authenticated
  if (authStore.isAuthenticated) {
    loadingTeams.value = true
    loadingInvitations.value = true

    try {
      await Promise.all([
        leagueTeamsStore.fetchMyTeams(),
        leagueTeamsStore.fetchMyInvitations(),
        leaguesStore.fetchMyLeagues(),
        leaguesStore.fetchLeagues(1, 100), // Fetch leagues to count per game
      ])
    } catch {
      // Silently fail - widgets will show empty state
    } finally {
      loadingTeams.value = false
      loadingInvitations.value = false
    }

    // Fetch upcoming matches (non-blocking, uses API directly to avoid overwriting store state)
    fetchUpcomingMatches()
  } else {
    loadingTeams.value = false
    fetchLanding()
  }
})

/**
 * What a visitor is shown: a live cup, a cup taking entries, and the leagues
 * behind them — each with the one fact that makes it worth a click. All from
 * public endpoints; nothing here needs an account.
 */
async function fetchLanding() {
  loadingLanding.value = true
  const rows: LandingRow[] = []
  const shortDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : null
  const nameOfLeague = new Map<string, string>()
  const leagueName = async (id: string | null | undefined) => {
    if (!id) return null
    if (!nameOfLeague.has(id)) {
      const r = await api.GET('/v1/leagues/{league_id}', { params: { path: { league_id: id } } }).catch(() => null)
      nameOfLeague.set(id, r?.data?.data?.name ?? '')
    }
    return nameOfLeague.get(id) || null
  }
  // The list gives summaries; the two cups shown need their full record for
  // the registration window and the match format.
  const fullCup = async (id: string | undefined): Promise<TournamentResponse | undefined> => {
    if (!id) return undefined
    const r = await api.GET('/v1/tournaments/{tournament_id}', { params: { path: { tournament_id: id } } }).catch(() => null)
    return r?.data?.data
  }
  try {
    const [live, open, leagues] = await Promise.all([
      api.GET('/v1/tournaments', { params: { query: { status: 'in_progress', per_page: 3 } } }).catch(() => null),
      api.GET('/v1/tournaments', { params: { query: { status: 'registration', per_page: 5 } } }).catch(() => null),
      api.GET('/v1/leagues', { params: { query: { per_page: 3 } } }).catch(() => null),
    ])

    const liveCup = await fullCup(live?.data?.data?.[0]?.id)
    if (liveCup) {
      const league = await leagueName(liveCup.league_id)
      rows.push({
        kind: 'live', eyebrow: 'Tonight', icon: 'mdi-play-circle-outline',
        title: liveCup.name,
        text: [league, formatMatchFormat(liveCup.default_match_format), 'Live now'].filter(Boolean).join(' · '),
        action: 'Watch bracket',
        to: { name: 'tournament-detail', params: { slug: liveCup.slug } },
      })
    }

    // Of the cups taking entries, the one closing soonest is the one to show.
    const openCups = (await Promise.all(
      (open?.data?.data ?? []).filter(t => t.is_registration_open).map(t => fullCup(t.id)),
    )).filter((t): t is TournamentResponse => !!t)
    const openCup = openCups.sort((a, b) => {
      const ta = a.registration_end ? new Date(a.registration_end).getTime() : Infinity
      const tb = b.registration_end ? new Date(b.registration_end).getTime() : Infinity
      return ta - tb
    })[0]
    if (openCup) {
      const [league, counts] = await Promise.all([
        leagueName(openCup.league_id),
        api.GET('/v1/tournaments/{tournament_id}/registrations/counts', { params: { path: { tournament_id: openCup.id } } }).catch(() => null),
      ])
      const entered = counts?.data?.data?.active
      const closes = shortDate(openCup.registration_end)
      rows.push({
        kind: 'open', eyebrow: 'Open for entry', icon: 'mdi-trophy-outline',
        title: league ? `${openCup.name} · ${league}` : openCup.name,
        text: [
          entered != null ? `${entered} of ${openCup.max_participants} teams in` : null,
          closes ? `closes ${closes}` : null,
          formatMatchFormat(openCup.default_match_format),
        ].filter(Boolean).join(' · '),
        action: 'See the cup',
        to: { name: 'tournament-detail', params: { slug: openCup.slug } },
      })
    }

    for (const league of (leagues?.data?.data ?? []).slice(0, 2)) {
      let text = 'Open to join'
      let title = league.name
      if (league.current_season_id) {
        const [season, teams] = await Promise.all([
          api.GET('/v1/league-seasons/{season_id}', { params: { path: { season_id: league.current_season_id } } }).catch(() => null),
          api.GET('/v1/league-seasons/{season_id}/teams', { params: { path: { season_id: league.current_season_id }, query: { per_page: 100 } } }).catch(() => null),
        ])
        const s = season?.data?.data
        if (s) {
          title = `${league.name} · ${s.name}`
          const n = teams?.data?.data?.length ?? 0
          const parts = [
            s.status === 'registration' && s.registration_end ? `Registration open until ${shortDate(s.registration_end)}` : null,
            `${n} ${n === 1 ? 'team' : 'teams'}`,
            s.season_start && s.season_end ? `plays ${shortDate(s.season_start)} – ${shortDate(s.season_end)}` : null,
          ]
          text = parts.filter(Boolean).join(' · ')
        }
      }
      rows.push({
        kind: 'league', eyebrow: 'Leagues', icon: 'mdi-shield-outline',
        title, text, action: 'See the league',
        to: { name: 'league-detail', params: { id: league.id } },
      })
    }
  } finally {
    landingRows.value = rows
    loadingLanding.value = false
  }
}

/**
 * P-190: this used to scan 5 in-progress tournaments' registration lists at
 * `per_page: 100` and match only `r.player_id` — so a TEAM participant (whose
 * registration has no player_id) never saw any upcoming match, and past
 * registration row 100 (or live tournament #6) neither did anyone else. The
 * server already answers the actual question — `/v1/users/me/matches` joins
 * both individual registrations AND team membership — so ask it, and resolve
 * tournament names for just the tournaments that actually appear.
 */
async function fetchUpcomingMatches() {
  if (!authStore.playerId) return

  loadingMatches.value = true
  try {
    const matchesResult = await unwrapApi(api.GET('/v1/users/me/matches', {
      params: { query: { limit: 50 } },
    }))
    const active = matchesResult.data.filter(m => ACTIVE_MATCH_STATUSES.includes(m.status))
    if (active.length === 0) {
      upcomingMatches.value = []
      return
    }

    const tournamentIds = [...new Set(active.map(m => m.tournament_id))]
    const tournaments = await Promise.all(
      tournamentIds.map(id =>
        unwrapApi(api.GET('/v1/tournaments/{tournament_id}', {
          params: { path: { tournament_id: id } },
        }))
          .then(r => r.data)
          .catch(() => null)
      )
    )
    const byId = new Map(tournaments.filter(t => t !== null).map(t => [t.id, t]))

    upcomingMatches.value = active.map(m => {
      const tournament = byId.get(m.tournament_id)
      return {
        match: m,
        tournamentName: tournament?.name ?? 'Tournament',
        tournamentSlug: tournament?.slug ?? '',
      }
    })
  } catch (e) {
    console.error('Failed to fetch upcoming matches:', e)
  } finally {
    loadingMatches.value = false
  }
}

function matchStatusColor(status: string): string {
  return getStatusColor(matchStatusMap, status)
}

function matchStatusLabel(status: string): string {
  return getStatusLabel(matchStatusMap, status)
}

// P-132: the "My Teams" card printed `membership.role` straight from the wire,
// so the logged-in player's own dashboard said "substitute".
function getRoleLabel(role: string): string {
  return getStatusLabel(teamRoleMap, role)
}

function formatMatchTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours < 0) return 'Started'
  if (diffHours < 1) return `in ${Math.round(diffMs / 60000)}m`
  if (diffHours < 24) return `in ${Math.round(diffHours)}h`

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function getLeagueCountForGame(gameId: string): number {
  return leaguesStore.leagues.filter(l => l.game_id === gameId).length
}
</script>

<style scoped>
.landing {
  max-width: 1040px;
  padding: 32px 0;
}
.landing-eyebrow {
  color: rgb(var(--v-theme-primary));
  letter-spacing: 0.1em;
}
.get-playing {
  border-color: rgba(var(--v-theme-primary), 0.5);
}
.game-card {
  transition: transform 0.2s, box-shadow 0.2s;
}

.game-card:hover {
  transform: translateY(-4px);
}
</style>
