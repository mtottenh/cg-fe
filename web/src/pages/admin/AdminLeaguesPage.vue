<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Leagues</h1>
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        @click="createModalOpen = true"
      >
        Create League
      </v-btn>
    </div>

    <ErrorAlert :error="error" retryable @clear="clearError" @retry="fetchData" />

    <v-card class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          label="Search leagues..."
          single-line
          hide-details
          density="compact"
          variant="outlined"
          class="mr-4"
          style="max-width: 300px"
        />
        <v-spacer />
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="fetchData"
        >
          Refresh
        </v-btn>
      </v-card-title>
    </v-card>

    <!-- Loading State -->
    <v-card v-if="loading" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-medium-emphasis mt-4">Loading leagues...</p>
    </v-card>

    <!-- Empty State -->
    <v-card v-else-if="adminLeagues.length === 0" class="pa-8 text-center">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-trophy-outline</v-icon>
      <h3 class="text-h6 mb-2">No Leagues Found</h3>
      <p class="text-medium-emphasis mb-4">
        {{ authStore.isAdmin
          ? 'No leagues exist yet. Create your first league to get started.'
          : "You don't have admin access to any leagues yet. Create your first league to get started." }}
      </p>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="createModalOpen = true">
        Create League
      </v-btn>
    </v-card>

    <!-- Grouped by Game -->
    <template v-else>
      <v-expansion-panels v-model="expandedPanels" multiple>
        <v-expansion-panel
          v-for="group in filteredGroups"
          :key="group.gameId"
          :value="group.gameId"
        >
          <v-expansion-panel-title>
            <div class="d-flex align-center">
              <v-avatar size="32" rounded="sm" class="mr-3">
                <v-img alt="" v-if="group.game?.icon_url" :src="group.game.icon_url" />
                <v-icon v-else>mdi-gamepad-variant</v-icon>
              </v-avatar>
              <span class="text-subtitle-1 font-weight-medium">
                {{ group.game?.display_name || 'Unknown Game' }}
              </span>
              <v-chip size="small" class="ml-3" color="primary" variant="tonal">
                {{ group.leagues.length }} {{ group.leagues.length === 1 ? 'league' : 'leagues' }}
              </v-chip>
            </div>
          </v-expansion-panel-title>

          <v-expansion-panel-text>
            <div class="table-scroll">
              <v-data-table
                :headers="headers"
                :items="group.leagues"
                :items-per-page="10"
                class="elevation-0"
                density="comfortable"
              >
                <template v-slot:item.league_logo_url="{ item }">
                  <v-avatar size="32" rounded="sm">
                    <v-img alt="" v-if="item.league_logo_url" :src="item.league_logo_url" />
                    <v-icon v-else>mdi-trophy</v-icon>
                  </v-avatar>
                </template>

                <template v-slot:item.league_name="{ item }">
                  <div>
                    <div class="font-weight-medium">{{ item.league_name }}</div>
                    <div class="text-caption text-medium-emphasis">{{ item.league_slug }}</div>
                  </div>
                </template>

                <template v-slot:item.league_status="{ item }">
                  <v-chip
                    v-if="item.archived_at"
                    color="grey"
                    size="small"
                    variant="flat"
                  >
                    Archived
                  </v-chip>
                  <v-chip
                    v-else
                    :color="getLeagueStatusColor(item.league_status)"
                    size="small"
                    variant="flat"
                  >
                    {{ getLeagueStatusLabel(item.league_status) }}
                  </v-chip>
                </template>

                <template v-slot:item.membership_type="{ item }">
                  <v-chip
                    v-if="item.membership_type"
                    :color="getRoleColor(item.membership_type)"
                    size="small"
                    variant="flat"
                  >
                    {{ formatRole(item.membership_type) }}
                  </v-chip>
                  <span v-else class="text-medium-emphasis">Not a member</span>
                </template>

                <template v-slot:item.joined_at="{ item }">
                  <span v-if="item.joined_at">{{ formatDate(item.joined_at) }}</span>
                  <span v-else class="text-medium-emphasis">—</span>
                </template>

                <!-- Labelled, on one line: four bare icons wrapped into a
                     2×2 cluster nobody read as "edit", "seasons", "archive". -->
                <template v-slot:item.actions="{ item }">
                  <div class="d-flex align-center justify-end ga-1 flex-nowrap">
                    <v-btn
                      aria-label="Edit settings"
                      title="Edit Settings"
                      size="small"
                      variant="text"
                      prepend-icon="mdi-pencil"
                      data-testid="league-edit"
                      @click="openEditModal(item)"
                    >
                      Edit
                    </v-btn>
                    <v-btn
                      aria-label="Manage seasons and teams"
                      title="Manage Seasons & Teams"
                      size="small"
                      variant="text"
                      prepend-icon="mdi-calendar-multiple"
                      data-testid="league-seasons"
                      @click="openDetailModal(item)"
                    >
                      Seasons &amp; teams
                    </v-btn>
                    <v-btn
                      aria-label="Manage members"
                      title="Manage Members"
                      size="small"
                      variant="text"
                      prepend-icon="mdi-account-group"
                      data-testid="league-members"
                      @click="openMembersModal(item)"
                    >
                      Members
                    </v-btn>
                    <v-menu location="bottom end">
                      <template v-slot:activator="{ props: menuProps }">
                        <v-btn v-bind="menuProps" aria-label="More actions" icon size="small" variant="text" data-testid="league-more">
                          <v-icon>mdi-dots-vertical</v-icon>
                        </v-btn>
                      </template>
                      <v-list density="compact">
                        <v-list-item
                          :prepend-icon="item.archived_at ? 'mdi-restore' : 'mdi-archive-arrow-down'"
                          :title="item.archived_at ? 'Restore league' : 'Archive league'"
                          :subtitle="item.archived_at ? 'Players see it again' : 'Hides it and its seasons, teams and tournaments from players'"
                          :data-testid="item.archived_at ? 'league-restore' : 'league-archive'"
                          @click="setLeagueArchived(item, !item.archived_at)"
                        />
                      </v-list>
                    </v-menu>
                  </div>
                </template>

                <template v-slot:no-data>
                  <div class="text-center pa-4">
                    <p class="text-medium-emphasis">No leagues in this game</p>
                  </div>
                </template>
              </v-data-table>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </template>

    <ConfirmDialogHost :dialog="confirmDialog" />

    <!-- Modals -->
    <LeagueCreateModal
      v-model="createModalOpen"
      :games="gamesStore.games"
      @created="onLeagueCreated"
    />

    <LeagueEditModal
      v-model="editModalOpen"
      :league="selectedLeague"
      @saved="onLeagueSaved"
    />

    <LeagueMembersModal
      v-model="membersModalOpen"
      :league="selectedLeagueForMembers"
      @updated="onMembersUpdated"
    />

    <LeagueDetailModal
      v-model="detailModalOpen"
      :league="selectedLeagueForDetail"
      @updated="onDetailUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGamesStore, type GameSummary } from '@/stores/games'
