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
            class="py-2"
          >
            <div class="d-flex justify-space-between align-center">
              <v-chip size="small" :color="getGameWinnerColor(game)">
                Map {{ game.game_number }}
              </v-chip>
              <span class="text-body-2">
                {{ game.participant1_score }} - {{ game.participant2_score }}
              </span>
            </div>
            <!-- Linked demo details -->
            <div
              v-if="gameDemoMap.get(game.game_number)"
              class="d-flex align-center ga-2 mt-1 ml-8"
            >
              <v-icon size="x-small" color="info">mdi-file-video</v-icon>
              <span
                v-if="gameDemoMap.get(game.game_number)!.demo.metadata"
                class="text-caption text-grey"
              >
                {{ gameDemoMap.get(game.game_number)!.demo.metadata!.map_name }} &mdash;
                {{ gameDemoMap.get(game.game_number)!.demo.metadata!.team1_name }}
                {{ gameDemoMap.get(game.game_number)!.demo.metadata!.team1_score }}
                : {{ gameDemoMap.get(game.game_number)!.demo.metadata!.team2_score }}
                {{ gameDemoMap.get(game.game_number)!.demo.metadata!.team2_name }}
              </span>
              <span v-else class="text-caption text-grey">
                {{ gameDemoMap.get(game.game_number)!.demo.file_name }}
              </span>
              <v-chip
                v-if="gameDemoMap.get(game.game_number)!.link.validated"
                size="x-small"
                color="success"
                variant="tonal"
              >
                <v-icon start size="x-small">mdi-check</v-icon>
                Validated
              </v-chip>
            </div>
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
      <div v-if="claim.evidence_ids.length > 0" class="mb-4">
        <p class="text-subtitle-2 mb-2">
          <v-icon start size="small">mdi-paperclip</v-icon>
          Additional evidence attached ({{ claim.evidence_ids.length }})
        </p>
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
      :tournament-id="tournamentId"
      :registration-id="registrationId"
      @disputed="$emit('disputed')"
    />
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMatchResultsStore, getTimeUntilAutoConfirm } from '@/stores/matchResults'
import type { ResultClaimResponse } from '@/stores/matchResults'
import { useEvidenceStore, type DemoMatchLinkWithDemoResponse } from '@/stores/evidence'
import ResultDisputeModal from './ResultDisputeModal.vue'

const props = defineProps<{
  matchId: string
  claim: ResultClaimResponse
  teamAName: string
  teamBName: string
  teamARegistrationId: string
  teamBRegistrationId: string
  submitterName?: string
  tournamentId?: string
  registrationId?: string
}>()

const emit = defineEmits<{
  confirmed: []
  disputed: []
}>()

const store = useMatchResultsStore()
const evidenceStore = useEvidenceStore()
const loading = computed(() => store.loading)
const showDisputeModal = ref(false)

// Fetch linked demos so we can show demo details per game
onMounted(async () => {
  if (props.claim.demo_link_ids.length > 0) {
    await evidenceStore.fetchLinkedDemos(props.matchId)
  }
})

const gameDemoMap = computed(() => {
  const map = new Map<number, DemoMatchLinkWithDemoResponse>()
  for (const game of props.claim.game_results ?? []) {
    if (!game.demo_link_id) continue
    const linked = evidenceStore.linkedDemos.find(d => d.link.id === game.demo_link_id)
    if (linked) map.set(game.game_number, linked)
  }
  return map
})

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

const winnerAlertType = computed(() => 'success' as const)

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
