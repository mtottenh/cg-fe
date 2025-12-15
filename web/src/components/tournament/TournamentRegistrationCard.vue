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
          <!-- Not Registered - Show Register Button -->
          <template v-if="!myRegistration && canRegister">
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

const props = defineProps<{
  tournament: TournamentResponse
  myRegistration: TournamentRegistrationResponse | null | undefined
  loading?: boolean
}>()

defineEmits<{
  register: []
  withdraw: []
  'check-in': []
}>()

const canRegister = computed(() => {
  return props.tournament.is_registration_open && !props.myRegistration
})

const isTeamTournament = computed(() => {
  return props.tournament.participant_type === 'team'
})

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
  // Note: backend uses 'registration' not 'registration_open'
  return ['registration'].includes(status)
})

const cardColor = computed(() => {
  if (props.myRegistration?.checked_in) return 'success'
  if (props.myRegistration?.status === 'approved') return 'primary'
  if (props.myRegistration?.status === 'pending') return 'warning'
  if (props.tournament.is_registration_open) return 'success'
  if (isRegistrationComingSoon.value) return 'info'
  return 'grey'
})

const iconColor = computed(() => {
  if (props.myRegistration?.checked_in) return 'success'
  if (props.myRegistration?.status === 'approved') return 'primary'
  if (props.myRegistration?.status === 'pending') return 'warning'
  if (props.tournament.is_registration_open) return 'success'
  if (isRegistrationComingSoon.value) return 'info'
  return 'grey'
})

const icon = computed(() => {
  if (props.myRegistration?.checked_in) return 'mdi-check-circle'
  if (props.myRegistration?.status === 'approved' && canCheckIn.value) return 'mdi-checkbox-marked-circle-outline'
  if (props.myRegistration?.status === 'approved') return 'mdi-check'
  if (props.myRegistration?.status === 'pending') return 'mdi-clock-outline'
  if (props.tournament.is_registration_open) return 'mdi-account-plus'
  if (isRegistrationComingSoon.value) return 'mdi-calendar-clock'
  return 'mdi-lock'
})

const title = computed(() => {
  if (props.myRegistration?.checked_in) return "You're All Set!"
  if (props.myRegistration?.status === 'approved' && canCheckIn.value) return 'Check-in Now Open'
  if (props.myRegistration?.status === 'approved') return "You're Registered"
  if (props.myRegistration?.status === 'pending') return 'Registration Pending'
  if (props.tournament.is_registration_open) return 'Join This Tournament'
  if (isRegistrationComingSoon.value) return 'Registration Opens Soon'
  return 'Registration Closed'
})

const subtitle = computed(() => {
  if (props.myRegistration?.checked_in) return 'Good luck in the tournament!'
  if (props.myRegistration?.status === 'approved' && canCheckIn.value) return 'Check in now to confirm your participation'
  if (props.myRegistration?.status === 'approved') return 'Check-in will open before the tournament starts'
  if (props.myRegistration?.status === 'pending') return 'Your registration is awaiting admin approval'
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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}
</script>