import { useLeaguesStore, type UserLeagueMembership } from '@/stores/leagues'
import { useAuthStore } from '@/stores/auth'
import LeagueCreateModal from '@/components/admin/LeagueCreateModal.vue'
import LeagueEditModal from '@/components/admin/LeagueEditModal.vue'
import LeagueMembersModal from '@/components/admin/LeagueMembersModal.vue'
import LeagueDetailModal from '@/components/admin/LeagueDetailModal.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import { formatDate } from '@/utils/formatters'
import { leagueRoleMap, leagueStatusMap, getStatusColor, getStatusLabel, formatRole } from '@/utils/statusMaps'
import ErrorAlert from '@/components/ErrorAlert.vue'

// Stores
const gamesStore = useGamesStore()
const leaguesStore = useLeaguesStore()
const authStore = useAuthStore()

// Types
interface LeagueGroup {
  gameId: string
  game: GameSummary | null
  leagues: LeagueRow[]
}

// Local state (not from stores)
const search = ref('')
const expandedPanels = ref<string[]>([])

// Modal state
const createModalOpen = ref(false)
const editModalOpen = ref(false)
const membersModalOpen = ref(false)
const detailModalOpen = ref(false)
const selectedLeague = ref<UserLeagueMembership | null>(null)
const selectedLeagueForMembers = ref<UserLeagueMembership | null>(null)
const selectedLeagueForDetail = ref<UserLeagueMembership | null>(null)

