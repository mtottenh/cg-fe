<template>
  <v-container>
    <!-- Loading State -->
    <v-skeleton-loader v-if="loading && !league" type="article" class="mb-4" />
    <v-progress-linear v-else-if="loading" indeterminate class="mb-4" />

    <!-- Error State -->
    <ErrorAlert :error="error" retryable @clear="clearError" @retry="fetchAll" />

    <template v-if="league">
      <!-- Breadcrumb -->
      <v-breadcrumbs
        :items="[
          { title: 'Leagues', to: { name: 'leagues' } },
          { title: league.name, disabled: true },
        ]"
        class="pa-0 mb-4"
      />

      <!-- League + season header -->
      <v-card class="mb-4">
        <v-card-text class="d-flex ga-6 align-start flex-wrap">
          <v-avatar size="72" rounded="lg" color="primary" class="flex-shrink-0">
            <v-img alt="" v-if="league.logo_url" :src="league.logo_url" />
            <v-icon v-else size="36">mdi-trophy</v-icon>
          </v-avatar>
          <div class="flex-grow-1" style="min-width: 280px">
            <h1 class="text-h4 mb-2">{{ league.name }}<template v-if="selectedSeason"> · {{ selectedSeason.name }}</template></h1>
            <div class="d-flex align-center ga-2 flex-wrap mb-2">
              <v-chip size="small" variant="tonal">
                <v-icon start size="small">mdi-gamepad-variant</v-icon>
                {{ gameName }}
              </v-chip>
              <v-chip v-if="rosterMax" size="small" variant="tonal">{{ rosterMax }}v{{ rosterMax }}</v-chip>
              <v-chip v-if="selectedSeason" size="small" :color="getSeasonStatusColor(selectedSeason.status)" variant="tonal">
                {{ getSeasonStatusLabel(selectedSeason.status) }}
              </v-chip>
              <v-chip size="small" :color="accessTypeColor" variant="tonal">
                <v-icon start size="small">{{ accessTypeIcon }}</v-icon>
                {{ accessTypeLabel }}
              </v-chip>
              <v-chip v-if="league.status !== 'active'" size="small" :color="leagueStatusColor" variant="tonal">
                {{ leagueStatusLabel }}
              </v-chip>
              <!-- An archived league is gone from every listing, but its URL
                   still resolves — say so rather than presenting a league
                   nobody can find as if it were running. -->
              <v-chip v-if="league.archived_at" size="small" color="grey" variant="tonal">
                <v-icon start size="small">mdi-archive</v-icon>
                Archived
              </v-chip>
            </div>
            <div v-if="seasonPhaseLine" class="text-subtitle-1 d-flex align-center ga-2 mb-1" data-testid="season-dates">
              <v-icon size="small">mdi-calendar-range</v-icon>
              <span>{{ seasonPhaseLine }}</span>
            </div>
            <div v-if="league.description" class="text-body-2 text-medium-emphasis">{{ league.description }}</div>
          </div>
          <div class="flex-shrink-0" style="width: 260px">
            <v-select
              aria-label="Select Season"
              v-model="selectedSeasonId"
              :items="visibleSeasons"
              item-title="name"
              item-value="id"
              label="Season"
              prepend-inner-icon="mdi-calendar"
              :loading="loadingSeasons"
              density="comfortable"
              hide-details
            >
              <template v-slot:item="{ item, props }">
                <v-list-item v-bind="props">
                  <template v-slot:append>
                    <v-chip size="x-small" :color="getSeasonStatusColor(item.raw.status)" variant="tonal">
                      {{ getSeasonStatusLabel(item.raw.status) }}
                    </v-chip>
                  </template>
                </v-list-item>
              </template>
            </v-select>
            <div v-if="selectedSeason" class="text-caption text-medium-emphasis mt-1 ml-3">
              {{ selectedSeason.name }} · {{ getSeasonStatusLabel(selectedSeason.status) }}
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- League Membership / Join CTA -->
      <v-row class="mb-4">
        <v-col cols="12">
          <!-- Member: your team in this season, or the way to one -->
          <v-card v-if="isLeagueMember" class="member-strip" data-testid="member-strip">
            <v-card-text class="d-flex align-center ga-4 flex-wrap">
              <v-icon color="primary" size="28">{{ myTeamInSeason ? 'mdi-shield-account' : 'mdi-account-check' }}</v-icon>
              <div class="flex-grow-1" style="min-width: 240px">
                <template v-if="myTeamInSeason">
                  <div class="text-subtitle-2">
                    Your team: {{ myTeamInSeason.team_name }} ·
                    <span :class="rosterShort ? 'text-warning' : 'text-success'">{{ rosterCount }} of {{ rosterMax }} players</span>
                  </div>
                  <div class="text-body-2 text-medium-emphasis">
                    {{ rosterShort ? `Cups need ${rosterMax}. Invite ${rosterMax - rosterCount} more before registering.` : 'Roster full. You can enter cups.' }}
                  </div>
                </template>
                <template v-else>
                  <div class="text-subtitle-2">You're a member. Next: {{ canCreateTeamInSeason ? 'create a team, or find one with an open slot.' : 'find a team with an open slot.' }}</div>
                  <div class="text-body-2 text-medium-emphasis">Teams are per season, {{ rosterMax }} a side.</div>
                </template>
              </div>
              <template v-if="myTeamInSeason">
                <v-btn variant="text" :to="myTeamLink">View team</v-btn>
                <v-btn color="primary" prepend-icon="mdi-account-plus" :to="myTeamLink">Invite players</v-btn>
              </template>
              <template v-else>
                <v-btn variant="text" :to="{ name: 'find-team' }">Find a team</v-btn>
                <v-btn v-if="canCreateTeamInSeason" color="primary" prepend-icon="mdi-plus" @click="showCreateTeamModal = true">Create a team</v-btn>
                <v-chip v-else-if="selectedSeason" variant="tonal" data-testid="season-team-registration-closed">
                  <v-icon start>mdi-lock-outline</v-icon>
                  {{ selectedSeason.status === 'draft' ? 'Team registration has not opened for this season' : 'Team registration is closed for this season' }}
                </v-chip>
              </template>
              <v-menu v-if="membershipType === 'member'" location="bottom end">
                <template v-slot:activator="{ props: menuProps }">
                  <v-btn v-bind="menuProps" icon="mdi-dots-vertical" variant="text" size="small" aria-label="More league actions" />
                </template>
                <v-list density="compact">
                  <v-list-item title="Leave league" prepend-icon="mdi-logout" @click="handleLeaveLeague" />
                </v-list>
              </v-menu>
            </v-card-text>
          </v-card>

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

          <!-- Join/apply rejection: inline, next to the CTA the user
               clicked. Not retryable — retrying an eligibility rejection
               cannot succeed. -->
          <v-alert
            v-if="joinError"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-2"
            closable
            data-testid="join-error"
            @click:close="clearJoinError"
          >
            {{ joinError }}
          </v-alert>

          <!-- Entry requirements: neutral chips (requirements are ordinary
               configuration, not an alarm), with the viewer's own pass/fail
               when they aren't a member yet. -->
          <v-card
            v-if="hasEntryRequirements"
            variant="tonal"
            density="compact"
            class="mt-2 pa-3"
            data-testid="entry-requirements"
          >
            <div class="d-flex align-center mb-2">
              <v-icon start size="small">mdi-shield-check</v-icon>
              <span class="text-subtitle-2 font-weight-bold">Entry Requirements</span>
              <v-chip
                v-if="viewerChecksRelevant && eligibilityCheck.failingChecks.value.length > 0"
                size="x-small"
                color="error"
                variant="tonal"
                class="ml-2"
              >
                You don't meet {{ eligibilityCheck.failingChecks.value.length }}
                {{ eligibilityCheck.failingChecks.value.length === 1 ? 'requirement' : 'requirements' }}
              </v-chip>
              <v-chip
                v-else-if="viewerChecksRelevant && eligibilityCheck.stats.value"
                size="x-small"
                color="success"
                variant="tonal"
                class="ml-2"
              >
                You qualify
              </v-chip>
            </div>
            <EligibilityRulesDisplay
              :rules="leagueRules"
              :checks="viewerChecksRelevant ? eligibilityCheck.checks.value : null"
            />
          </v-card>
        </v-col>
      </v-row>


      <!-- Tabs: the long scroll becomes places. `?tab=` deep-links them. -->
      <v-tabs v-model="activeTab" color="primary" class="mb-4">
        <v-tab value="overview">Overview</v-tab>
        <v-tab value="tournaments">Tournaments <v-chip size="x-small" variant="tonal" class="ml-2">{{ tournaments.length }}</v-chip></v-tab>
        <v-tab value="teams">Teams <v-chip size="x-small" variant="tonal" class="ml-2">{{ teams.length }}</v-chip></v-tab>
        <v-tab value="standings">Standings</v-tab>
        <v-tab value="awards">Awards &amp; Stats</v-tab>
      </v-tabs>

      <v-window v-model="activeTab">
        <v-window-item value="overview">
          <v-row>
            <v-col cols="12" md="8">
              <v-card class="mb-4">
                <v-card-title class="d-flex align-center">
                  Next up
                  <v-spacer />
                  <v-btn variant="text" color="primary" size="small" @click="activeTab = 'tournaments'">All tournaments</v-btn>
                </v-card-title>
                <v-card-text>
                  <template v-if="nextTournament">
                    <v-card variant="outlined" class="pa-4 d-flex align-center ga-4 flex-wrap" data-testid="next-up">
                      <v-avatar size="56" rounded="lg" color="surface-variant"><v-icon size="28">mdi-tournament</v-icon></v-avatar>
                      <div class="flex-grow-1" style="min-width: 220px">
                        <div class="text-h6">{{ nextTournament.name }}</div>
                        <div class="d-flex ga-2 flex-wrap my-1">
                          <v-chip size="small" :color="tournamentStatusColor(nextTournament.status)" variant="tonal">{{ tournamentStatusLabel(nextTournament.status) }}</v-chip>
                          <v-chip size="small" variant="tonal">{{ formatTournamentFormat(nextTournament.format) }}</v-chip>
                          <v-chip v-if="nextTournament.participant_type === 'team'" size="small" variant="tonal">Teams of {{ rosterMax }}</v-chip>
                          <v-chip size="small" variant="tonal">{{ nextTournament.max_participants }} max</v-chip>
                        </div>
                      </div>
                      <v-btn color="primary" variant="flat" :to="{ name: 'tournament-detail', params: { slug: nextTournament.slug } }">
                        {{ nextTournament.is_registration_open && myTeamInSeason && !rosterShort ? 'Register team' : 'View cup' }}
                      </v-btn>
                    </v-card>
                    <div v-if="nextTournament.is_registration_open && myTeamInSeason && rosterShort" class="text-caption text-medium-emphasis mt-2">
                      Register needs a full roster — {{ rosterCount }} of {{ rosterMax }} so far.
                    </div>
                  </template>
                  <EmptyState v-else icon="mdi-tournament" title="No tournaments for this season yet" variant="text" />
                </v-card-text>
              </v-card>
            </v-col>
            <v-col cols="12" md="4">
              <v-card class="mb-4">
                <v-card-title>Standings</v-card-title>
                <v-card-text class="text-body-2 text-medium-emphasis">{{ standingsHint }}</v-card-text>
                <template v-if="isLeagueMember">
                  <v-divider />
                  <v-card-title>Your season</v-card-title>
                  <v-card-text>
                    <div class="d-flex justify-space-between mb-2"><span class="text-medium-emphasis">Team</span><span>{{ myTeamInSeason?.team_name ?? 'None yet' }}</span></div>
                    <div class="d-flex justify-space-between mb-2"><span class="text-medium-emphasis">Roster</span><span :class="myTeamInSeason ? (rosterShort ? 'text-warning' : 'text-success') : ''">{{ myTeamInSeason ? `${rosterCount} of ${rosterMax}` : '—' }}</span></div>
                    <div class="d-flex justify-space-between"><span class="text-medium-emphasis">Your role</span><span>{{ myTeamInSeason ? getRoleLabel(myTeamInSeason.role) : '—' }}</span></div>
                  </v-card-text>
                </template>
              </v-card>
            </v-col>
          </v-row>
        </v-window-item>

        <v-window-item value="tournaments">
          <div v-if="canCreateTournament" class="d-flex justify-end mb-4">
            <v-btn color="primary" variant="tonal" prepend-icon="mdi-tournament" @click="showCreateTournamentModal = true">Create Tournament</v-btn>
          </div>
      <v-progress-linear v-if="loadingTournaments" indeterminate class="mb-4" />

      <v-row v-if="tournaments.length > 0" class="mb-6">
        <v-col v-for="tournament in tournaments" :key="tournament.id" cols="12" sm="6" md="4" lg="3">
          <TournamentCard :tournament="tournament" @click="openTournament(tournament)" />
        </v-col>
      </v-row>

      <EmptyState
        v-else-if="!loadingTournaments && selectedSeasonId"
        icon="mdi-tournament"
        title="No tournaments for this season yet."
        class="mb-6"
      />
        </v-window-item>

        <v-window-item value="teams">
          <div v-if="canCreateTeamInSeason" class="d-flex justify-end mb-4">
            <v-btn color="primary" prepend-icon="mdi-plus" @click="showCreateTeamModal = true">Create Team</v-btn>
          </div>
      <v-progress-linear v-if="loadingTeams" indeterminate class="mb-4" />

      <v-row v-if="teams.length > 0">
        <v-col v-for="team in teams" :key="team.team_id" cols="12" sm="6" md="4" lg="3">
          <v-card class="h-100" hover @click="viewTeam(team)">
            <v-card-item>
              <template v-slot:prepend>
                <v-avatar color="secondary" size="48" rounded="lg">
                  <v-img alt="" v-if="team.team_logo_url" :src="team.team_logo_url" />
                  <span v-else class="text-body-2 font-weight-bold">{{ team.team_tag }}</span>
                </v-avatar>
              </template>
              <v-card-title>{{ team.team_name }}</v-card-title>
              <v-card-subtitle>[{{ team.team_tag }}]</v-card-subtitle>
            </v-card-item>
            <v-card-actions>
              <v-chip size="small" variant="tonal" :color="(team.active_member_count || 0) >= (team.team_size_max || rosterMax) ? 'success' : undefined">
                <v-icon start size="small">mdi-account-group</v-icon>
                {{ team.active_member_count || 0 }} of {{ team.team_size_max || rosterMax }}
              </v-chip>
              <v-spacer />
              <v-icon size="small">mdi-chevron-right</v-icon>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>

      <!-- Empty Teams State -->
      <EmptyState
        v-else-if="!loadingTeams && selectedSeasonId"
        icon="mdi-shield-outline"
        title="No teams yet"
        subtitle="Be the first to create a team for this season."
      >
        <template #action>
          <v-btn
            v-if="canCreateTeamInSeason"
            color="primary"
            prepend-icon="mdi-plus"
            class="mt-4"
            @click="showCreateTeamModal = true"
          >
            Create Team
          </v-btn>
          <v-btn v-else-if="!isAuthenticated" color="primary" class="mt-4" to="/login">
            Sign In to Join League
          </v-btn>
        </template>
      </EmptyState>
        </v-window-item>

        <v-window-item value="standings">
          <v-card>
            <v-card-text class="text-body-2 text-medium-emphasis">{{ standingsHint }}</v-card-text>
            <template v-if="playedTournaments.length">
              <v-divider />
              <v-list density="compact">
                <v-list-subheader>Brackets</v-list-subheader>
                <v-list-item
                  v-for="t in playedTournaments"
                  :key="t.id"
                  :title="t.name"
                  :subtitle="tournamentStatusLabel(t.status)"
                  prepend-icon="mdi-tournament"
                  :to="{ name: 'tournament-detail', params: { slug: t.slug }, query: { tab: 'bracket' } }"
                />
              </v-list>
            </template>
          </v-card>
        </v-window-item>

        <v-window-item value="awards">
          <template v-if="selectedSeasonId">
            <h2 class="text-h6 mb-4"><v-icon start>mdi-trophy-outline</v-icon>Season Awards</h2>
            <AwardsPanel scope-type="league_season" :scope-id="selectedSeasonId" class="mb-6" />
            <h2 class="text-h6 mb-4"><v-icon start>mdi-chart-box-outline</v-icon>Season Stats</h2>
            <StatsLeaderboard scope="season" :scope-id="selectedSeasonId" />
          </template>
        </v-window-item>
      </v-window>

      <!-- No Season Selected -->
      <EmptyState
        v-if="!loadingSeasons && seasons.length === 0"
        icon="mdi-calendar-remove"
        title="No Seasons Available"
        subtitle="This league doesn't have any seasons yet."
        class="mt-4"
      />
    </template>

    <!-- Create Team Modal -->
    <v-dialog v-model="showCreateTeamModal" max-width="500" persistent>
      <v-card>
        <v-card-title>Create Team</v-card-title>
        <v-card-text>
          <!--
            P-41: bounds mirror `CreateLeagueTeamRequest`
            (api/crates/portal-api/src/dto/requests/league_team.rs:247-275),
            which `ValidatedJson` enforces on the endpoint both create-team
            forms POST to — name 2..=50, tag 2..=5, description ..=1000.

            This form demanded name ≥ 3, refusing a two-character name the
            backend accepts, while allowing an 8-character tag the backend
            rejects with a 400. The admin modal disagreed with both. Neither
            form was right; the DTO is.
          -->
          <v-form ref="createTeamForm" v-model="createTeamValid">
            <v-text-field
              v-model="newTeam.name"
              label="Team Name"
              :rules="[rules.required, rules.minLength(2), rules.maxLength(50)]"
              counter="50"
              class="mb-2"
            />
            <v-text-field
              v-model="newTeam.tag"
              label="Team Tag"
              :rules="[rules.required, rules.minLength(2), rules.maxLength(5)]"
              counter="5"
              hint="Short identifier for your team (2-5 characters)"
              class="mb-2"
            />
            <v-textarea
              v-model="newTeam.description"
              label="Description (optional)"
              rows="3"
              counter="1000"
              :rules="[rules.maxLength(1000)]"
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
    <v-dialog v-model="showApplyDialog" max-width="450" persistent>
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
          <!-- The rejection used to render at the top of the page, BEHIND
               this dialog's overlay — the dialog just appeared not to
               submit. -->
          <v-alert
            v-if="joinError"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-2"
          >
            {{ joinError }}
          </v-alert>
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
              <v-img alt="" v-if="selectedTeam.team_logo_url" :src="selectedTeam.team_logo_url" />
              <span v-else class="text-body-1 font-weight-bold">{{ selectedTeam.team_tag }}</span>
            </v-avatar>
          </template>
          <v-card-title>{{ selectedTeam.team_name }}</v-card-title>
          <v-card-subtitle>[{{ selectedTeam.team_tag }}]</v-card-subtitle>
          <template v-slot:append>
            <v-btn aria-label="Close" icon variant="text" @click="showTeamDetailModal = false">
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
                  <v-img alt="" v-if="member.avatar_url" :src="member.avatar_url" />
                  <v-icon v-else>mdi-account</v-icon>
                </v-avatar>
              </template>
              <v-list-item-title>{{ member.display_name }}</v-list-item-title>
              <v-list-item-subtitle>
                <!-- P-132: `role` is `LeagueTeamRole`, not a display string. -->
                <v-chip size="x-small" :color="getRoleColor(member.role)" variant="tonal">
                  {{ getRoleLabel(member.role) }}
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

    <ConfirmDialogHost :dialog="confirmDialog" />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLeagueDetail } from '@/composables/useLeagueDetail'
