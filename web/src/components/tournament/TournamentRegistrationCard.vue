<template>
  <v-card :color="cardColor" variant="tonal">
    <v-card-text>
      <v-row align="center">
        <v-col>
          <div class="d-flex align-center mb-2">
            <v-icon :color="iconColor" class="mr-2">{{ icon }}</v-icon>
            <span class="text-h6 font-weight-bold">{{ title }}</span>
          </div>
          <p class="text-body-2 mb-0">{{ subtitle }}</p>
        </v-col>

        <v-col cols="auto">
          <!-- Signed out: the page is public, the action is not -->
          <template v-if="signedOut && tournament.is_registration_open">
            <v-btn
              color="primary"
              size="large"
              prepend-icon="mdi-steam"
              :to="{ name: 'login', query: { redirect: redirectPath } }"
              data-testid="register-sign-in"
            >
              Sign in to register
            </v-btn>
          </template>

          <!-- Not in the league: teams come from it -->
          <template v-else-if="teamGate === 'not_member'">
            <v-btn
              color="primary"
              size="large"
              :to="leagueId ? { name: 'league-detail', params: { id: leagueId } } : { name: 'leagues' }"
              data-testid="join-league-gate"
            >
              Join {{ leagueName ?? 'the league' }}
            </v-btn>
          </template>

          <!-- Member without a team in this season -->
          <template v-else-if="teamGate === 'no_team'">
            <div class="d-flex align-center ga-2 flex-wrap justify-end">
              <v-btn variant="text" :to="{ name: 'find-team' }">Find a team</v-btn>
              <v-btn
                color="primary"
                size="large"
                :to="leagueId ? { name: 'league-detail', params: { id: leagueId }, query: { ...(seasonId ? { season: seasonId } : {}), tab: 'teams' } } : { name: 'leagues' }"
                data-testid="create-team-gate"
              >
                Create a team
              </v-btn>
            </div>
          </template>

          <!-- Captain with a roster that is too short -->
          <template v-else-if="teamGate === 'short' && myTeam">
            <div class="d-flex align-center ga-3 flex-wrap justify-end">
              <v-btn color="primary" size="large" prepend-icon="mdi-account-plus" :to="{ path: `/teams/${myTeam.teamId}`, query: { season: myTeam.teamSeasonId } }">
                Invite players
              </v-btn>
              <div class="d-flex flex-column align-end">
                <v-btn size="large" disabled data-testid="register-short-roster">Register team</v-btn>
                <span class="text-caption text-medium-emphasis mt-1">{{ myTeam.rosterMax - myTeam.rosterCount }} more {{ myTeam.rosterMax - myTeam.rosterCount === 1 ? 'player' : 'players' }} needed</span>
              </div>
            </div>
          </template>

          <!-- Not Registered - Show Register Button -->
          <template v-else-if="!myRegistration && canRegister">
            <v-btn
              color="success"
              size="large"
              :loading="loading"
              @click="$emit('register')"
            >
              <v-icon start>{{ isTeamTournament ? 'mdi-account-group' : 'mdi-account-plus' }}</v-icon>
              {{ isTeamTournament ? 'Register Team' : 'Register Now' }}
            </v-btn>
          </template>

          <!-- Registered - Pending Approval -->
          <template v-else-if="myRegistration?.status === 'pending'">
            <div class="text-center">
              <v-chip color="warning" class="mb-2">
                <v-icon start>mdi-clock-outline</v-icon>
                Awaiting Approval
              </v-chip>
              <div>
                <v-btn
                  variant="text"
                  color="error"
                  size="small"
                  :loading="loading"
                  @click="$emit('withdraw')"
                >
                  Cancel Registration
                </v-btn>
              </div>
            </div>
          </template>

          <!-- Registered - Approved, Check-in Available -->
          <template v-else-if="myRegistration && canCheckIn && !myRegistration.checked_in">
            <v-btn
              color="primary"
              size="large"
              :loading="loading"
              @click="$emit('check-in')"
            >
              <v-icon start>mdi-checkbox-marked-circle</v-icon>
              Check In
            </v-btn>
          </template>

          <!-- Registered - Checked In -->
          <template v-else-if="myRegistration?.checked_in">
            <v-chip color="success" size="large">
              <v-icon start>mdi-check-circle</v-icon>
              Checked In
            </v-chip>
          </template>

          <!-- Registered - Approved, No Check-in Yet -->
          <template v-else-if="myRegistration?.status === 'approved'">
            <div class="text-center">
              <v-chip color="success" class="mb-2">
                <v-icon start>mdi-check</v-icon>
                Registered
              </v-chip>
              <div v-if="canWithdraw">
                <v-btn
                  variant="text"
                  color="error"
                  size="small"
                  :loading="loading"
                  @click="$emit('withdraw')"
                >
                  Withdraw
                </v-btn>
              </div>
            </div>
          </template>

          <!-- Registration Open but no eligible teams -->
          <template v-else-if="tournament.is_registration_open && isTeamTournament && hasEligibleTeams === false">
            <v-chip color="info">
              <v-icon start>mdi-information</v-icon>
              No Eligible Teams
            </v-chip>
          </template>

          <!-- Invite-only: registration is gated on an invite list this viewer
               cannot read (see FINDING in the script block). The plain
               "Register Team" / "Register Now" call to action is withheld so
               nobody is invited to walk into a 403; what is offered instead
               states its own precondition. -->
          <template v-else-if="needsInvitation">
            <!-- P-51: known-uninvited -> hard block, no register affordance. -->
            <div v-if="invitationHardBlock" class="text-right" data-testid="invite-only-gate">
              <v-chip color="warning" size="large" data-testid="invitation-required-block">
                <v-icon start>mdi-email-lock-outline</v-icon>
                Not Invited
              </v-chip>
            </div>
            <!-- Invite state not yet knowable -> soft conditional affordance. -->
            <div v-else class="text-right" data-testid="invite-only-gate">
              <v-btn
                color="warning"
                variant="tonal"
                size="large"
                :loading="loading"
                data-testid="register-with-invitation"
                @click="$emit('register')"
              >
                <v-icon start>mdi-email-check-outline</v-icon>
                I Have an Invitation
              </v-btn>
            </div>
          </template>

          <!-- Registration Coming Soon -->
          <template v-else-if="isRegistrationComingSoon">
            <v-chip color="info">
              <v-icon start>mdi-calendar-clock</v-icon>
              Coming Soon
            </v-chip>
          </template>

          <!-- Registration Closed -->
          <template v-else-if="!canRegister">
            <v-chip color="grey">
              <v-icon start>mdi-lock</v-icon>
              Registration Closed
            </v-chip>
          </template>
        </v-col>
      </v-row>

      <!-- Seed Info (if seeded) -->
      <div v-if="myRegistration?.seed" class="mt-4 d-flex align-center">
        <v-icon size="small" class="mr-2">mdi-format-list-numbered</v-icon>
        <span class="text-body-2">Your seed: <strong>#{{ myRegistration.seed }}</strong></span>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TournamentResponse, TournamentRegistrationResponse } from '@/stores/tournaments'
