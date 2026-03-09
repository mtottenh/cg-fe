<template>
  <div>
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
        <v-col v-if="gamesStore.loading" cols="12" class="text-center py-8">
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
                <v-img v-if="game.icon_url" :src="game.icon_url" />
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
                    <v-list-item-subtitle>{{ membership.role }}</v-list-item-subtitle>
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
        <v-col v-if="gamesStore.loading" cols="12" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" />
        </v-col>
        <template v-else>
          <v-col v-for="game in activeGames" :key="game.id" cols="6" sm="4" md="3" lg="2">
            <v-card class="game-card text-center pa-4" hover @click="promptLogin">
              <v-avatar size="64" class="mb-2" rounded="lg">
                <v-img v-if="game.icon_url" :src="game.icon_url" />
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useGamesStore } from '@/stores/games'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useLeaguesStore } from '@/stores/leagues'
import { api } from '@/api'
import { unwrapApi } from '@/stores/helpers'
import type { components } from '@/api/types'
import CaptainActionsWidget from '@/components/CaptainActionsWidget.vue'

type TournamentMatchResponse = components['schemas']['TournamentMatchResponse']
type TournamentRegistrationResponse = components['schemas']['TournamentRegistrationResponse']

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

const ACTIVE_MATCH_STATUSES = ['pending', 'scheduling', 'scheduled', 'checking_in', 'in_progress']

const matchStatusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'grey', label: 'Pending' },
  scheduling: { color: 'info', label: 'Scheduling' },
  scheduled: { color: 'warning', label: 'Scheduled' },
  checking_in: { color: 'orange', label: 'Check-in' },
  in_progress: { color: 'primary', label: 'Live' },
}

const activeGames = computed(() => gamesStore.games.filter(g => g.status === 'active'))
const myTeams = computed(() => leagueTeamsStore.myTeams)
const myInvitations = computed(() => leagueTeamsStore.myInvitations)

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

async function fetchUpcomingMatches() {
  if (!authStore.playerId) return

  loadingMatches.value = true
  try {
    // Get live tournaments
    const tournamentsResult = await unwrapApi(api.GET('/v1/tournaments', {
      params: { query: { status: 'in_progress', per_page: 5 } },
    }))
    const liveTournaments = tournamentsResult.data

    if (liveTournaments.length === 0) return

    // For each tournament, fetch registrations and matches in parallel
    const results = await Promise.all(
      liveTournaments.map(async (tournament) => {
        try {
          const [regsResult, matchesResult] = await Promise.all([
            unwrapApi(api.GET('/v1/tournaments/{tournament_id}/registrations', {
              params: {
                path: { tournament_id: tournament.id },
                query: { per_page: 100 },
              },
            })),
            unwrapApi(api.GET('/v1/tournaments/{tournament_id}/matches', {
              params: { path: { tournament_id: tournament.id } },
            })),
          ])

          const regs: TournamentRegistrationResponse[] = regsResult.data
          const matches: TournamentMatchResponse[] = matchesResult.data

          // Find the player's registration in this tournament
          const myReg = regs.find(r => r.player_id === authStore.playerId)
          if (!myReg) return []

          // Filter matches where the player is a participant with an active status
          return matches
            .filter(
              m =>
                ACTIVE_MATCH_STATUSES.includes(m.status) &&
                (m.participant1_registration_id === myReg.id ||
                  m.participant2_registration_id === myReg.id)
            )
            .map(m => ({
              match: m,
              tournamentName: tournament.name,
              tournamentSlug: tournament.slug,
            }))
        } catch (e) {
          console.error('Failed to fetch matches for tournament:', e)
          return []
        }
      })
    )

    upcomingMatches.value = results.flat()
  } catch (e) {
    console.error('Failed to fetch upcoming matches:', e)
  } finally {
    loadingMatches.value = false
  }
}

function matchStatusColor(status: string): string {
  return matchStatusMap[status]?.color ?? 'grey'
}

function matchStatusLabel(status: string): string {
  return matchStatusMap[status]?.label ?? status
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