import { useAuthStore } from '@/stores/auth'
import { useGamesStore } from '@/stores/games'
import { useLeagueSeasonsStore } from '@/stores/leagueSeasons'
import { useFormRules } from '@/composables/useFormRules'
import { formatDate } from '@/utils/formatters'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import TournamentCreateModal from '@/components/admin/TournamentCreateModal.vue'
import TournamentCard from '@/components/tournament/TournamentCard.vue'
import AwardsPanel from '@/components/awards/AwardsPanel.vue'
import StatsLeaderboard from '@/components/awards/StatsLeaderboard.vue'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import type { LeagueTeamSummaryResponse } from '@/stores/leagueTeams'
import { formatTournamentFormat, type TournamentSummaryResponse } from '@/stores/tournaments'
import { seasonStatusMap, leagueAccessTypeMap, leagueStatusMap, teamRoleMap, tournamentPublicStatusMap, tournamentStatusMap, getStatusColor, getStatusLabel, getStatusIcon } from '@/utils/statusMaps'
import { rulesFromSettings, hasAnyRules } from '@/composables/useEligibilityRules'
import { useEligibilityCheck } from '@/composables/useEligibilityCheck'
import EligibilityRulesDisplay from '@/components/eligibility/EligibilityRulesDisplay.vue'

