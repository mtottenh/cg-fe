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
          <template v-if="!isAuthenticated && tournament.is_registration_open">
            <v-btn
              color="primary"
              size="large"
              prepend-icon="mdi-steam"
              :to="{ name: 'login', query: { redirect: route.fullPath } }"
              data-testid="register-sign-in"
            >
              Sign in to register
            </v-btn>
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
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { TournamentResponse, TournamentRegistrationResponse } from '@/stores/tournaments'
import { formatDateTime } from '@/utils/formatters'

const route = useRoute()
const authStore = useAuthStore()
const isAuthenticated = computed(() => authStore.isAuthenticated)

const props = withDefaults(
  defineProps<{
    tournament: TournamentResponse
    myRegistration: TournamentRegistrationResponse | null | undefined
    loading?: boolean
    hasEligibleTeams?: boolean
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
  { isInvited: undefined },
)

defineEmits<{
  register: []
  withdraw: []
  'check-in': []
}>()

const canRegister = computed(() => {
  if (!props.tournament.is_registration_open) return false
  if (props.myRegistration) return false
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
  if (props.myRegistration?.checked_in) return 'success'
  if (props.myRegistration?.status === 'approved') return 'primary'
  if (props.myRegistration?.status === 'pending') return 'warning'
  if (needsInvitation.value) return 'warning'
  if (props.tournament.is_registration_open) return 'success'
  if (isRegistrationComingSoon.value) return 'info'
  return 'grey'
})

const iconColor = computed(() => {
  if (props.myRegistration?.checked_in) return 'success'
  if (props.myRegistration?.status === 'approved') return 'primary'
  if (props.myRegistration?.status === 'pending') return 'warning'
  if (needsInvitation.value) return 'warning'
  if (props.tournament.is_registration_open) return 'success'
  if (isRegistrationComingSoon.value) return 'info'
  return 'grey'
})

const icon = computed(() => {
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
  if (props.myRegistration?.checked_in) return "You're All Set!"
  if (props.myRegistration?.status === 'approved' && canCheckIn.value) return 'Check-in Now Open'
  if (props.myRegistration?.status === 'approved') return "You're Registered"
  if (props.myRegistration?.status === 'pending') return 'Registration Pending'
  if (needsInvitation.value) return 'Invitation Required'
  if (props.tournament.is_registration_open) return 'Join This Tournament'
  if (isRegistrationComingSoon.value) return 'Registration Opens Soon'
  return 'Registration Closed'
})

const subtitle = computed(() => {
  if (props.myRegistration?.checked_in) return 'Good luck in the tournament!'
  if (props.myRegistration?.status === 'approved' && canCheckIn.value) return 'Check in now to confirm your participation'
  if (props.myRegistration?.status === 'approved') return 'Check-in will open before the tournament starts'
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
  return 'Registration for this tournament has closed'
})

</script>
