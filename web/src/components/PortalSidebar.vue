<template>
  <!-- Permanent rail on desktop; temporary overlay on phones so the
       app-bar toggle actually works and content isn't crushed. -->
  <v-navigation-drawer
    v-model="open"
    :rail="rail && mdAndUp"
    :permanent="mdAndUp"
    :temporary="!mdAndUp"
    color="surface"
  >
    <v-list density="compact" nav>
      <v-list-item
        prepend-icon="mdi-home-outline"
        title="Home"
        :to="{ name: 'home' }"
        :active="route.name === 'home'"
      >
        <!-- Action-items badge lives here: the widget is on the dashboard. -->
        <template v-slot:append v-if="actionCount > 0">
          <v-badge :content="actionCount" :color="hasCriticalAction ? 'error' : 'warning'" inline />
        </template>
      </v-list-item>

      <v-list-subheader v-if="!rail">Play</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-account-search-outline"
        title="Find a team"
        :subtitle="rail ? undefined : 'Rosters with open slots. Ask to join.'"
        :to="{ name: 'find-team' }"
        :active="route.name === 'find-team'"
        lines="two"
      />

      <v-list-item
        prepend-icon="mdi-play-outline"
        title="Play now"
        :subtitle="rail ? undefined : 'Pick-up games. No team needed.'"
        :to="{ name: 'pugs' }"
        :active="route.name?.toString().startsWith('pug')"
        lines="two"
      />

      <!-- Your league: membership, not location. It never changes with the page. -->
      <template v-if="isAuthenticated">
        <template v-if="myLeague">
          <v-sheet
            v-if="!rail"
            class="my-league mx-2 mt-4 mb-1 pa-3"
            rounded="lg"
            border
            data-testid="sidebar-my-league"
          >
            <div class="d-flex align-center justify-space-between">
              <div class="text-caption text-medium-emphasis text-uppercase" style="letter-spacing: .1em">Your league</div>
              <v-menu v-if="memberships.length > 1" location="bottom end">
                <template v-slot:activator="{ props: menuProps }">
                  <v-btn v-bind="menuProps" variant="text" size="x-small" color="primary" aria-label="Switch league">
                    <v-icon start size="small">mdi-swap-horizontal</v-icon>Switch
                  </v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item
                    v-for="m in memberships"
                    :key="m.league_id"
                    :title="m.league_name"
                    :active="m.league_id === myLeague.id"
                    @click="selectLeague(m.league_id)"
                  />
                </v-list>
              </v-menu>
            </div>
            <router-link :to="leagueTo('overview')" class="text-subtitle-2 font-weight-medium text-decoration-none text-high-emphasis d-block mt-1">
              {{ myLeague.name }}
            </router-link>
            <div class="text-body-2">
              {{ myLeague.seasonName ?? 'No season yet' }}<template v-if="myLeague.seasonStatus"> · {{ seasonStatusLabel(myLeague.seasonStatus) }}</template>
            </div>
          </v-sheet>
          <v-list-item
            v-else
            prepend-icon="mdi-trophy-variant"
            :title="myLeague.name"
            :to="leagueTo('overview')"
          />
          <div v-if="!rail" class="my-league-children ml-4">
            <v-list-item
              prepend-icon="mdi-view-dashboard-outline"
              title="Overview"
              :to="leagueTo('overview')"
              :active="leagueTabActive('overview')"
            />
            <v-list-item
              prepend-icon="mdi-account-group-outline"
              :title="withCount('Teams', myLeague.teamsCount)"
              :to="leagueTo('teams')"
              :active="leagueTabActive('teams')"
            />
            <v-list-item
              prepend-icon="mdi-tournament"
              :title="withCount('Tournaments', myLeague.tournamentsCount)"
              :to="leagueTo('tournaments')"
              :active="leagueTabActive('tournaments') || tournamentInMyLeague"
            />
            <v-list-item
              prepend-icon="mdi-podium"
              title="Standings"
              :to="leagueTo('standings')"
              :active="leagueTabActive('standings')"
            />
          </div>
        </template>

        <v-sheet
          v-else-if="!rail && !myLeagueLoading"
          class="my-league mx-2 mt-4 mb-1 pa-3"
          rounded="lg"
          border
          data-testid="sidebar-no-league"
        >
          <div class="text-caption text-medium-emphasis text-uppercase" style="letter-spacing: .1em">Your league</div>
          <div class="text-body-2 mt-1 mb-2">You are not in a league yet. Join one to get a team and enter cups.</div>
          <v-btn color="primary" size="small" prepend-icon="mdi-magnify" :to="{ name: 'leagues' }">Find a league</v-btn>
        </v-sheet>
      </template>

      <v-list-subheader v-if="!rail">Browse</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-trophy-outline"
        title="All leagues"
        :subtitle="rail ? undefined : 'Find another league to join'"
        :to="{ name: 'leagues' }"
        :active="route.name === 'leagues' || (route.name === 'league-detail' && !viewingMyLeague)"
        lines="two"
      />

      <v-list-item
        prepend-icon="mdi-tournament"
        title="All tournaments"
        :subtitle="rail ? undefined : 'Cups run inside a league season'"
        :to="{ name: 'tournaments' }"
        :active="route.name === 'tournaments' || ((route.name?.toString().startsWith('tournament-') || route.name?.toString().startsWith('match')) && !tournamentInMyLeague)"
        lines="two"
      />

      <v-list-subheader v-if="!rail">You</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-shield-account-outline"
        title="My teams"
        :to="{ name: 'my-teams' }"
        :active="route.name === 'my-teams' || route.name?.toString().startsWith('team')"
      />

      <v-list-item
        prepend-icon="mdi-email-outline"
        title="Invitations"
        :to="{ name: 'invitations' }"
        :active="route.name === 'invitations'"
      >
        <template v-slot:append v-if="pendingInvitationsCount > 0">
          <v-badge :content="pendingInvitationsCount" color="warning" inline />
        </template>
      </v-list-item>

      <v-list-item
        prepend-icon="mdi-account-outline"
        title="Profile"
        :to="{ name: 'profile' }"
        :active="route.name?.toString().startsWith('profile')"
      />

      <v-list-item
        prepend-icon="mdi-account-multiple-outline"
        title="Players"
        :to="{ name: 'players' }"
        :active="route.name?.toString().startsWith('player')"
      />
    </v-list>

    <template v-slot:append>
      <v-list density="compact" nav>
        <v-list-item
          :prepend-icon="rail ? 'mdi-chevron-right' : 'mdi-chevron-left'"
          :title="rail ? '' : 'Collapse'"
          @click="$emit('update:rail', !rail)"
        />
      </v-list>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useLeaguesStore } from '@/stores/leagues'
