<template>
  <div>
    <!-- Loading State -->
    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <!-- Error State -->
    <v-alert v-if="error" type="error" class="mb-4" closable @click:close="clearError">
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
                <v-chip size="small" :color="accessTypeColor" variant="tonal" class="ml-1">
                  <v-icon start size="small">{{ accessTypeIcon }}</v-icon>
                  {{ accessTypeLabel }}
                </v-chip>
              </v-card-subtitle>
            </v-card-item>
            <v-card-text v-if="league.description">
              {{ league.description }}
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- League Membership / Join CTA -->
      <v-row class="mb-4">
        <v-col cols="12">
          <!-- Already a member -->
          <v-alert v-if="isLeagueMember" type="success" variant="tonal" density="compact" class="d-flex align-center">
            <div class="d-flex align-center flex-grow-1">
              <v-icon start>mdi-check-circle</v-icon>
              <span>You are a <strong>{{ membershipType }}</strong> of this league.</span>
              <v-spacer />
              <v-btn
                v-if="membershipType === 'member'"
                variant="text"
                size="small"
                color="error"
                @click="handleLeaveLeague"
              >
                Leave League
              </v-btn>
            </div>
          </v-alert>

          <!-- Not authenticated -->
          <v-alert v-else-if="!isAuthenticated" type="info" variant="tonal" density="compact">
            <v-icon start>mdi-account-plus</v-icon>
            <router-link to="/login" class="text-decoration-none">Sign in</router-link> to join this league.
          </v-alert>

          <!-- Open league: Join directly -->
          <v-alert v-else-if="league.access_type === 'open'" type="info" variant="tonal" density="compact">
            <div class="d-flex align-center">
              <span>This league is open to everyone. Join to create or join a team!</span>
              <v-spacer />
              <v-btn
                color="primary"
                size="small"
                :loading="joiningLeague"
                @click="handleJoinLeague"
              >
                <v-icon start size="small">mdi-account-plus</v-icon>
                Join League
              </v-btn>
            </div>
          </v-alert>

          <!-- Application league: Apply -->
          <template v-else-if="league.access_type === 'application'">
            <v-alert v-if="hasPendingApplication" type="warning" variant="tonal" density="compact">
              <v-icon start>mdi-clock-outline</v-icon>
              Your application is pending review by a league admin.
            </v-alert>
            <v-alert v-else type="info" variant="tonal" density="compact">
              <div class="d-flex align-center">
                <span>This league requires an application to join.</span>
                <v-spacer />
                <v-btn
                  color="primary"
                  size="small"
                  @click="showApplyDialog = true"
                >
                  <v-icon start size="small">mdi-file-document-edit</v-icon>
                  Apply to Join
                </v-btn>
              </div>
            </v-alert>
          </template>

          <!-- Invite-only league -->
          <v-alert v-else-if="league.access_type === 'invite_only'" type="info" variant="tonal" density="compact">
            <v-icon start>mdi-lock</v-icon>
            This league is invite-only. Contact a league admin to request an invitation.
          </v-alert>

          <!-- Entry requirements (shown when league has eligibility restrictions) -->
          <v-alert v-if="entryRequirements" type="warning" variant="tonal" density="compact" class="mt-2">
            <div class="d-flex align-center">
              <v-icon start size="small">mdi-shield-check</v-icon>
              <strong class="mr-2">Entry Requirements:</strong>
              <span v-for="(req, i) in entryRequirementsList" :key="i">
                {{ req }}<span v-if="i < entryRequirementsList.length - 1" class="mx-1">|</span>
              </span>
            </div>
          </v-alert>
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
        <v-col cols="12" sm="6" md="8" class="d-flex align-center justify-end gap-2">
          <v-btn
            v-if="canCreateTournament"
            color="primary"
            variant="tonal"
            prepend-icon="mdi-tournament"
            @click="showCreateTournamentModal = true"
          >
            Create Tournament
          </v-btn>
          <v-btn
            v-if="isLeagueMember && selectedSeasonId && !hasTeamInSeason"
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

      <!-- Tournaments Section -->
      <v-row class="mb-4">
        <v-col cols="12">
          <h2 class="text-h6 mb-4">
            <v-icon start>mdi-tournament</v-icon>
            Tournaments
            <v-chip size="small" variant="tonal" class="ml-2">{{ tournaments.length }}</v-chip>
          </h2>
        </v-col>
      </v-row>

      <v-progress-linear v-if="loadingTournaments" indeterminate class="mb-4" />

      <v-row v-if="tournaments.length > 0" class="mb-6">
        <v-col v-for="tournament in tournaments" :key="tournament.id" cols="12" sm="6" md="4" lg="3">
          <TournamentCard :tournament="tournament" @click="openTournament(tournament)" />
        </v-col>
      </v-row>

      <v-row v-else-if="!loadingTournaments && selectedSeasonId" class="mb-6">
        <v-col cols="12" class="text-center py-8">
          <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-tournament</v-icon>
          <p class="text-body-2 text-medium-emphasis">No tournaments for this season yet.</p>
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
            v-if="isLeagueMember"
            color="primary"
            prepend-icon="mdi-plus"
            @click="showCreateTeamModal = true"
          >
            Create Team
          </v-btn>
          <v-btn v-else-if="!isAuthenticated" color="primary" to="/login">
            Sign In to Join League
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
            @click="handleCreateTeam"
          >
            Create Team
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Create Tournament Modal -->
    <TournamentCreateModal
      v-model="showCreateTournamentModal"
      :games="gamesForModal"
      :leagues="leaguesForModal"
      :seasons="seasonsForModal"
      @created="showCreateTournamentModal = false"
    />

    <!-- Apply to League Dialog -->
    <v-dialog v-model="showApplyDialog" max-width="450">
      <v-card>
        <v-card-title>Apply to {{ league?.name }}</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-4">
            Your application will be reviewed by a league admin. You can include an optional message.
          </p>
          <v-textarea
            v-model="applyMessage"
            label="Message (optional)"
            rows="3"
            counter="500"
            hint="Tell the admins why you'd like to join"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showApplyDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="applyingToLeague"
            @click="handleApplyToLeague"
          >
            Submit Application
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

    <ConfirmDialog
      :open="confirmDialog.state.open"
      :title="confirmDialog.state.title"
      :message="confirmDialog.state.message"
      :action-label="confirmDialog.state.actionLabel"
      :color="confirmDialog.state.color"
      :loading="confirmDialog.state.loading"
      :error="confirmDialog.state.dialogError"
      @clear-error="confirmDialog.clearError()"
      @confirm="confirmDialog.execute"
      @cancel="confirmDialog.cancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLeagueDetail } from '@/composables/useLeagueDetail'