// P-178: the local map copy moved to `statusMaps.ts` once the lane contention
// on that file ended — see `leagueStatusMap` there for provenance.

const router = useRouter()
const route = useRoute()

const {
  league, seasons, visibleSeasons, selectedSeason, canCreateTeamInSeason,
  teams, tournaments, gameName,
  isLeagueMember, membershipType, hasPendingApplication,
  selectedSeasonId, selectedTeam, teamMembers,
  loading, loadingSeasons, loadingTeams, loadingTournaments, loadingMembers, creatingTeam,
  joiningLeague, applyingToLeague,
  error, clearError, joinError, clearJoinError, isAuthenticated,
  fetchAll, fetchTeamMembers, createTeam,
  joinLeague, applyToLeague, leaveLeague,
} = useLeagueDetail()

const authStore = useAuthStore()
const gamesStore = useGamesStore()
const seasonsStore = useLeagueSeasonsStore()

const canCreateTournament = computed(() => authStore.isAdmin)

const leagueTeamsStore = useLeagueTeamsStore()

// Tabs are URL-addressable (?tab=) like the tournament page's.
const VALID_TABS = ['overview', 'tournaments', 'teams', 'standings', 'awards']
const initialTab = route.query.tab
const activeTab = ref<string>(typeof initialTab === 'string' && VALID_TABS.includes(initialTab) ? initialTab : 'overview')
watch(activeTab, (tab) => {
  if (route.query.tab === tab || (tab === 'overview' && route.query.tab === undefined)) return
  router.replace({ query: { ...route.query, tab } })
})
watch(() => route.query.tab, (tab) => {
  if (typeof tab === 'string' && VALID_TABS.includes(tab) && tab !== activeTab.value) activeTab.value = tab
})

