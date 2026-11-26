<template>
  <v-card variant="outlined" class="mb-6" data-testid="completed-dispute-card">
    <v-card-text class="d-flex flex-wrap align-center ga-3">
      <div class="flex-grow-1 text-body-2">
        <template v-if="serverReported">
          This result was reported by the game server.
        </template>
        If it is wrong, your team can dispute it and an organiser will review it.
      </div>
      <v-btn
        color="error"
        variant="tonal"
        prepend-icon="mdi-gavel"
        data-testid="completed-dispute-open"
        @click="open = true"
      >
        Dispute this result
      </v-btn>
    </v-card-text>

    <v-dialog v-model="open" max-width="560" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon start color="error">mdi-gavel</v-icon>
          Dispute this result
        </v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            The result stays as it is until an organiser reviews the dispute.
            They may keep it, correct the score, or order a replay. Both teams
            can follow and reply to the dispute on this page.
          </v-alert>
          <v-select
            v-model="reason"
            :items="REASONS"
            item-title="label"
            item-value="value"
            label="What is wrong?"
            aria-label="What is wrong with the result"
            variant="outlined"
            density="comfortable"
            class="mb-2"
          />
          <v-textarea
            v-model="description"
            label="Explain what happened"
            aria-label="Explain what happened"
            :rules="[descriptionRule]"
            counter
            maxlength="2000"
            rows="4"
            variant="outlined"
          />
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-2" data-testid="completed-dispute-error">
            {{ error }}
          </v-alert>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-btn variant="text" :disabled="submitting" @click="open = false">Cancel</v-btn>
          <v-spacer />
          <v-btn
            color="error"
            variant="flat"
            :loading="submitting"
            :disabled="!canSubmit"
            data-testid="completed-dispute-submit"
            @click="submit"
          >
            Send dispute
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError } from '@/api'
import { useMatchResultsStore } from '@/stores/matchResults'
import type { components } from '@/api/types'

/**
 * Lets a captain or delegate dispute a match that has already been completed.
 *
 * A result the game server reports auto-confirms after a short window, and a
 * team that missed it had no way back short of messaging an organiser. The
 * API accepts a dispute on a completed match at any time; this is its button.
 */

type DisputeReason = components['schemas']['DisputeReason']

const props = defineProps<{
  tournamentId: string
  matchId: string
  /** The viewer's registration in the match; the dispute is raised for it. */
  registrationId: string
  /** The confirmed claim being disputed, if known. */
  claimId?: string | null
  /** Whether the confirmed result came from the game server. */
  serverReported?: boolean
}>()

const emit = defineEmits<{ disputed: [] }>()

const REASONS: Array<{ value: DisputeReason; label: string }> = [
  { value: 'wrong_score', label: 'The score is wrong' },
  { value: 'wrong_winner', label: 'The wrong team won' },
  { value: 'technical_issue', label: 'A technical problem decided it' },
  { value: 'rule_violation', label: 'A rule was broken' },
  { value: 'cheating', label: 'Cheating' },
  { value: 'player_misconduct', label: 'Player misconduct' },
  { value: 'other', label: 'Something else' },
]

/** The API wants at least this much explanation. */
const MIN_DESCRIPTION = 20

const store = useMatchResultsStore()
const open = ref(false)
const reason = ref<DisputeReason>('wrong_score')
const description = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

const descriptionRule = (v: string) =>
  (v ?? '').trim().length >= MIN_DESCRIPTION || `Please write at least ${MIN_DESCRIPTION} characters`

const canSubmit = computed(() => description.value.trim().length >= MIN_DESCRIPTION && !submitting.value)

watch(open, (isOpen) => {
  if (isOpen) {
    reason.value = 'wrong_score'
    description.value = ''
    error.value = null
  }
})

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = null
  try {
    await store.raiseDispute(
      props.tournamentId,
      props.matchId,
      props.registrationId,
      reason.value,
      description.value.trim(),
      [],
      props.claimId ?? undefined,
    )
    open.value = false
    emit('disputed')
  } catch (e: unknown) {
    error.value = e instanceof ApiError && e.detail ? e.detail : 'The dispute could not be sent'
  } finally {
    submitting.value = false
  }
}
</script>
