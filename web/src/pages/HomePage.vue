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
            Welcome back{{ authStore.player?.display_name ? `, ${authStore.player.display_name}` : '' }}!
          </h1>
          <p class="text-body-1 text-medium-emphasis">Choose a game to get started</p>
        </v-col>
      </v-row>

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
                <v-btn variant="tonal" size="small" :to="{ name: 'leagues' }" class="mt-2">
                  Browse Leagues
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

    <!-- Guest View -->
    <template v-else>
      <!-- Hero Section -->
      <v-row justify="center" class="mb-8">
        <v-col cols="12" md="8" class="text-center">
          <h1 class="text-h2 font-weight-bold mb-4">Gaming Portal</h1>
          <p class="text-h6 text-medium-emphasis mb-6">
            Competitive gaming platform for teams and players
          </p>
          <v-row justify="center">
            <v-col cols="auto">
              <v-btn color="primary" size="large" to="/login">
                <v-icon start>mdi-login</v-icon>
                Sign In
              </v-btn>
            </v-col>
            <v-col cols="auto">
              <v-btn color="secondary" size="large" to="/register">
                <v-icon start>mdi-account-plus</v-icon>
                Create Account
              </v-btn>
            </v-col>
          </v-row>
        </v-col>
      </v-row>

      <!-- Game Selection Grid (Guest) -->
      <v-row class="mb-8">
        <v-col cols="12">
          <h2 class="text-h6 mb-4 text-center">
            <v-icon start>mdi-gamepad-variant</v-icon>
            Available Games
          </h2>
        </v-col>
        <v-col v-if="gamesStore.fetchGamesState.loading" cols="12" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" />
        </v-col>
        <template v-else>
          <v-col v-for="game in activeGames" :key="game.id" cols="6" sm="4" md="3" lg="2">
            <v-card class="game-card text-center pa-4" hover @click="promptLogin">
              <v-avatar size="64" class="mb-2" rounded="lg">
                <v-img alt="" v-if="game.icon_url" :src="game.icon_url" />
                <v-icon v-else size="32">mdi-gamepad-variant</v-icon>
              </v-avatar>
              <div class="text-subtitle-2 font-weight-medium">{{ game.display_name }}</div>
            </v-card>
          </v-col>
        </template>
      </v-row>

      <!-- Feature Cards -->
      <v-row>
        <v-col cols="12" md="4">
          <v-card class="pa-6 text-center" height="100%">
            <v-icon size="48" color="primary" class="mb-4">mdi-trophy</v-icon>
            <h3 class="text-h5 mb-2">Compete</h3>
            <p class="text-body-2 text-medium-emphasis">
              Join tournaments and leagues across multiple games
            </p>
          </v-card>
        </v-col>
        <v-col cols="12" md="4">
          <v-card class="pa-6 text-center" height="100%">
            <v-icon size="48" color="secondary" class="mb-4">mdi-account-group</v-icon>
            <h3 class="text-h5 mb-2">Team Up</h3>
            <p class="text-body-2 text-medium-emphasis">
              Create or join teams and build your roster
            </p>
          </v-card>
        </v-col>
        <v-col cols="12" md="4">
          <v-card class="pa-6 text-center" height="100%">
            <v-icon size="48" color="accent" class="mb-4">mdi-chart-line</v-icon>
            <h3 class="text-h5 mb-2">Track Stats</h3>
            <p class="text-body-2 text-medium-emphasis">
              Monitor your performance and climb the rankings
            </p>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Login Prompt Snackbar -->
    <v-snackbar v-model="showLoginPrompt" timeout="3000">
      Sign in to browse leagues and join teams
      <template v-slot:actions>
        <v-btn color="primary" variant="text" to="/login">Sign In</v-btn>
      </template>
    </v-snackbar>
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

type TournamentMatchResponse = components['schemas']['TournamentMatchResponse']

interface UpcomingMatch {
  match: TournamentMatchResponse
  tournamentName: string
  tournamentSlug: string
}

const authStore = useAuthStore()
const gamesStore = useGamesStore()
const leagueTeamsStore = useLeagueTeamsStore()
const leaguesStore = useLeaguesStore()

const loadingTeams = ref(false)
const loadingInvitations = ref(false)
const loadingMatches = ref(false)
const showLoginPrompt = ref(false)
const upcomingMatches = ref<UpcomingMatch[]>([])

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
  }
})

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

function promptLogin() {
  showLoginPrompt.value = true
}
</script>

<style scoped>
.game-card {
  transition: transform 0.2s, box-shadow 0.2s;
}

.game-card:hover {
  transform: translateY(-4px);
}
</style>