import { formatDateTime } from '@/utils/formatters'

const props = withDefaults(
  defineProps<{
    tournament: TournamentResponse
    myRegistration: TournamentRegistrationResponse | null | undefined
    loading?: boolean
    hasEligibleTeams?: boolean
    /** The viewer is signed out: the page is public, registering is not. */
    signedOut?: boolean
    /** Where to send them back to after sign-in. */
    redirectPath?: string
    /** Membership of the league this cup runs in; undefined while unknown. */
    isLeagueMember?: boolean
    leagueId?: string | null
    leagueName?: string | null
    seasonId?: string | null
    seasonName?: string | null
    /** The viewer's own team in this league season, with its roster. */
    myTeam?: { teamId: string; teamSeasonId: string; name: string; rosterCount: number; rosterMax: number } | null
    /** Live entries, for the closed state's "8 teams entered". */
    enteredCount?: number | null
    /**
     * P-51: whether THIS viewer holds a pending invitation to an invite-only
     * tournament. `true` -> the invite-only gate opens (register affordance).
     * `false` -> hard block (the gate states the invitation is required and
     * offers no register button — the prior soft P-47 behaviour let an uninvited
     * caller click through to a guaranteed 403). `undefined` -> not knowable
     * (not invite-only, or the invite list has not loaded); falls back to the
     * old conditional affordance so nothing regresses when the signal is absent.
     *
     * `withDefaults(..., { isInvited: undefined })` is load-bearing: without it
     * Vue's boolean-prop casting coerces an absent prop to `false`, which would
     * silently turn every not-yet-known case into a hard block.
     */
    isInvited?: boolean
  }>(),
  {
    isInvited: undefined, signedOut: false, redirectPath: '/',
    isLeagueMember: undefined, leagueId: null, leagueName: null, seasonId: null, seasonName: null,
    myTeam: null, enteredCount: null,
  },
)

/**
 * Why a team captain cannot register yet — one cause, so the strip can say
 * it and offer the way out. `null` when none of these apply (the existing
 * register / registered / closed states take over).
 */