import { useTournamentsStore } from '@/stores/tournaments'
import { useCaptainActionsStore } from '@/stores/captainActions'
import { useMyLeague } from '@/composables/useMyLeague'
import { getStatusLabel, seasonStatusMap } from '@/utils/statusMaps'

const route = useRoute()
const { mdAndUp } = useDisplay()
const authStore = useAuthStore()
const leagueTeamsStore = useLeagueTeamsStore()
const leaguesStore = useLeaguesStore()
const tournamentsStore = useTournamentsStore()
const captainActionsStore = useCaptainActionsStore()
const { actionCount, hasCritical: hasCriticalAction } = storeToRefs(captainActionsStore)
const { myLeague, memberships, loading: myLeagueLoading, refresh: refreshMyLeague, selectLeague } = useMyLeague()

defineProps<{
  rail: boolean
}>()

defineEmits<{
  'update:rail': [value: boolean]
}>()

const open = defineModel<boolean>({ required: true })

const isAuthenticated = computed(() => authStore.isAuthenticated)

const pendingInvitationsCount = computed(() =>
  leagueTeamsStore.myInvitations.length + leaguesStore.myLeagueInvitations.length
)

const seasonStatusLabel = (status: string) => getStatusLabel(seasonStatusMap, status)
const withCount = (label: string, n: number | null) => (n == null ? label : `${label} · ${n}`)

function leagueTo(tab: string) {
  if (!myLeague.value) return { name: 'leagues' }
  return {
    name: 'league-detail',
    params: { id: myLeague.value.id },
    query: { ...(myLeague.value.seasonId ? { season: myLeague.value.seasonId } : {}), tab },
  }
}

const viewingMyLeague = computed(
  () => route.name === 'league-detail' && !!myLeague.value && route.params.id === myLeague.value.id,
)
function leagueTabActive(tab: string) {
  if (!viewingMyLeague.value) return false
  return ((route.query.tab as string | undefined) ?? 'overview') === tab
}
const tournamentInMyLeague = computed(() => {
  const name = route.name?.toString() ?? ''
  if (!name.startsWith('tournament-') && !name.startsWith('match')) return false
  return !!myLeague.value && tournamentsStore.currentTournament?.league_id === myLeague.value.id
})

onMounted(async () => {
  // Fetch invitations for the badge count
  try {
    await Promise.all([
      leagueTeamsStore.fetchMyInvitations(),
      leaguesStore.fetchMyLeagueInvitations(),
    ])
  } catch {
    // Silently fail - badge just won't show
  }
  await refreshMyLeague()
})
</script>

<style scoped>
.my-league {
  background: rgba(255, 255, 255, 0.04);
}
.my-league-children {
  border-left: 1px solid rgba(var(--v-border-color), 0.3);
}
</style>