// The viewer's own team in the selected season, with its roster against the
// season's team size — the strip and the overview both read this.
const myTeamInSeason = computed(() =>
  leagueTeamsStore.myTeams.find(t => t.season_id === selectedSeasonId.value && t.status === 'active') ?? null,
)
const myTeamSummary = computed(() =>
  myTeamInSeason.value ? (teams.value.find(t => t.team_season_id === myTeamInSeason.value!.team_season_id) ?? null) : null,
)
const rosterMax = computed(() => myTeamSummary.value?.team_size_max ?? selectedSeason.value?.team_size_max ?? 5)
const rosterCount = computed(() => myTeamSummary.value?.active_member_count ?? 1)
const rosterShort = computed(() => rosterCount.value < rosterMax.value)
const myTeamLink = computed(() =>
  myTeamInSeason.value
    ? { path: `/teams/${myTeamInSeason.value.team_id}`, query: { season: myTeamInSeason.value.team_season_id } }
    : undefined,
)

// The tournament a member most likely wants next: one taking entries, else
// one being played, else whatever is scheduled.
const NEXT_UP_ORDER = ['registration', 'published', 'scheduled', 'in_progress', 'draft', 'completed', 'finalized', 'cancelled']
const nextTournament = computed(() =>
  [...tournaments.value].sort((a, b) => NEXT_UP_ORDER.indexOf(a.status) - NEXT_UP_ORDER.indexOf(b.status))[0] ?? null,
)
const playedTournaments = computed(() =>
  tournaments.value.filter(t => ['in_progress', 'completed', 'finalized'].includes(t.status)),
)
const tournamentStatusLabel = (status: string) =>
  tournamentPublicStatusMap[status as keyof typeof tournamentPublicStatusMap]?.label ?? getStatusLabel(tournamentStatusMap, status)
