<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon start color="warning">mdi-alert-circle</v-icon>
      Opponent Submitted Result
    </v-card-title>

    <v-card-text>
      <p class="mb-4">
        <strong>{{ submitterName }}</strong> has submitted the following result. Please review and
        confirm if it's correct.
      </p>

      <!-- Display claimed scores -->
      <v-card variant="outlined" class="pa-4 mb-4">
        <div class="text-center">
          <div class="d-flex justify-center align-center gap-4 mb-2">
            <div class="text-center">
              <div class="text-h5 font-weight-bold" :class="team1WinsClass">
                {{ teamAName }}
              </div>
              <div class="text-h3 font-weight-bold mt-1">
                {{ claim.claimed_participant1_score }}
              </div>
            </div>
            <div class="text-h4 text-grey">-</div>
            <div class="text-center">
              <div class="text-h5 font-weight-bold" :class="team2WinsClass">
                {{ teamBName }}
              </div>
              <div class="text-h3 font-weight-bold mt-1">
                {{ claim.claimed_participant2_score }}
              </div>
            </div>
          </div>
        </div>

        <!-- Game-by-game results -->
        <div v-if="claim.game_results && claim.game_results.length > 0" class="mt-4">
          <v-divider class="mb-3" />
          <div
            v-for="game in claim.game_results"
            :key="game.game_number"
            class="d-flex justify-space-between align-center py-1"
          >
            <v-chip size="small" :color="getGameWinnerColor(game)">
              Map {{ game.game_number }}
            </v-chip>
            <span class="text-body-2">
              {{ game.participant1_score }} - {{ game.participant2_score }}
            </span>
          </div>
        </div>
      </v-card>

      <!-- Winner display -->
      <v-alert :type="winnerAlertType" variant="tonal" class="mb-4">
        <strong>Claimed Winner:</strong> {{ winnerName }}
      </v-alert>

      <!-- Auto-confirm countdown -->
      <v-alert v-if="autoConfirmCountdown" type="info" variant="tonal" class="mb-4">
        <v-icon start size="small">mdi-clock-outline</v-icon>
        This result will be auto-confirmed in <strong>{{ autoConfirmCountdown }}</strong> if not
        disputed.
      </v-alert>

      <!-- Show attached evidence if any -->
      <div v-if="hasEvidence" class="mb-4">
        <p class="text-subtitle-2 mb-2">
          <v-icon start size="small">mdi-paperclip</v-icon>
          Evidence attached ({{ claim.evidence_ids.length + claim.demo_link_ids.length }})
        </p>
        <p class="text-caption text-grey">View the Evidence tab for details.</p>
      </div>

      <!-- Notes if any -->
      <div v-if="claim.submitter_notes" class="mb-4">
        <p class="text-subtitle-2 mb-1">Notes from submitter:</p>
        <p class="text-body-2 text-grey">{{ claim.submitter_notes }}</p>
      </div>

      <v-divider class="my-4" />

      <p class="text-body-2 text-grey">
        Do you confirm this result? If you believe it's incorrect, you can dispute it with evidence.
      </p>
    </v-card-text>

    <v-card-actions>
      <v-btn color="error" variant="outlined" :disabled="loading" @click="showDisputeModal = true">
        <v-icon start>mdi-close</v-icon>
        Dispute
      </v-btn>
      <v-spacer />
      <v-btn color="success" variant="flat" :loading="loading" @click="handleConfirm">
        <v-icon start>mdi-check</v-icon>
        Confirm Result
      </v-btn>
    </v-card-actions>

    <!-- Dispute modal -->
    <ResultDisputeModal
      v-model="showDisputeModal"
      :match-id="matchId"
      :claim-id="claim.id"
      @disputed="$emit('disputed')"
    />
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMatchResultsStore, getTimeUntilAutoConfirm } from '@/stores/matchResults'
import type { ResultClaimResponse } from '@/stores/matchResults'
import ResultDisputeModal from './ResultDisputeModal.vue'

const props = defineProps<{
  matchId: string
  claim: ResultClaimResponse
  teamAName: string
  teamBName: string
  teamARegistrationId: string
  teamBRegistrationId: string
  submitterName?: string
}>()

const emit = defineEmits<{
  confirmed: []
  disputed: []
}>()

const store = useMatchResultsStore()
const loading = computed(() => store.loading)
const showDisputeModal = ref(false)

// Computed
const team1Wins = computed(
  () => props.claim.claimed_participant1_score > props.claim.claimed_participant2_score
)
const team2Wins = computed(
  () => props.claim.claimed_participant2_score > props.claim.claimed_participant1_score
)

const team1WinsClass = computed(() => (team1Wins.value ? 'text-success' : ''))
const team2WinsClass = computed(() => (team2Wins.value ? 'text-success' : ''))

const winnerName = computed(() => {
  if (props.claim.claimed_winner_registration_id === props.teamARegistrationId) {
    return props.teamAName
  }
  return props.teamBName
})

const winnerAlertType = computed(() => 'success')

const hasEvidence = computed(() => {
  return props.claim.evidence_ids.length > 0 || props.claim.demo_link_ids.length > 0
})

const autoConfirmCountdown = computed(() => {
  return getTimeUntilAutoConfirm(props.claim.auto_confirm_at)
})

function getGameWinnerColor(game: { participant1_score: number; participant2_score: number }) {
  if (game.participant1_score > game.participant2_score) return 'success'
  if (game.participant2_score > game.participant1_score) return 'error'
  return 'grey'
}

async function handleConfirm() {
  try {
    await store.confirmResult(props.matchId, props.claim.id)
    emit('confirmed')
  } catch {
    // Error handled by store
  }
}
</script>
