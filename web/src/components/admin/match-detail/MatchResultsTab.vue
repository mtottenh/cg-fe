<template>
  <div>
    <!-- Recorded (official) result + the correction control.

         P-72: this tab used to be 119 lines of pure presentation with zero
         handlers, and there was no admin result route at all. The only
         score-writing admin path was `POST /v1/admin/disputes/{id}/resolve/adjusted`,
         which needs a dispute to exist — so a score both parties confirmed
         wrong, or that auto-confirmed after 24h with nobody disputing, could
         not be corrected by any operator while the bracket kept progressing
         on it. This is where an admin looks for it. -->
    <div v-if="match" class="mb-4">
      <div class="text-subtitle-1 mb-2">Recorded Match Result</div>
      <v-card variant="outlined">
        <v-card-text>
          <div class="d-flex align-center justify-center ga-6 pa-2">
            <div class="text-center">
              <div class="text-body-2">{{ match.participant1_name || 'TBD' }}</div>
              <div class="text-h5 font-weight-bold" data-testid="recorded-p1-score">
                {{ match.participant1_score ?? '-' }}
              </div>
            </div>
            <div class="text-medium-emphasis">vs</div>
            <div class="text-center">
              <div class="text-body-2">{{ match.participant2_name || 'TBD' }}</div>
              <div class="text-h5 font-weight-bold" data-testid="recorded-p2-score">
                {{ match.participant2_score ?? '-' }}
              </div>
            </div>
          </div>
          <div v-if="match.winner_registration_id" class="text-center text-body-2">
            Winner: <strong data-testid="recorded-winner">{{ recordedWinnerName }}</strong>
          </div>

          <template v-if="hasRecordedResult">
            <v-divider class="my-4" />
            <div class="text-subtitle-2 mb-1">Correct Recorded Score</div>
            <p class="text-body-2 text-medium-emphasis mb-3">
              Overwrites the official score and winner for this match. Use when a
              wrong result was confirmed (or auto-confirmed) and no dispute was
              raised. The bracket is not re-run — if the winner changes, follow
              up with Reapply Progression in Admin Actions.
            </p>
            <v-row dense>
              <v-col cols="6" md="3">
                <v-text-field
                  v-model.number="overrideP1"
                  :label="`${match.participant1_name || 'P1'} Score`"
                  type="number"
                  min="0"
                  variant="outlined"
                  density="compact"
                />
              </v-col>
              <v-col cols="6" md="3">
                <v-text-field
                  v-model.number="overrideP2"
                  :label="`${match.participant2_name || 'P2'} Score`"
                  type="number"
                  min="0"
                  variant="outlined"
                  density="compact"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-textarea
                  v-model="overrideReason"
                  label="Reason *"
                  variant="outlined"
                  density="compact"
                  rows="1"
                  auto-grow
                />
              </v-col>
            </v-row>
            <v-btn
              color="warning"
              :loading="tournamentsStore.overrideMatchResultState.loading"
              :disabled="!canOverride"
              @click="handleOverride"
            >
              Correct Score
            </v-btn>
            <div v-if="isTie" class="text-caption text-error mt-2">
              Scores must not be equal — a draw has no winner to record.
            </div>
          </template>
        </v-card-text>
      </v-card>
    </div>

    <!-- Score corrections already made. An audit trail nobody can read is
         barely better than none. -->
    <div v-if="tournamentsStore.matchResultOverrides.length > 0" class="mb-4">
      <div class="text-subtitle-1 mb-2">
        Score Corrections ({{ tournamentsStore.matchResultOverrides.length }})
      </div>
      <v-card variant="outlined">
        <v-table density="compact">
          <thead>
            <tr>
              <th>When</th>
              <th>By</th>
              <th>Change</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in tournamentsStore.matchResultOverrides" :key="o.id" data-testid="override-row">
              <td>{{ formatDateTime(o.created_at) }}</td>
              <td>{{ o.changed_by_name ?? 'Unknown admin' }}</td>
              <td>
                {{ o.previous_participant1_score ?? '?' }}&ndash;{{ o.previous_participant2_score ?? '?' }}
                &rarr;
                {{ o.new_participant1_score }}&ndash;{{ o.new_participant2_score }}
              </td>
              <td>{{ o.reason }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </div>

    <!-- The result CLAIM — what a participant asserted, which is not necessarily
         what the match records.

         P-170: after an admin correction these were two sibling cards of equal
         weight, headed "Recorded Match Result" and "Current Result Claim", with
         nothing stating the relationship between them. So the operator saw two
         different scores and no answer to "which one is live?" — on the surface
         they had just used to correct one of them.

         The claim row is deliberately NOT rewritten by an override (the service
         leaves it alone, matching resolve_adjusted). That is right: the claim is
         EVIDENCE that a participant asserted 16-14, and it is the only record of
         it. Overwriting it would erase the history a dispute is judged on, and
         the trail that shows a participant repeatedly claiming wrong scores.
         Keeping bad evidence is the point of evidence.

         So the data is correct and the presentation was not. The claim is now
         marked superseded whenever it disagrees with the recorded score, which
         also fixes the heading: "Current" was actively false once a correction
         had landed. When the two agree — the ordinary path — nothing extra
         renders, because a warning that fires every time is one people learn to
         scroll past. -->
    <div v-if="currentResult" class="mb-4">
      <div class="text-subtitle-1 mb-2">
        {{ claimIsSuperseded ? 'Result Claim (superseded)' : 'Current Result Claim' }}
      </div>
      <v-card variant="outlined">
        <v-card-text>
          <v-alert
            v-if="claimIsSuperseded"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
            data-testid="claim-superseded-notice"
          >
            This claim no longer matches the recorded result. A participant
            claimed
            <strong>{{ currentResult.claimed_participant1_score }} -
              {{ currentResult.claimed_participant2_score }}</strong>;
            the match records
            <strong>{{ match?.participant1_score }} -
              {{ match?.participant2_score }}</strong>, which is the score the
            bracket and standings use. The claim is kept as a record of what was
            submitted.
          </v-alert>
          <v-table density="compact">
            <tbody>
              <tr>
                <td class="text-medium-emphasis" width="180">Status</td>
                <td>
                  <v-chip :color="getResultStatusColor(currentResult.status)" size="small">
                    {{ getResultStatusLabel(currentResult.status) }}
                  </v-chip>
                </td>
              </tr>
              <tr>
                <td class="text-medium-emphasis">Claimed Score</td>
                <td
                  :class="claimIsSuperseded ? 'text-medium-emphasis text-decoration-line-through' : ''"
                  data-testid="claimed-score"
                >
                  {{ currentResult.claimed_participant1_score }} - {{ currentResult.claimed_participant2_score }}
                </td>
              </tr>
              <tr>
                <td class="text-medium-emphasis">Submitted By</td>
                <!-- P-171: this rendered `submitted_by_user_id` as a raw UUID in
                     a <code> block. Same defect class as P-95, P-115 and P-123 —
                     identifying a person to an operator by an id they cannot
                     read — here on the surface an admin uses to judge whether a
                     claim was made in good faith. The submitter's name comes
                     from the same participant data the rest of this tab already
                     has; the id stays as a title so it is still copyable for
                     support. -->
                <td>
                  <span data-testid="claim-submitter" :title="currentResult.submitted_by_user_id ?? undefined">
                    {{ submitterName }}
                  </span>
                </td>
              </tr>
              <tr v-if="currentResult.submitter_notes">
                <td class="text-medium-emphasis">Notes</td>
                <td>{{ currentResult.submitter_notes }}</td>
              </tr>
              <tr v-if="currentResult.auto_confirm_at">
                <td class="text-medium-emphasis">Auto-confirm</td>
                <td>{{ formatDateTime(currentResult.auto_confirm_at) }}</td>
              </tr>
              <tr>
                <td class="text-medium-emphasis">Created</td>
                <td>{{ formatDateTime(currentResult.created_at) }}</td>
              </tr>
            </tbody>
          </v-table>

          <!-- Game Results -->
          <div v-if="currentResult.game_results.length > 0" class="mt-3">
            <div class="text-subtitle-2 mb-1">Game Results</div>
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Map</th>
                  <th>P1 Score</th>
                  <th>P2 Score</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="gr in currentResult.game_results" :key="gr.game_number">
                  <td>{{ gr.game_number }}</td>
                  <td>{{ gr.map_id }}</td>
                  <td>{{ gr.participant1_score }}</td>
                  <td>{{ gr.participant2_score }}</td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <!-- P-172: these chips read `id.slice(0, 8)`. UUID v7 prefixes are
               TIMESTAMPS, so two records created seconds apart — which is what
               attaching several files to one claim produces — share their first
               characters and render as visually identical chips. That is the
               P-115/P-123 defect class again: an identifier truncated to the
               part that varies least.

               Counting is what the operator can actually act on here ("this
               claim has 3 files"), and the full id stays available as a title
               for support. The chips are not links, so nothing is lost by not
               pretending the prefix identifies anything. -->
          <div v-if="currentResult.evidence_ids.length > 0 || currentResult.demo_link_ids.length > 0" class="mt-3">
            <div class="text-subtitle-2 mb-1">Attached Evidence</div>
            <div class="d-flex flex-wrap ga-1">
              <v-chip
                v-for="(eid, i) in currentResult.evidence_ids"
                :key="eid"
                size="small"
                prepend-icon="mdi-file"
                :title="eid"
              >
                File {{ i + 1 }}
              </v-chip>
              <v-chip
                v-for="(did, i) in currentResult.demo_link_ids"
                :key="did"
                size="small"
                prepend-icon="mdi-file-video"
                color="info"
                :title="did"
              >
                Demo {{ i + 1 }}
              </v-chip>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <div v-else-if="!matchResultsStore.fetchCurrentResultState.loading" class="text-center pa-4 text-medium-emphasis">
      No result claim for this match
    </div>

    <!-- Result History -->
    <div v-if="resultHistory.length > 0" class="mt-4">
      <div class="text-subtitle-1 mb-2">Result History ({{ resultHistory.length }})</div>
      <v-timeline density="compact" side="end">
        <v-timeline-item
          v-for="claim in resultHistory"
          :key="claim.id"
          :dot-color="getResultStatusColor(claim.status)"
          size="small"
        >
          <v-card variant="tonal" density="compact">
            <v-card-text class="pa-3">
              <div class="d-flex align-center ga-2 mb-1">
                <v-chip :color="getResultStatusColor(claim.status)" size="x-small">{{ getResultStatusLabel(claim.status) }}</v-chip>
                <span class="text-caption text-medium-emphasis">{{ formatDateTime(claim.created_at) }}</span>
              </div>
              <div class="text-body-2">
                Score: {{ claim.claimed_participant1_score }} - {{ claim.claimed_participant2_score }}
                <span v-if="claim.was_auto_confirmed" class="text-caption text-medium-emphasis ml-2">(auto-confirmed)</span>
              </div>
            </v-card-text>
          </v-card>
        </v-timeline-item>
      </v-timeline>
    </div>

    <ConfirmDialogHost :dialog="confirmDialog" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMatchResultsStore, getResultStatusColor, getResultStatusLabel } from '@/stores/matchResults'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import { formatDateTime } from '@/utils/formatters'

const props = defineProps<{
  match: TournamentMatchResponse | null
  tournamentId: string
}>()

const emit = defineEmits<{
  updated: []
}>()

const matchResultsStore = useMatchResultsStore()
const tournamentsStore = useTournamentsStore()
const feedback = useActionFeedback()
const confirmDialog = useConfirmDialog()
const { currentResult, resultHistory } = storeToRefs(matchResultsStore)

const overrideP1 = ref<number>(0)
const overrideP2 = ref<number>(0)
const overrideReason = ref('')

/** A score can only be *corrected* if one was recorded in the first place. */
const hasRecordedResult = computed(() => !!props.match?.winner_registration_id)

const recordedWinnerName = computed(() => {
  const m = props.match
  if (!m?.winner_registration_id) return ''
  return m.winner_registration_id === m.participant1_registration_id
    ? m.participant1_name || 'Participant 1'
    : m.participant2_name || 'Participant 2'
})

/**
 * P-170 — a CONFIRMED claim that disagrees with the score the match records.
 *
 * An admin override rewrites the match row and deliberately leaves the claim
 * row alone, so this is the normal state after any correction. A dispute
 * resolved with an adjusted score produces the same state, which is why the
 * notice describes the disagreement rather than naming overrides — the
 * operator's question ("which number is live?") is identical either way.
 *
 * `status === 'confirmed'` is load-bearing, and the first draft of this got it
 * wrong. `tournament_matches.participant1_score` is `NOT NULL DEFAULT 0`
 * (migration 0030:340), so an unplayed match records 0-0 rather than null — a
 * PENDING claim of 16-14 therefore "disagrees" with the match on the entirely
 * ordinary path where it simply has not been confirmed yet. Flagging that as
 * superseded would put a warning on almost every live match and teach everyone
 * to ignore it. A claim can only be superseded if it was applied in the first
 * place.
 *
 * `hasRecordedResult` guards the same way from the other side: because the score
 * columns default to 0, `winner_registration_id` is the only honest signal that
 * a result exists at all.
 */
const claimIsSuperseded = computed(() => {
  const claim = currentResult.value
  const m = props.match
  if (!claim || !m || !hasRecordedResult.value) return false
  if (claim.status !== 'confirmed') return false
  return (
    claim.claimed_participant1_score !== m.participant1_score ||
    claim.claimed_participant2_score !== m.participant2_score
  )
})

/**
 * P-171 — the tab rendered `submitted_by_user_id` as a raw UUID.
 *
 * `submitted_by_display_name` was already on `ResultClaimResponse` and simply
 * unused, so this needed no API change — the name was sitting beside the id the
 * whole time. Falls back to the id only when the join genuinely produced
 * nothing, which is strictly better than always showing the id.
 */
const submitterName = computed(
  () => currentResult.value?.submitted_by_display_name || currentResult.value?.submitted_by_user_id || 'Unknown',
)

const isTie = computed(() => overrideP1.value === overrideP2.value)

const canOverride = computed(
  () =>
    hasRecordedResult.value &&
    !isTie.value &&
    Number.isFinite(overrideP1.value) &&
    Number.isFinite(overrideP2.value) &&
    overrideP1.value >= 0 &&
    overrideP2.value >= 0 &&
    overrideReason.value.trim().length >= 5,
)

// Seed the form with the currently recorded score, and load the correction
// history, whenever the host modal switches match.
watch(
  () => props.match?.id,
  async (id) => {
    overrideP1.value = props.match?.participant1_score ?? 0
    overrideP2.value = props.match?.participant2_score ?? 0
    overrideReason.value = ''
    tournamentsStore.matchResultOverrides = []
    if (id) {
      await tournamentsStore
        .fetchMatchResultOverrides(props.tournamentId, id)
        .catch(() => [])
    }
  },
  { immediate: true },
)

function handleOverride() {
  const match = props.match
  if (!match || !canOverride.value) return
  const p1 = overrideP1.value
  const p2 = overrideP2.value
  const reason = overrideReason.value.trim()
  const winner = p1 > p2 ? match.participant1_name || 'Participant 1' : match.participant2_name || 'Participant 2'
  confirmDialog.confirm({
    title: 'Correct Recorded Score',
    message:
      `Overwrite the official result with ${p1}-${p2}, making ${winner} the winner? ` +
      'This is recorded in the audit trail against your account.',
    action: 'Correct Score',
    color: 'warning',
    handler: async () => {
      await feedback.run(
        async () => {
          await tournamentsStore.adminOverrideMatchResult(
            props.tournamentId,
            match.id,
            p1,
            p2,
            reason,
          )
          await tournamentsStore.fetchMatchResultOverrides(props.tournamentId, match.id)
        },
        {
          success: 'Score corrected',
          errorSource: tournamentsStore.overrideMatchResultState,
          after: () => {
            overrideReason.value = ''
            emit('updated')
          },
          rethrow: true,
        },
      )
    },
  })
}
</script>
