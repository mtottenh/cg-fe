<template>
  <v-container>
    <v-btn variant="text" @click="goBack" class="mb-4">
      <v-icon start>mdi-arrow-left</v-icon>
      Back
    </v-btn>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <template v-if="team">
      <v-row>
        <v-col cols="12" md="8">
          <v-card class="mb-4">
            <v-card-item>
              <template v-slot:prepend>
                <v-avatar color="primary" size="64" rounded="lg">
                  <v-img alt="" v-if="team.logo_url" :src="team.logo_url" />
                  <span v-else class="text-h5">{{ team.tag.substring(0, 2) }}</span>
                </v-avatar>
              </template>
              <v-card-title class="text-h4">{{ team.name }}</v-card-title>
              <v-card-subtitle class="team-tag text-h6">[{{ team.tag }}]</v-card-subtitle>
              <template v-slot:append>
                <div class="d-flex ga-2">
                  <v-btn
                    v-if="isCaptain"
                    color="primary"
                    variant="outlined"
                    :to="`/teams/${teamId}/edit`"
                  >
                    <v-icon start>mdi-pencil</v-icon>
                    Edit Team
                  </v-btn>
                  <v-btn
                    v-if="isMember && !isCaptain"
                    color="error"
                    variant="outlined"
                    @click="confirmLeaveTeam"
                  >
                    <v-icon start>mdi-exit-run</v-icon>
                    Leave Team
                  </v-btn>
                  <v-btn
                    v-if="canApplyToTeam"
                    color="primary"
                    variant="outlined"
                    @click="showApplyDialog = true"
                  >
                    <v-icon start>mdi-account-plus</v-icon>
                    Apply to Join
                  </v-btn>
                  <!--
                    P-63: disbanding was reachable only through the API. The
                    endpoint is gated on `team.settings.manage`; the product
                    meaning of that is "the owner", so the control is
                    owner-gated and confirm-gated.
                  -->
                  <v-btn
                    v-if="isOwner"
                    color="error"
                    variant="outlined"
                    data-testid="disband-team-btn"
                    @click="confirmDisbandTeam"
                  >
                    <v-icon start>mdi-delete-forever</v-icon>
                    Disband Team
                  </v-btn>
                </div>
              </template>
            </v-card-item>
            <v-card-text v-if="team.description">
              <p>{{ team.description }}</p>
            </v-card-text>
            <v-divider />
            <v-card-text>
              <div class="d-flex align-center ga-4 text-caption text-medium-emphasis">
                <span>
                  <v-icon size="small" class="mr-1">mdi-calendar</v-icon>
                  Created {{ formatDate(team.created_at) }}
                </span>
                <v-chip size="small" :color="getStatusColor(team.status)" variant="tonal">
                  {{ formatStatus(team.status) }}
                </v-chip>
              </div>
            </v-card-text>
          </v-card>

          <!--
            P-71: a `LeagueTeamSeason` is per-season by design, so when a season
            rolls over the team itself survives but has no entry in the next
            one. `registerTeamForSeason` existed in the store with ZERO
            component consumers, leaving the captain's only route "create a
            brand-new team" — which orphans roster history, trophies and match
            history behind a new team id. This is that missing action.
          -->
          <v-card v-if="isOwner" class="mb-4" data-testid="season-registration-card">
            <v-card-title class="d-flex align-center">
              <v-icon start>mdi-calendar-plus</v-icon>
              <span>Season Registration</span>
            </v-card-title>
            <v-divider />
            <v-progress-linear v-if="loadingSeasons" indeterminate />
            <v-list v-if="registerableSeasons.length > 0">
              <v-list-item
                v-for="season in registerableSeasons"
                :key="season.id"
                :data-testid="`registerable-season-${season.id}`"
              >
                <v-list-item-title>{{ season.name }}</v-list-item-title>
                <v-list-item-subtitle>Registration is open</v-list-item-subtitle>
                <template v-slot:append>
                  <v-btn
                    color="primary"
                    variant="tonal"
                    size="small"
                    :loading="registeringSeasonId === season.id"
                    :data-testid="`register-season-${season.id}`"
                    @click="handleRegisterForSeason(season)"
                  >
                    <v-icon start>mdi-clipboard-check</v-icon>
                    Register for {{ season.name }}
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
            <v-card-text v-else-if="!loadingSeasons" class="text-medium-emphasis">
              This team is entered in every season that is currently open for
              registration. New seasons appear here as soon as the league opens them.
            </v-card-text>
          </v-card>

          <!-- Join Requests (Captain Only) — players who asked to join. -->
          <v-card v-if="isCaptain && teamSeasonId && joinRequests.length > 0" class="mb-4" data-testid="join-requests-card">
            <v-card-title class="d-flex align-center">
              <v-icon start>mdi-account-arrow-right</v-icon>
              <span>Join Requests</span>
              <v-chip size="small" color="warning" class="ml-2">
                {{ joinRequests.length }}
              </v-chip>
            </v-card-title>
            <v-divider />
            <v-list>
              <v-list-item
                v-for="request in joinRequests"
                :key="request.id"
                :data-testid="`join-request-${request.id}`"
              >
                <template v-slot:prepend>
                  <v-avatar color="grey" size="36">
                    <v-img
                      v-if="request.player_avatar_url"
                      :src="request.player_avatar_url"
                      :alt="request.player_display_name ?? 'Applicant'"
                    />
                    <v-icon v-else>mdi-account</v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title>
                  {{ request.player_display_name || 'Unknown player' }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  <!--
                    P-125/P-132: the join-request chip. All three role chips on
                    this page (request / invitation / roster) took their colour
                    from `teamRoleMap` and their LABEL from the wire.
                  -->
                  <v-chip size="x-small" :color="getRoleColor(request.role)">
                    {{ getRoleLabel(request.role) }}
                  </v-chip>
                  <span class="text-caption ml-2">
                    Requested {{ formatRelativeTime(request.created_at) }}
                  </span>
                  <span v-if="request.message" class="text-caption ml-2 font-italic">
                    &ldquo;{{ request.message }}&rdquo;
                  </span>
                </v-list-item-subtitle>
                <template v-slot:append>
                  <v-btn
                    aria-label="Accept join request"
                    color="success"
                    variant="tonal"
                    size="small"
                    class="mr-2"
                    :loading="respondingToRequest === request.id"
                    :data-testid="`accept-request-${request.id}`"
                    @click="handleAcceptRequest(request.id)"
                  >
                    <v-icon start>mdi-check</v-icon>
                    Accept
                  </v-btn>
                  <v-btn
                    aria-label="Decline join request"
                    color="error"
                    variant="text"
                    size="small"
                    :loading="respondingToRequest === request.id"
                    :data-testid="`decline-request-${request.id}`"
                    @click="handleDeclineRequest(request.id)"
                  >
                    Decline
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-card>

          <!-- Pending Invitations (Captain Only) — invites the captain sent. -->
          <v-card v-if="isCaptain && teamSeasonId" class="mb-4">
            <v-card-title class="d-flex align-center">
              <v-icon start>mdi-email-outline</v-icon>
              <span>Pending Invitations</span>
              <v-chip v-if="pendingInvites.length > 0" size="small" color="info" class="ml-2">
                {{ pendingInvites.length }}
              </v-chip>
              <v-spacer />
              <!--
                Captain-facing entry point to the shared invite modal
                (COVERAGE-PLAN §9b P-12). Before this, a captain's only way to
                invite was to find the player's own profile page; the modal was
                mounted exclusively from the admin surface.
              -->
              <v-btn
                color="primary"
                variant="tonal"
                size="small"
                prepend-icon="mdi-account-plus"
                @click="showInviteModal = true"
              >
                Invite Player
              </v-btn>
            </v-card-title>
            <v-divider />
            <v-list v-if="pendingInvites.length > 0">
              <v-list-item
                v-for="invitation in pendingInvites"
                :key="invitation.id"
              >
                <template v-slot:prepend>
                  <v-avatar color="grey" size="36">
                    <v-img
                      v-if="invitation.player_avatar_url"
                      :src="invitation.player_avatar_url"
                      :alt="invitation.player_display_name ?? 'Invited player'"
                    />
                    <v-icon v-else>mdi-account</v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title>
                  {{ invitation.player_display_name || 'Unknown player' }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  <!-- P-125/P-132: pending-invitation chip. -->
                  <v-chip size="x-small" :color="getRoleColor(invitation.role)">
                    {{ getRoleLabel(invitation.role) }}
                  </v-chip>
                  <span class="text-caption ml-2">
                    Sent {{ formatRelativeTime(invitation.created_at) }}
                  </span>
                </v-list-item-subtitle>
                <template v-slot:append>
                  <v-btn aria-label="Cancel invitation"
                    icon
                    variant="text"
                    color="error"
                    size="small"
                    @click="handleCancelInvitation(invitation.id)"
                    :loading="cancellingInvitation === invitation.id"
                  >
                    <v-icon>mdi-close</v-icon>
                    <v-tooltip activator="parent" location="top">Cancel Invitation</v-tooltip>
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
            <v-card-text v-else class="text-center text-medium-emphasis">
              No pending invitations
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="4">
          <v-card class="mb-4" data-testid="team-stats">
            <v-card-title>
              <v-icon start>mdi-chart-box-outline</v-icon>
              Team stats
            </v-card-title>
            <v-divider />
            <v-progress-linear v-if="loadingStats" indeterminate />
            <v-card-text v-else-if="teamStats">
              <div class="text-overline text-medium-emphasis">CS2 rating</div>
              <div class="d-flex flex-wrap ga-6 mb-1">
                <div>
                  <div class="text-h6" data-testid="stat-median-rating">{{ fmtRating(teamStats.median_rating) }}</div>
                  <div class="text-caption text-medium-emphasis">Median</div>
                </div>
                <div>
                  <div class="text-h6" data-testid="stat-max-rating">{{ teamStats.max_rating ?? '—' }}</div>
                  <div class="text-caption text-medium-emphasis">Max</div>
                </div>
                <div>
                  <div class="text-h6" data-testid="stat-total-rating">{{ teamStats.total_rating.toLocaleString() }}</div>
                  <div class="text-caption text-medium-emphasis">Total</div>
                </div>
              </div>
              <div
                v-if="teamStats.rated_count < teamStats.member_count"
                class="text-caption text-medium-emphasis"
                data-testid="stat-rated-note"
              >
                {{ teamStats.rated_count }} of {{ teamStats.member_count }} players have a CS2 rating.
              </div>

              <v-divider class="my-3" />

              <div class="text-overline text-medium-emphasis">Past games</div>
              <div class="d-flex flex-wrap ga-6">
                <div>
                  <div class="text-h6" data-testid="stat-games-season">{{ teamStats.past_games_season }}</div>
                  <div class="text-caption text-medium-emphasis">This season</div>
                </div>
                <div>
                  <div class="text-h6" data-testid="stat-games-alltime">{{ teamStats.past_games_all_time }}</div>
                  <div class="text-caption text-medium-emphasis">All-time</div>
                </div>
              </div>
            </v-card-text>
            <v-card-text v-else class="text-caption text-medium-emphasis">
              Stats are unavailable for this team.
            </v-card-text>
          </v-card>

          <v-card>
            <v-card-title>
              <v-icon start>mdi-account-multiple</v-icon>
              Roster
              <v-chip size="small" class="ml-2">{{ members.length }}</v-chip>
              <!--
                P-148: the season's roster lock is now the only thing that
                decides whether this roster may change, so the roster is where
                it has to be visible. Before the ruling a captain could infer
                "no changes" from the season being under way; now an active
                season may be wide open or frozen and nothing else says which.
              -->
              <v-chip
                v-if="rosterLockChip"
                size="small"
                class="ml-2"
                :color="rosterLockChipColor"
                :title="rosterLockTitle ?? undefined"
                data-testid="roster-lock-chip"
              >
                {{ rosterLockChip }}
              </v-chip>
            </v-card-title>
            <v-divider />

            <v-progress-linear v-if="loadingMembers" indeterminate />

            <v-list v-if="members.length > 0" density="compact">
              <v-list-item
                v-for="member in members"
                :key="member.player_id"
              >
                <template v-slot:prepend>
                  <v-avatar color="secondary" size="36" class="cursor-pointer" @click="goToPlayer(member.player_id)">
                    <v-img alt="" v-if="member.avatar_url" :src="member.avatar_url" />
                    <span v-else>{{ member.display_name.substring(0, 2).toUpperCase() }}</span>
                  </v-avatar>
                </template>
                <v-list-item-title class="cursor-pointer" @click="goToPlayer(member.player_id)">
                  {{ member.display_name }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  <!-- P-125/P-132: roster chip. -->
                  <v-chip size="x-small" :color="getRoleColor(member.role)">
                    {{ getRoleLabel(member.role) }}
                  </v-chip>
                </v-list-item-subtitle>
                <template v-slot:append v-if="(isCaptain || isOwner) && !isCurrentUser(member.player_id)">
                  <v-menu>
                    <template v-slot:activator="{ props }">
                      <v-btn aria-label="Member actions" icon variant="text" size="small" v-bind="props">
                        <v-icon>mdi-dots-vertical</v-icon>
                      </v-btn>
                    </template>
                    <v-list density="compact">
                      <v-list-subheader>Actions</v-list-subheader>
                      <v-list-item
                        v-if="isCaptain && member.role !== 'captain'"
                        @click="handlePromoteToCaptain(member.player_id)"
                      >
                        <template v-slot:prepend>
                          <v-icon>mdi-crown</v-icon>
                        </template>
                        <v-list-item-title>Promote to Captain</v-list-item-title>
                      </v-list-item>
                      <!--
                        P-62: the transfer endpoint has been live and e2e-proven
                        since 2026-07-22 with no control anywhere in the app.
                        Owner-gated (the backend checks `owner_player_id`, not a
                        permission) and confirm-gated — it is irreversible for
                        the person performing it.
                      -->
                      <v-list-item
                        v-if="isOwner"
                        :data-testid="`transfer-ownership-${member.player_id}`"
                        @click="confirmTransferOwnership(member)"
                      >
                        <template v-slot:prepend>
                          <v-icon>mdi-account-switch</v-icon>
                        </template>
                        <v-list-item-title>Transfer Ownership</v-list-item-title>
                      </v-list-item>
                      <v-divider v-if="isCaptain" class="my-2" />
                      <v-list-item
                        v-if="isCaptain"
                        class="text-error"
                        @click="confirmRemoveMember(member)"
                      >
                        <template v-slot:prepend>
                          <v-icon color="error">mdi-account-remove</v-icon>
                        </template>
                        <v-list-item-title>Remove from Team</v-list-item-title>
                      </v-list-item>
                    </v-list>
                  </v-menu>
                </template>
              </v-list-item>
            </v-list>
            <v-card-text v-else-if="!loadingMembers && !teamSeasonId" class="text-center text-medium-emphasis">
              <p class="mb-2">This team is not registered in any season yet</p>
              <p class="text-caption">The roster appears once the team joins a league season.</p>
            </v-card-text>
            <v-card-text v-else-if="!loadingMembers" class="text-center text-medium-emphasis">
              No members in this roster
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Apply to Team Dialog -->
    <v-dialog v-model="showApplyDialog" max-width="400">
      <v-card>
        <v-card-title>Apply to Join {{ team?.name }}</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-4">Your application will be reviewed by a team captain.</p>
          <v-textarea
            v-model="applyMessage"
            label="Message (optional)"
            rows="2"
            hint="Introduce yourself to the team"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showApplyDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="applyingToTeam"
            @click="handleApplyToTeam"
          >
            Submit Application
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Invite Player (captain only; needs a seasonal roster to invite onto) -->
    <LeagueTeamInviteModal
      v-if="isCaptain && teamSeasonId"
      v-model="showInviteModal"
      :team-season-id="teamSeasonId"
      :roster-lock-status="seasonRosterLock"
      @invited="handlePlayerInvited"
    />

    <!-- Confirm Dialog -->
    <ConfirmDialogHost :dialog="confirmDialog" />

    <!-- Success Snackbar -->
    <v-snackbar v-model="showSuccess" color="success" :timeout="3000">
      {{ successMessage }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { unwrapApi } from '@/stores/helpers'
import { useLeagueTeamsStore, type LeagueTeamMemberWithPlayer } from '@/stores/leagueTeams'
import { useLeagueSeasonsStore, type LeagueSeasonResponse } from '@/stores/leagueSeasons'
import { useAuthStore } from '@/stores/auth'
import { useTeamContext } from '@/composables/useTeamContext'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import LeagueTeamInviteModal from '@/components/team/LeagueTeamInviteModal.vue'
import { teamRoleMap, teamStatusMap, getStatusColor as mapStatusColor, getStatusLabel } from '@/utils/statusMaps'
import { rosterLockColor, rosterLockHint, rosterLockLabel } from '@/utils/rosterLock'
import type { components } from '@/api/types'

type LeagueTeamResponse = components['schemas']['LeagueTeamResponse']

const route = useRoute()
const router = useRouter()
const teamsStore = useLeagueTeamsStore()
const seasonsStore = useLeagueSeasonsStore()
const authStore = useAuthStore()

const loading = ref(true)
const loadingMembers = ref(false)
const error = ref<string | null>(null)

const team = ref<LeagueTeamResponse | null>(null)
const { members, invitations } = storeToRefs(teamsStore)

// P-49: the team-season invitations endpoint returns BOTH captain-sent invites
// and player-sent join requests, each tagged with `invitation_type`. They must
// be presented differently — a request is something the captain accepts/declines,
// an invite is something the captain cancels. Rendering both as "Pending
// Invitations" with only a Cancel ✕ mislabelled a player's application as an
// invitation the captain had sent, and the sole affordance rejected it.
const joinRequests = computed(() => invitations.value.filter(i => i.invitation_type === 'request'))
const pendingInvites = computed(() => invitations.value.filter(i => i.invitation_type === 'invite'))
const respondingToRequest = ref<string | null>(null)

/**
 * The season's `roster_lock_status`, or `null` while unknown.
 *
 * P-148 made the lock the ONLY thing that decides whether a live roster may
 * change — `LeagueSeason::allows_*_roster_changes()` used to AND it with the
 * season phase, so `active`/`playoffs` froze everything and this page could
 * safely ignore the field. It cannot any more: an `active` season may be wide
 * open or hard-locked, and nothing else on this page distinguishes them. It is
 * fetched (rather than read off the team) because `LeagueTeamResponse` is the
 * persistent team identity and carries no season fields.
 *
 * `null` means "not known yet", which `utils/rosterLock.ts` maps to `open` —
 * matching the backend default. The API still enforces the lock either way;
 * this only decides what the UI offers.
 */
const seasonRosterLock = ref<string | null>(null)
const rosterLockChip = computed(() => rosterLockLabel(seasonRosterLock.value))
const rosterLockChipColor = computed(() => rosterLockColor(seasonRosterLock.value))
const rosterLockTitle = computed(() => rosterLockHint(seasonRosterLock.value))

// Route params
const teamId = computed(() => route.params.id as string)
// team_season_id can come from query param or we need to look it up
const teamSeasonId = ref<string | null>(route.query.season as string | null)

type TeamSeasonStats = import('@/api/types').components['schemas']['TeamSeasonStatsResponse']
const teamStats = ref<TeamSeasonStats | null>(null)
const loadingStats = ref(false)

/** Ratings come back as a float median; the rest are whole numbers. */
function fmtRating(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : Math.round(value).toLocaleString()
}

// Keep teamSeasonId reactive to URL changes
watch(() => route.query.season, (newSeason) => {
  if (newSeason) {
    teamSeasonId.value = newSeason as string
  }
})

const { isMember, isCaptain } = useTeamContext(teamSeasonId)

// Dialog state
const confirmDialog = useConfirmDialog()
const cancellingInvitation = ref<string | null>(null)
const showSuccess = ref(false)
const successMessage = ref('')
const showApplyDialog = ref(false)
const applyMessage = ref('')
const applyingToTeam = ref(false)
const showInviteModal = ref(false)

const canApplyToTeam = computed(() => {
  if (!authStore.isAuthenticated || !teamSeasonId.value) return false
  if (isMember.value) return false
  return true
})

/**
 * Owner-only surface gate for P-62 / P-63 / P-71.
 *
 * Deliberately NOT `isCaptain`: transfer-ownership and register-for-season are
 * authorized by the backend against `league_teams.owner_player_id`
 * (`LeagueTeamService::transfer_ownership` / `::register_for_season`), and a
 * roster captain is not necessarily the owner. Gating on the captain role would
 * render three controls that 403 for co-captains.
 */
const isOwner = computed(
  () => !!team.value && !!authStore.playerId && team.value.owner_player_id === authStore.playerId,
)

// P-71 state: seasons of this team's league that are open for registration and
// that the team is not already entered in.
const registerableSeasons = ref<LeagueSeasonResponse[]>([])
const loadingSeasons = ref(false)
const registeringSeasonId = ref<string | null>(null)

/**
 * Build the registerable-season list.
 *
 * "Already registered" is derived from `myTeams` rather than by probing
 * `GET /league-seasons/{id}/teams` per season: registering a team for a season
 * always seats the registering owner as captain of the new `LeagueTeamSeason`
 * (`create_with_captain`), so the owner has a membership row for every season
 * their team is in. That makes this O(1) against data the page already loaded,
 * and it is not subject to the 100-row pagination ceiling (P-53) a per-season
 * team-list probe would hit.
 */
async function loadRegisterableSeasons() {
  if (!team.value || !isOwner.value) {
    registerableSeasons.value = []
    return
  }
  loadingSeasons.value = true
  try {
    const seasons = await seasonsStore.fetchSeasons(team.value.league_id)
    const enteredSeasonIds = new Set(
      teamsStore.myTeams.filter(m => m.team_id === teamId.value).map(m => m.season_id),
    )
    // `registration` is the ONLY status `SeasonStatus::is_registration_open()`
    // accepts (portal-core/src/types/league_team.rs:62); offering any other
    // status would be a control that always 409s.
    registerableSeasons.value = seasons.filter(
      s => s.status === 'registration' && !enteredSeasonIds.has(s.id),
    )
  } finally {
    loadingSeasons.value = false
  }
}

/**
 * Resolve this team's team_season_id from its league when the URL carries no
 * ?season= and the viewer is not a member — makes bare /teams/{id} deep
 * links work. Checks the most recent seasons first (max 3 requests).
 */
async function resolveSeasonFromLeague(leagueId: string): Promise<string | null> {
  const seasons = await seasonsStore.fetchSeasons(leagueId).catch(() => [])
  const ranked = [...seasons].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  // Active seasons are the most likely home for the roster being looked at.
  //
  // This compared against 'in_progress', which is NOT a season status (that is a
  // TOURNAMENT status). SeasonStatus is draft|registration|active|playoffs|
  // completed|cancelled, so both sides were always false, the sort key was always
  // 0, and the prioritisation silently did nothing — leaving only "3 most recently
  // created", so a team's roster was unreachable whenever its live season was not
  // among the 3 newest. Found by the compiler once SeasonStatus became a real
  // union (P-33). `playoffs` counts as live too.
  const isLive = (s: (typeof ranked)[number]) => s.status === 'active' || s.status === 'playoffs'
  ranked.sort((a, b) => Number(isLive(b)) - Number(isLive(a)))
  for (const season of ranked.slice(0, 3)) {
    const seasonTeams = await teamsStore.fetchTeamsInSeason(season.id).catch(() => [])
    const entry = seasonTeams.find((t) => t.team_id === teamId.value)
    if (entry?.team_season_id) return entry.team_season_id
  }
  return null
}

/**
 * Resolve the roster lock of the season this roster belongs to (P-148).
 *
 * P-200: one round-trip now — `LeagueTeamSeasonResponse` carries the parent
 * season's `roster_lock_status`, so the team-season GET answers directly.
 * This also works for viewers with no membership row (the old path resolved
 * the season id from `myTeams` and silently gave visitors no chip at all).
 * Failures are swallowed: an unknown lock renders no chip and offers the
 * unrestricted role list, which is exactly the pre-P-148 behaviour, and the
 * API is still the enforcer.
 */
async function loadSeasonRosterLock() {
  seasonRosterLock.value = null
  if (!teamSeasonId.value) return
  const teamSeason = await unwrapApi(
    api.GET('/v1/league-team-seasons/{team_season_id}', {
      params: { path: { team_season_id: teamSeasonId.value } },
    })
  ).catch(() => null)
  seasonRosterLock.value = teamSeason?.data.roster_lock_status ?? null
}

onMounted(async () => {
  try {
    // Fetch team details
    team.value = await teamsStore.fetchTeam(teamId.value)

    // Fetch user's teams so useTeamContext can determine membership/role
    if (authStore.isAuthenticated) {
      await teamsStore.fetchMyTeams()
      // If we don't have a team_season_id from query, try to find it from user's teams
      if (!teamSeasonId.value) {
        const myMembership = teamsStore.myTeams.find(t => t.team_id === teamId.value)
        if (myMembership) {
          teamSeasonId.value = myMembership.team_season_id
        }
      }
    }

    // Deep link without ?season= and not a member: resolve the team's
    // season from its league so /teams/{id} works standalone.
    if (!teamSeasonId.value && team.value) {
      teamSeasonId.value = await resolveSeasonFromLeague(team.value.league_id)
    }

    // Fetch members if we have a team_season_id
    if (teamSeasonId.value) {
      loadingMembers.value = true
      await teamsStore.fetchMembers(teamSeasonId.value)
      loadingMembers.value = false

      loadingStats.value = true
      teamStats.value = await teamsStore.fetchTeamStats(teamSeasonId.value).catch(() => null)
      loadingStats.value = false

      await loadSeasonRosterLock()

      // Fetch invitations if captain
      if (isCaptain.value) {
        await teamsStore.fetchTeamInvitations(teamSeasonId.value)
      }
    }

    // P-71: last, because it needs both `team` (for the league) and `myTeams`
    // (for the seasons already entered). Deliberately inside the try — a
    // failure here surfaces on the page instead of leaving an empty card that
    // silently claims there is nothing to register for.
    await loadRegisterableSeasons()
  } catch (e) {
    error.value = teamsStore.error || 'Failed to load team'
    console.error('Failed to load team:', e)
  } finally {
    loading.value = false
  }
})

function goBack() {
  // Try to go back, or fallback to leagues
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/leagues')
  }
}

function goToPlayer(playerId: string) {
  router.push(`/players/${playerId}`)
}

function isCurrentUser(playerId: string): boolean {
  return playerId === authStore.playerId
}

async function handlePromoteToCaptain(playerId: string) {
  if (!teamSeasonId.value) return

  try {
    await teamsStore.promoteToCaptain(teamSeasonId.value, playerId)
    successMessage.value = 'Member promoted to captain'
    showSuccess.value = true
    // Refresh members to update roles
    await teamsStore.fetchMembers(teamSeasonId.value)
  } catch {
    // P-116: `teamsStore.error` is a computed alias over `fetchMyTeamsState`
    // (stores/leagueTeams.ts:55) — the state of an entirely different action.
    // Reading it here meant the promote failure's real reason ("member is
    // already a captain", "cannot promote inactive member to captain") was
    // never in the variable being read, so every failure rendered the generic
    // fallback. Each handler reads ITS OWN action state; the transfer/disband
    // handlers added in 28afc7a already do.
    error.value = teamsStore.promoteToCaptainState.error || 'Failed to promote member'
  }
}

function confirmRemoveMember(member: LeagueTeamMemberWithPlayer) {
  confirmDialog.confirm({
    title: 'Remove Member',
    message: `Are you sure you want to remove ${member.display_name} from the team?`,
    action: 'Remove',
    color: 'error',
    handler: async () => {
      if (!teamSeasonId.value) return
      await teamsStore.removeMember(teamSeasonId.value, member.player_id)
      successMessage.value = `${member.display_name} has been removed from the team`
      showSuccess.value = true
    },
  })
}

// P-62. Confirm-gated: irreversible for the person performing it — the backend
// only lets the CURRENT owner transfer, so handing the team over cannot be
// undone from this account.
function confirmTransferOwnership(member: LeagueTeamMemberWithPlayer) {
  confirmDialog.confirm({
    title: 'Transfer Ownership',
    message: `Transfer ownership of ${team.value?.name} to ${member.display_name}? `
      + 'You will lose owner control of this team and cannot take it back yourself.',
    action: 'Transfer Ownership',
    color: 'warning',
    handler: async () => {
      team.value = await teamsStore.transferOwnership(teamId.value, member.player_id)
      successMessage.value = `${member.display_name} is now the team owner`
      showSuccess.value = true
      // No longer the owner: the owner-only surfaces must stop offering actions
      // this account can no longer perform.
      registerableSeasons.value = []
    },
  })
}

// P-63. Confirm-gated and owner-only. Disband is a terminal status flip, not a
// row delete, so history survives — but the backend refuses to un-disband
// (`team.status.is_terminal()` → InvalidState), which is why the copy says so.
function confirmDisbandTeam() {
  confirmDialog.confirm({
    title: 'Disband Team',
    message: `Disband ${team.value?.name}? This cannot be undone — the team is `
      + 'retired from the league and its roster can no longer be changed.',
    action: 'Disband Team',
    color: 'error',
    handler: async () => {
      await teamsStore.disbandTeam(teamId.value)
      router.push('/my-teams')
    },
  })
}

// P-71. Not confirm-gated: registering is additive and reversible by leaving.
async function handleRegisterForSeason(season: LeagueSeasonResponse) {
  registeringSeasonId.value = season.id
  try {
    const teamSeason = await teamsStore.registerTeamForSeason(season.id, teamId.value)
    successMessage.value = `Registered for ${season.name}`
    showSuccess.value = true
    registerableSeasons.value = registerableSeasons.value.filter(s => s.id !== season.id)
    // Move the page onto the new season's roster so the captain lands where the
    // work now is (invites, roster edits) rather than on the season that ended.
    teamSeasonId.value = teamSeason.id
    router.replace({ query: { ...route.query, season: teamSeason.id } })
    await teamsStore.fetchMyTeams()
    await teamsStore.fetchMembers(teamSeason.id)
  } catch {
    error.value = teamsStore.registerTeamForSeasonState.error || 'Failed to register for season'
  } finally {
    registeringSeasonId.value = null
  }
}

function confirmLeaveTeam() {
  confirmDialog.confirm({
    title: 'Leave Team',
    message: `Are you sure you want to leave ${team.value?.name}?`,
    action: 'Leave Team',
    color: 'error',
    handler: async () => {
      if (!teamSeasonId.value) return
      await teamsStore.leaveTeam(teamSeasonId.value)
      router.push('/leagues')
    },
  })
}

/**
 * The invite POST response does not carry the invited player's display name —
 * only the list endpoint hydrates it (`get_team_invitations`,
 * portal-api/src/handlers/league_teams/invitation.rs:188-208) — so the store's
 * optimistic append would render "Unknown player". Refetch instead.
 */
async function handlePlayerInvited() {
  successMessage.value = 'Invitation sent'
  showSuccess.value = true
  if (!teamSeasonId.value) return
  try {
    await teamsStore.fetchTeamInvitations(teamSeasonId.value)
  } catch {
    // P-116, same defect: the failing call is `fetchTeamInvitations`.
    error.value = teamsStore.fetchTeamInvitationsState.error || 'Failed to refresh invitations'
  }
}

async function handleCancelInvitation(invitationId: string) {
  cancellingInvitation.value = invitationId
  try {
    await teamsStore.cancelInvitation(invitationId)
    successMessage.value = 'Invitation cancelled'
    showSuccess.value = true
  } catch {
    // P-116: e.g. "Invitation is invalid or already used" — the reason a
    // captain needs, instead of a fallback that says nothing.
    error.value = teamsStore.cancelInvitationState.error || 'Failed to cancel invitation'
  } finally {
    cancellingInvitation.value = null
  }
}

// P-49: captain accepts a player's join request. Reuses the shared accept
// endpoint (the backend authorizes a captain for `request`-type rows), then
// refreshes the roster so the newly-seated player appears.
async function handleAcceptRequest(invitationId: string) {
  respondingToRequest.value = invitationId
  try {
    await teamsStore.acceptApplication(invitationId)
    successMessage.value = 'Join request accepted'
    showSuccess.value = true
    if (teamSeasonId.value) await teamsStore.fetchMembers(teamSeasonId.value)
  } catch {
    // P-116: acceptApplication has its own state — a roster-full or
    // one-team-per-season refusal is actionable, "Failed" is not.
    error.value = teamsStore.acceptApplicationState.error || 'Failed to accept join request'
  } finally {
    respondingToRequest.value = null
  }
}

// P-49: captain declines a player's join request.
async function handleDeclineRequest(invitationId: string) {
  respondingToRequest.value = invitationId
  try {
    await teamsStore.declineApplication(invitationId)
    successMessage.value = 'Join request declined'
    showSuccess.value = true
  } catch {
    // P-116.
    error.value = teamsStore.declineApplicationState.error || 'Failed to decline join request'
  } finally {
    respondingToRequest.value = null
  }
}

async function handleApplyToTeam() {
  if (!teamSeasonId.value) return
  applyingToTeam.value = true
  try {
    await teamsStore.applyToTeam(teamSeasonId.value, applyMessage.value || undefined)
    successMessage.value = 'Application submitted!'
    showSuccess.value = true
    showApplyDialog.value = false
    applyMessage.value = ''
  } catch {
    // P-116: "Player already has a pending invitation" tells the applicant
    // their application is already in; the fallback implied it wasn't.
    error.value = teamsStore.applyToTeamState.error || 'Failed to apply to team'
  } finally {
    applyingToTeam.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  return `${diffDays} days ago`
}

const getStatusColor = (status: string) => mapStatusColor(teamStatusMap, status)
// C1/P-112 sweep: the team status chip interpolated `team.status` directly, so
// it printed the raw wire value ("disbanded" rather than "Disbanded"). It was
// one of check-status-maps.mjs's baselined leaks. `teamStatusMap` already
// covers LeagueTeamStatus AND LeagueTeamSeasonStatus, so no map change is
// needed — only the call.
//
// NB: keep the words `team` and `status` out of a `{{ }}` in this file's
// comments — the status-map ratchet greps raw lines and does not skip
// comments, so prose describing the defect is counted as the defect.
const formatStatus = (status: string) => getStatusLabel(teamStatusMap, status)
const getRoleColor = (role: string) => mapStatusColor(teamRoleMap, role)
// P-125/P-132: `getRoleColor` existed and was used by all three chips; the
// matching label accessor simply did not, so each chip fell back to the wire
// value beside a correctly coloured background.
const getRoleLabel = (role: string) => getStatusLabel(teamRoleMap, role)
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