import { useAuthStore } from '@/stores/auth'
import { useGamesStore } from '@/stores/games'
import { useLeagueSeasonsStore } from '@/stores/leagueSeasons'
import { useFormRules } from '@/composables/useFormRules'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import TournamentCreateModal from '@/components/admin/TournamentCreateModal.vue'
import TournamentCard from '@/components/tournament/TournamentCard.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import type { LeagueTeamSummaryResponse } from '@/stores/leagueTeams'
import type { TournamentSummaryResponse } from '@/stores/tournaments'

const router = useRouter()

const {
  league, seasons, teams, tournaments, gameName, hasTeamInSeason,
  isLeagueMember, membershipType, hasPendingApplication,
  selectedSeasonId, selectedTeam, teamMembers,
  loading, loadingSeasons, loadingTeams, loadingTournaments, loadingMembers, creatingTeam,
  joiningLeague, applyingToLeague,
  error, clearError, isAuthenticated,
  fetchAll, fetchTeamMembers, createTeam,
  joinLeague, applyToLeague, leaveLeague,
} = useLeagueDetail()

const authStore = useAuthStore()
const gamesStore = useGamesStore()
const seasonsStore = useLeagueSeasonsStore()

const canCreateTournament = computed(() => authStore.isAdmin)
const showCreateTournamentModal = ref(false)

const gamesForModal = computed(() => gamesStore.games.filter(g => g.status === 'active'))
const leaguesForModal = computed(() => {
  if (!league.value) return []
  return [{ id: league.value.id, name: league.value.name, game_id: league.value.game_id, status: league.value.status }]
})
const seasonsForModal = computed(() =>
  seasonsStore.seasons.map(s => ({ id: s.id, name: s.name, league_id: s.league_id, status: s.status }))
)

