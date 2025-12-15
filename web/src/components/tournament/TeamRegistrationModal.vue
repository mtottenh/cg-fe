<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="600">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-account-group-outline</v-icon>
        Register Team
      </v-card-title>

      <v-divider />

      <v-card-text>
        <!-- Loading State -->
        <div v-if="loadingTeams" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
          <p class="text-grey mt-4">Loading your teams...</p>
        </div>

        <!-- No Eligible Teams -->
        <v-alert
          v-else-if="eligibleTeams.length === 0"
          type="info"
          variant="tonal"
          class="mb-0"
        >
          <template v-slot:title>No Eligible Teams</template>
          <p class="mb-2">
            You don't have any teams eligible to register for this tournament.
          </p>
          <ul class="text-body-2 pl-4 mb-0">
            <li v-if="tournament.league_id">
              Teams must be part of <strong>{{ tournament.league_name || 'the linked league' }}</strong>
            </li>
            <li>You must be a <strong>captain</strong> or <strong>manager</strong> of the team</li>
            <li>The team must not already be registered</li>
          </ul>
        </v-alert>

        <!-- Team Selection -->
        <template v-else>
          <p class="text-body-2 text-grey mb-4">
            Select a team to register for <strong>{{ tournament.name }}</strong>
          </p>

          <!-- Team List -->
          <v-radio-group v-model="selectedTeamSeasonId" class="mb-4">
            <v-card
              v-for="team in eligibleTeams"
              :key="team.team_season_id"
              variant="outlined"
              :class="['mb-2', { 'border-primary': selectedTeamSeasonId === team.team_season_id }]"
              @click="selectTeam(team)"
            >
              <v-card-text class="d-flex align-center pa-3">
                <v-radio :value="team.team_season_id" class="mr-0" />
                <v-avatar size="40" rounded="sm" class="mx-3">
                  <v-img v-if="team.team_logo_url" :src="team.team_logo_url" />
                  <v-icon v-else>mdi-shield</v-icon>
                </v-avatar>
                <div class="flex-grow-1">
                  <div class="font-weight-medium">{{ team.team_name }}</div>
                  <div class="text-caption text-grey">
                    [{{ team.team_tag }}] &bull; {{ team.league_name }}
                    <span v-if="team.season_name"> &bull; {{ team.season_name }}</span>
                  </div>
                </div>
                <v-chip size="small" :color="team.role === 'captain' ? 'primary' : 'secondary'" variant="tonal">
                  {{ team.role }}
                </v-chip>
              </v-card-text>
            </v-card>
          </v-radio-group>

          <!-- Participant Name Override -->
          <v-text-field
            v-model="participantName"
            label="Display Name"
            hint="Name shown in the bracket (defaults to team name)"
            persistent-hint
            variant="outlined"
            density="comfortable"
            :rules="[rules.required, rules.maxLength]"
          />
        </template>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          :disabled="!canRegister"
          @click="handleRegister"
        >
          Register Team
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useLeagueTeamsStore, type PlayerLeagueTeamMembershipResponse } from '@/stores/leagueTeams'
import type { TournamentResponse, TournamentRegistrationResponse } from '@/stores/tournaments'

const props = defineProps<{
  modelValue: boolean
  tournament: TournamentResponse
  registrations: TournamentRegistrationResponse[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  register: [teamSeasonId: string, participantName: string, participantLogoUrl?: string]
}>()

const leagueTeamsStore = useLeagueTeamsStore()

// State
const loadingTeams = ref(false)
const loading = ref(false)
const selectedTeamSeasonId = ref<string | null>(null)
const participantName = ref('')

// Validation rules
const rules = {
  required: (v: string) => !!v?.trim() || 'Required',
  maxLength: (v: string) => !v || v.length <= 100 || 'Max 100 characters',
}

// Get already registered team season IDs
const registeredTeamSeasonIds = computed(() => {
  return props.registrations
    .filter((r) => r.team_season_id && r.status !== 'withdrawn')
    .map((r) => r.team_season_id!)
})

// Filter eligible teams
const eligibleTeams = computed(() => {
  return leagueTeamsStore.myTeams.filter((team) => {
    // Must be captain or manager to register team
    if (!['captain', 'manager'].includes(team.role)) {
      return false
    }

    // Must not already be registered
    if (registeredTeamSeasonIds.value.includes(team.team_season_id)) {
      return false
    }

    // If tournament is linked to a league, team must be in that league
    if (props.tournament.league_id && team.league_id !== props.tournament.league_id) {
      return false
    }

    // If tournament is linked to a season, team must be in that season
    if (props.tournament.season_id && team.season_id !== props.tournament.season_id) {
      return false
    }

    // Team must be in active status
    if (team.status !== 'active') {
      return false
    }

    return true
  })
})

// Selected team details
const selectedTeam = computed(() => {
  if (!selectedTeamSeasonId.value) return null
  return eligibleTeams.value.find((t) => t.team_season_id === selectedTeamSeasonId.value) || null
})

const canRegister = computed(() => {
  return selectedTeamSeasonId.value && participantName.value.trim().length > 0
})

// Methods
function selectTeam(team: PlayerLeagueTeamMembershipResponse) {
  selectedTeamSeasonId.value = team.team_season_id
  participantName.value = team.team_name
}

function close() {
  emit('update:modelValue', false)
}

async function handleRegister() {
  if (!selectedTeamSeasonId.value || !selectedTeam.value) return

  loading.value = true
  try {
    emit('register', selectedTeamSeasonId.value, participantName.value.trim(), selectedTeam.value.team_logo_url ?? undefined)
  } finally {
    loading.value = false
  }
}

async function loadTeams() {
  loadingTeams.value = true
  try {
    await leagueTeamsStore.fetchMyTeams()
  } finally {
    loadingTeams.value = false
  }
}

// Watch for dialog open
watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      // Reset state
      selectedTeamSeasonId.value = null
      participantName.value = ''
      loadTeams()
    }
  }
)

onMounted(() => {
  if (props.modelValue) {
    loadTeams()
  }
})
</script>