// Snackbar
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

// Computed: loading from either store
// P-122: `gamesStore.loading`/`.error` aliased BOTH fetch states, so this page
// surfaced (and cleared) errors raised by AdminGamesPage's admin-only
// `fetchAllGames`. This page only ever awaits `fetchGames`, so it reads that.
const loading = computed(() =>
  gamesStore.fetchGamesState.loading ||
  leaguesStore.loading ||
  leaguesStore.fetchAllLeaguesState.loading
)
const error = computed(() =>
  gamesStore.fetchGamesState.error ||
  leaguesStore.error ||
  leaguesStore.fetchAllLeaguesState.error
)

function clearError() {
  gamesStore.fetchGamesState.error = null
  leaguesStore.error = null
  leaguesStore.fetchAllLeaguesState.error = null
}

// Table headers
const headers = [
  { title: '', key: 'league_logo_url', width: '50px', sortable: false },
  { title: 'Name', key: 'league_name' },
  { title: 'Status', key: 'league_status', width: '110px' },
  { title: 'Your Role', key: 'membership_type', width: '120px' },
  { title: 'Joined', key: 'joined_at', width: '140px' },
  { title: 'Actions', key: 'actions', width: '400px', sortable: false, align: 'end' as const },
]

// Admin roles - users with these roles can manage the league
const ADMIN_ROLES = ['owner', 'admin', 'moderator']

/** Whether `/v1/admin/leagues` actually answered.
 *
 * Web and API ship as separate packages, so a deployed frontend can be ahead
 * of the API it talks to — and an admin listing that 404s must not leave the
 * operator staring at an empty Leagues screen, which is the exact bug this
 * endpoint was added to fix. When it is unavailable we fall back to the
 * membership-derived list: narrower, but true. */
const adminListingLoaded = ref(false)

async function loadAdminListing() {
  adminListingLoaded.value = false
  try {
    await leaguesStore.fetchAllLeaguesAdmin()
    adminListingLoaded.value = true
  } catch {
    // Swallowed on purpose: the fallback below is the graceful path, and
    // surfacing this as a page error would bury a list that did load.
    leaguesStore.fetchAllLeaguesState.error = null
  }
}

const membershipsByLeagueId = computed(
  () => new Map(leaguesStore.myLeagues.map(m => [m.league_id, m]))
)

/** The leagues this screen manages.
 *
 * A site admin sees **every** league. This page used to be built purely from
 * `/v1/users/me/leagues`, so a league whose admin never joined it — or one
 * that had been archived, which that endpoint filtered out — was simply
 * absent from the operator's view of the site (reported live: 3 leagues
 * existed, 2 showed). League-scoped admins still see the leagues they
 * administer, which is all `/v1/admin/leagues` would give them anyway.
 */
/** A table row: a membership, plus whether the league is archived (which is
 *  a property of the league, not of the membership). */
type LeagueRow = UserLeagueMembership & { archived_at: string | null }

const adminLeagues = computed<LeagueRow[]>(() => {
  if (!authStore.isAdmin || !adminListingLoaded.value) {
    return leaguesStore.myLeagues
      .filter(l => ADMIN_ROLES.includes(l.membership_type))
      .map(l => ({ ...l, archived_at: null }))
  }
  return leaguesStore.allLeagues.map(league => {
    const membership = membershipsByLeagueId.value.get(league.id)
    return {
      league_id: league.id,
      league_name: league.name,
      league_slug: league.slug,
      league_logo_url: league.logo_url,
      game_id: league.game_id,
      league_status: league.status,
      archived_at: league.archived_at ?? null,
      // '' when the site admin is not a member: they can still manage it.
      membership_type: membership?.membership_type ?? '',
      joined_at: membership?.joined_at ?? '',
    }
  })
})