// UI state (stays in the page)
const showCreateTeamModal = ref(false)
const showTeamDetailModal = ref(false)
const showApplyDialog = ref(false)
const applyMessage = ref('')
const createTeamValid = ref(false)

const newTeam = ref({
  name: '',
  tag: '',
  description: '',
})

const rules = useFormRules()

// Entry requirements from league settings
const entryRequirements = computed(() => {
  const settings = league.value?.settings as Record<string, unknown> | null
  if (!settings) return null
  const eligibility = settings.eligibility as Record<string, unknown> | null
  if (!eligibility) return null
  const hasAny = Object.values(eligibility).some(v => v !== null && v !== undefined)
  return hasAny ? eligibility : null
})

const entryRequirementsList = computed((): string[] => {
  if (!entryRequirements.value) return []
  const reqs: string[] = []
  const e = entryRequirements.value
  if (e.min_rating_per_player) reqs.push(`Min Rating: ${e.min_rating_per_player}`)
  if (e.max_rating_per_player) reqs.push(`Max Rating: ${e.max_rating_per_player}`)
  if (e.max_peak_rating_per_player) reqs.push(`Max Peak Rating: ${e.max_peak_rating_per_player}`)
  if (e.min_matches_played) reqs.push(`Min Matches: ${e.min_matches_played}`)
  if (e.allowed_rank_tiers && (e.allowed_rank_tiers as string[]).length > 0)
    reqs.push(`Rank Tiers: ${(e.allowed_rank_tiers as string[]).join(', ')}`)
  return reqs
})

// Access type display helpers
const accessTypeLabel = computed(() => {
  switch (league.value?.access_type) {
    case 'open': return 'Open'
    case 'application': return 'Application'
    case 'invite_only': return 'Invite Only'
    default: return league.value?.access_type || ''
  }
})

const accessTypeColor = computed(() => {
  switch (league.value?.access_type) {
    case 'open': return 'success'
    case 'application': return 'warning'
    case 'invite_only': return 'grey'
    default: return 'grey'
  }
})

const accessTypeIcon = computed(() => {
  switch (league.value?.access_type) {
    case 'open': return 'mdi-lock-open-variant'
    case 'application': return 'mdi-file-document-edit'
    case 'invite_only': return 'mdi-lock'
    default: return 'mdi-help-circle'
  }
})

// Join/Apply handlers
async function handleJoinLeague() {
  try {
    await joinLeague()
  } catch {
    // Error already set in composable
  }
}

async function handleApplyToLeague() {
  try {
    await applyToLeague(applyMessage.value || undefined)
    showApplyDialog.value = false
    applyMessage.value = ''
  } catch {
    // Error already set in composable
  }
}

const confirmDialog = useConfirmDialog()

function handleLeaveLeague() {
  confirmDialog.confirm({
    title: 'Leave League',
    message: 'Are you sure you want to leave this league? You will lose access to teams and tournaments you joined through it.',
    action: 'Leave',
    color: 'error',
    handler: async () => {
      await leaveLeague()
    },
  })
}

// Template helpers
function onSeasonChange() {
  // Teams will be loaded by the composable watcher
}

function getSeasonStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'success'
    case 'upcoming': return 'info'
    case 'completed': return 'grey'
    default: return 'grey'
  }
}

function openTournament(tournament: TournamentSummaryResponse) {
  router.push({ name: 'tournament-detail', params: { slug: tournament.slug } })
}

async function viewTeam(team: LeagueTeamSummaryResponse) {
  showTeamDetailModal.value = true
  await fetchTeamMembers(team)
}

async function handleCreateTeam() {
  if (!selectedSeasonId.value || !createTeamValid.value) return

  try {
    await createTeam(selectedSeasonId.value, {
      name: newTeam.value.name,
      tag: newTeam.value.tag,
      description: newTeam.value.description || undefined,
    })

    newTeam.value = { name: '', tag: '', description: '' }
    showCreateTeamModal.value = false
  } catch {
    // Error already set in composable
  }
}

onMounted(() => { fetchAll() })
</script>