const teamGate = computed<'not_member' | 'no_team' | 'short' | null>(() => {
  if (!isTeamTournament.value || props.signedOut) return null
  if (!props.tournament.is_registration_open || props.myRegistration) return null
  if (props.isLeagueMember === false) return 'not_member'
  if (props.isLeagueMember && !props.myTeam) return 'no_team'
  if (props.myTeam && props.myTeam.rosterCount < props.myTeam.rosterMax) return 'short'
  return null
})

const closesSentence = computed(() =>
  props.tournament.registration_end ? ` Registration closes ${formatDateTime(props.tournament.registration_end)}.` : '',
)

defineEmits<{
  register: []
  withdraw: []
  'check-in': []
}>()

const canRegister = computed(() => {
  if (!props.tournament.is_registration_open) return false
  if (props.myRegistration) return false
  if (teamGate.value) return false
  if (isTeamTournament.value && props.hasEligibleTeams === false) return false
  // Invite-only entry is conditional on an invite list. P-51: when the viewer's
  // own invitation is known to exist (`isInvited === true`) the gate opens and
  // the normal register affordance is offered. Otherwise `needsInvitation`
  // renders either a hard block (known-uninvited) or the soft conditional
  // affordance (invite state not yet knowable).
  if (isInviteOnly.value) return props.isInvited === true
  return true
})

const isTeamTournament = computed(() => {
  return props.tournament.participant_type === 'team'
})

const isInviteOnly = computed(() => props.tournament.registration_type === 'invite_only')

/**
 * Invite-only, registration open, and this viewer is not already in.
 *
 * FINDING (P-47 follow-up) — the invite state is NOT knowable here.
 * All three invitation endpoints require `tournament.participants.manage`
 * (`api/crates/portal-api/src/handlers/tournaments/registration.rs:118`, `:180`,
 * `:225`), and no field on `TournamentResponse` carries the viewer's own
 * invitation. A captain therefore cannot be told whether *they* are invited —
 * only that an invitation is required. So this component does the one honest
 * thing available: it withholds the unconditional "Register" call to action
 * (which promised entry it cannot deliver — the P-8 dead-end family) and
 * offers an explicitly conditional one instead, with the precondition stated
 * before the click rather than as a 403 afterwards.
 *
 * P-51 RESOLUTION — the invite state IS now knowable: `list_invitations`
 * self-scopes, so `isInvited` tells this component whether the viewer holds an
 * invitation. When `isInvited === true`, `canRegister` opens and this gate does
 * not render. When `isInvited === false`, the gate is a HARD block (no register
 * button — see `invitationHardBlock`). When `isInvited === undefined` (invite
 * list not loaded), it degrades to the original soft conditional affordance.
 */
const needsInvitation = computed(() => {
  if (!isInviteOnly.value) return false
  if (!props.tournament.is_registration_open) return false
  if (props.myRegistration) return false
  if (isTeamTournament.value && props.hasEligibleTeams === false) return false
  // A known invitation is handled by `canRegister`, not the gate.
  if (props.isInvited === true) return false
  return true
})

/**
 * The viewer is definitively NOT invited (self-scoped invite list loaded and
 * carried no invitation for them). The gate offers no register button at all —
 * clicking through would be a guaranteed 403.
 */
const invitationHardBlock = computed(() => needsInvitation.value && props.isInvited === false)

// Registration hasn't opened yet (tournament is published but registration not open)
const isRegistrationComingSoon = computed(() => {
  return props.tournament.status === 'published' && !props.tournament.is_registration_open
})

const canCheckIn = computed(() => {
  return props.tournament.is_check_in_open && props.myRegistration?.status === 'approved'
})

const canWithdraw = computed(() => {
  if (!props.myRegistration) return false
  const status = props.tournament.status
  return ['registration', 'scheduled'].includes(status)
})

const cardColor = computed(() => {
  if (teamGate.value === 'short') return 'warning'
  if (teamGate.value) return 'info'
  if (props.myRegistration?.checked_in) return 'success'
  if (props.myRegistration?.status === 'approved') return 'primary'
  if (props.myRegistration?.status === 'pending') return 'warning'
  if (needsInvitation.value) return 'warning'
  if (props.tournament.is_registration_open) return 'success'
  if (isRegistrationComingSoon.value) return 'info'
  return 'grey'
})