const tournamentStatusColor = (status: string) =>
  tournamentPublicStatusMap[status as keyof typeof tournamentPublicStatusMap]?.color ?? getStatusColor(tournamentStatusMap, status)

const seasonPhaseLine = computed(() => {
  const n = teams.value.length
  const parts = [seasonDatesLine.value, n ? `${n} ${n === 1 ? 'team' : 'teams'} entered` : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
})
const standingsHint = computed(() => {
  const start = selectedSeason.value?.season_start
  return `Standings appear after the first match day${start ? `, ${formatDate(start)}` : ''}.`
})

const seasonDatesLine = computed(() => {
  const s = selectedSeason.value
  if (!s) return null
  const span = (a?: string | null, b?: string | null) =>
    a || b ? `${a ? formatDate(a) : '…'} – ${b ? formatDate(b) : '…'}` : null
  const parts = [
    span(s.registration_start, s.registration_end) && `Registration ${span(s.registration_start, s.registration_end)}`,
    span(s.season_start, s.season_end) && `Plays ${span(s.season_start, s.season_end)}`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
})
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

// Entry requirements via the shared rules model.
const leagueRules = computed(() => rulesFromSettings(league.value?.settings))
const hasEntryRequirements = computed(() => hasAnyRules(leagueRules.value))

// "Do I qualify?" — checked against the viewer's own stats, but only when
// the answer can change what they do next: prospective joiners. Members and
// signed-out visitors see the plain rules.
const viewerChecksRelevant = computed(
  () => isAuthenticated.value && !isLeagueMember.value,
)
const eligibilityCheck = useEligibilityCheck(
  leagueRules,
  computed(() => (viewerChecksRelevant.value ? authStore.playerId : null)),
  computed(() => league.value?.game_id ?? null),
)

const leagueStatusLabel = computed(() => getStatusLabel(leagueStatusMap, league.value?.status ?? ''))
const leagueStatusColor = computed(() => getStatusColor(leagueStatusMap, league.value?.status ?? ''))

// Access type display helpers
const accessTypeLabel = computed(() => getStatusLabel(leagueAccessTypeMap, league.value?.access_type ?? ''))
const accessTypeColor = computed(() => getStatusColor(leagueAccessTypeMap, league.value?.access_type ?? ''))
const accessTypeIcon = computed(() => getStatusIcon(leagueAccessTypeMap, league.value?.access_type ?? ''))

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

const getSeasonStatusColor = (status: string) => getStatusColor(seasonStatusMap, status)
// The chip printed the RAW season status (`registration`, `playoffs`, …) to
// visitors — `getStatusLabel` was imported for the access-type chip but never
// applied here. See COVERAGE-PLAN.md §9c.
const getSeasonStatusLabel = (status: string) => getStatusLabel(seasonStatusMap, status)

// P-132: exactly the same omission one card over — the team-detail roster chip
// printed `member.role` raw and coloured itself from an inline
// `role === 'captain'` ternary, so `player` and `substitute` were
// indistinguishable AND both read as the wire value.
const getRoleColor = (role: string) => getStatusColor(teamRoleMap, role)
const getRoleLabel = (role: string) => getStatusLabel(teamRoleMap, role)

// Season is URL-addressable (?season=<id>) — a shared league link opens on
// the same season the sender was viewing.
watch(selectedSeasonId, (seasonId) => {
  const current = (route.query.season as string | undefined) ?? null
  if (current === (seasonId ?? null)) return
  router.replace({ query: { ...route.query, season: seasonId ?? undefined } })
})

watch(
  () => [route.query.season, loadingSeasons.value] as const,
  ([querySeason, stillLoading]) => {
    if (stillLoading) return
    if (typeof querySeason !== 'string') return
    if (querySeason === selectedSeasonId.value) return
    // Only accept season ids that belong to this league and that this
    // viewer may see (a player linked to a draft stays on the default).
    if (visibleSeasons.value.some((s) => s.id === querySeason)) {
      selectedSeasonId.value = querySeason
    }
  },
  { immediate: true },
)

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