// Computed: Group leagues by game
const leaguesByGame = computed(() => {
  const groups = new Map<string, LeagueRow[]>()

  for (const league of adminLeagues.value) {
    const gameId = league.game_id
    if (!groups.has(gameId)) {
      groups.set(gameId, [])
    }
    groups.get(gameId)!.push(league)
  }

  // Convert to array with game info
  const result: LeagueGroup[] = []
  for (const [gameId, leagueList] of groups) {
    const game = gamesStore.games.find(g => g.id === gameId) || null
    result.push({
      gameId,
      game,
      leagues: leagueList.sort((a, b) => a.league_name.localeCompare(b.league_name)),
    })
  }

  // Sort by game name
  return result.sort((a, b) => {
    const nameA = a.game?.display_name || 'Unknown'
    const nameB = b.game?.display_name || 'Unknown'
    return nameA.localeCompare(nameB)
  })
})

// Computed: Apply search filter
const filteredGroups = computed(() => {
  if (!search.value) return leaguesByGame.value

  const q = search.value.toLowerCase()
  return leaguesByGame.value
    .map(group => ({
      ...group,
      leagues: group.leagues.filter(l =>
        l.league_name.toLowerCase().includes(q) ||
        l.league_slug.toLowerCase().includes(q)
      ),
    }))
    .filter(group => group.leagues.length > 0)
})

// Helpers
const getRoleColor = (role: string) => getStatusColor(leagueRoleMap, role)
const getLeagueStatusColor = (status: string) => getStatusColor(leagueStatusMap, status)
const getLeagueStatusLabel = (status: string) => getStatusLabel(leagueStatusMap, status)

// API calls - now using stores
async function fetchData() {
  try {
    // Memberships are still needed for the "Your Role" column even when the
    // admin listing supplies the rows.
    await Promise.all([
      leaguesStore.fetchMyLeagues(),
      gamesStore.fetchGames(),
      ...(authStore.isAdmin ? [loadAdminListing()] : []),
    ])

    // Expand all panels by default
    expandedPanels.value = leaguesByGame.value.map(g => g.gameId)
  } catch {
    // Errors are captured in the stores
  }
}

/** Archive or restore a league. Confirm-gated in the archiving direction:
 *  it takes the league and everything under it out of the player-facing site
 *  in one click. */
function setLeagueArchived(league: LeagueRow, archived: boolean) {
  if (!archived) {
    void runLeagueArchive(league, false)
    return
  }
  confirmDialog.confirm({
    title: `Archive "${league.league_name}"?`,
    message:
      'The league stops appearing to players, and so do its seasons, teams and tournaments. ' +
      'Nothing is deleted, none of them are modified, and restoring the league brings back ' +
      'exactly what archiving it hid.',
    action: 'Archive',
    handler: () => runLeagueArchive(league, true),
  })
}

async function runLeagueArchive(league: LeagueRow, archived: boolean) {
  await leaguesStore.setLeagueArchived(league.league_id, archived)
  snackbar.success(archived ? 'League archived' : 'League restored')
  await fetchData()
}

// Modal handlers
function openEditModal(league: UserLeagueMembership) {
  selectedLeague.value = league
  editModalOpen.value = true
}

function openMembersModal(league: UserLeagueMembership) {
  selectedLeagueForMembers.value = league
  membersModalOpen.value = true
}

function openDetailModal(league: UserLeagueMembership) {
  selectedLeagueForDetail.value = league
  detailModalOpen.value = true
}

function onLeagueCreated() {
  snackbar.show('League created successfully', 'success')
  fetchData()
}

function onLeagueSaved() {
  snackbar.show('League updated successfully', 'success')
  fetchData()
}

function onMembersUpdated() {
  // Refresh in case membership counts changed
  fetchData()
}

function onDetailUpdated() {
  // Refresh in case seasons/teams changed
  fetchData()
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