const iconColor = computed(() => {
  if (teamGate.value === 'short') return 'warning'
  if (teamGate.value) return 'info'
  if (props.myRegistration?.checked_in) return 'success'
  if (props.myRegistration?.status === 'approved') return 'primary'
  if (props.myRegistration?.status === 'pending') return 'warning'
  if (needsInvitation.value) return 'warning'
  if (props.tournament.is_registration_open) return 'success'
  if (isRegistrationComingSoon.value) return 'info'
  return 'grey'
})

const icon = computed(() => {
  if (teamGate.value === 'short') return 'mdi-account-alert-outline'
  if (teamGate.value === 'no_team') return 'mdi-account-group-outline'
  if (teamGate.value === 'not_member') return 'mdi-trophy-outline'
  if (props.myRegistration?.checked_in) return 'mdi-check-circle'
  if (props.myRegistration?.status === 'approved' && canCheckIn.value) return 'mdi-checkbox-marked-circle-outline'
  if (props.myRegistration?.status === 'approved') return 'mdi-check'
  if (props.myRegistration?.status === 'pending') return 'mdi-clock-outline'
  if (needsInvitation.value) return 'mdi-email-lock-outline'
  if (props.tournament.is_registration_open) return 'mdi-account-plus'
  if (isRegistrationComingSoon.value) return 'mdi-calendar-clock'
  return 'mdi-lock'
})

const title = computed(() => {
  if (teamGate.value === 'not_member') return `Teams in this cup come from ${props.leagueName ?? 'its league'}.`
  if (teamGate.value === 'no_team') return `You need a ${props.seasonName ?? 'league'} team to enter.`
  if (teamGate.value === 'short' && props.myTeam) {
    return `${props.myTeam.name} has ${props.myTeam.rosterCount} of ${props.myTeam.rosterMax} players. Cups need ${props.myTeam.rosterMax}.`
  }
  if (props.signedOut && props.tournament.is_registration_open) return 'Sign in to register a team.'
  if (props.myRegistration?.checked_in) return "You're All Set!"
  if (props.myRegistration?.status === 'approved' && canCheckIn.value) return 'Check-in Now Open'
  if (props.myRegistration?.status === 'approved') return `${props.myTeam?.name ?? 'You'} ${props.myTeam ? 'is' : 'are'} in.`
  if (!props.myRegistration && canRegister.value && props.myTeam) return `Register ${props.myTeam.name} for ${props.tournament.name}.`
  if (props.myRegistration?.status === 'pending') return 'Registration Pending'
  if (needsInvitation.value) return 'Invitation Required'
  if (props.tournament.is_registration_open) return 'Join This Tournament'
  if (isRegistrationComingSoon.value) return 'Registration Opens Soon'
  return 'Registration Closed'
})

const subtitle = computed(() => {
  if (teamGate.value === 'not_member') return 'Join the league first, then create or join a team.'
  if (teamGate.value === 'no_team') return 'Create one and invite players, or ask a team with an open slot.'
  if (teamGate.value === 'short') return `Register opens as soon as the roster is full.${closesSentence.value}`
  if (props.signedOut && props.tournament.is_registration_open) return 'Brackets and teams are open to everyone; entering needs an account.'
  if (props.myRegistration?.checked_in) return 'Good luck in the tournament!'
  if (props.myRegistration?.status === 'approved' && canCheckIn.value) return 'Check in now to confirm your participation'
  if (props.myRegistration?.status === 'approved') {
    return props.tournament.check_in_start
      ? `Check-in opens ${formatDateTime(props.tournament.check_in_start)}.`
      : 'Check-in will open before the tournament starts'
  }
  if (!props.myRegistration && canRegister.value && props.myTeam) return `${props.myTeam.rosterMax} players on the roster.${closesSentence.value}`
  if (props.myRegistration?.status === 'pending') return 'Your registration is awaiting admin approval'
  if (needsInvitation.value) {
    return isTeamTournament.value
      ? 'This tournament is invite only. Only teams the organiser has invited can register — ask them for an invitation if you have not had one.'
      : 'This tournament is invite only. Only players the organiser has invited can register — ask them for an invitation if you have not had one.'
  }
  if (props.tournament.is_registration_open) {
    return isTeamTournament.value ? 'Register your team to compete' : 'Sign up now to compete'
  }
  if (isRegistrationComingSoon.value) {
    if (props.tournament.registration_start) {
      return `Registration opens ${formatDateTime(props.tournament.registration_start)}`
    }
    return 'Registration will open soon'
  }
  if (props.enteredCount != null) {
    const n = props.enteredCount
    return `Registration closed. ${n} ${isTeamTournament.value ? (n === 1 ? 'team' : 'teams') : (n === 1 ? 'player' : 'players')} entered.`
  }
  return 'Registration for this tournament has closed'
})

</script>
