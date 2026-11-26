<template>
  <v-card variant="outlined" :color="cardColor">
    <v-card-text>
      <!-- Header -->
      <div class="d-flex align-center justify-space-between mb-4">
        <div class="d-flex align-center">
          <v-avatar size="32" class="mr-2">
            <v-icon>mdi-account</v-icon>
          </v-avatar>
          <div>
            <div class="text-subtitle-2">
              {{ headerLabel }}
            </div>
            <div class="text-caption text-medium-emphasis">
              Sent {{ formatDateTime(proposal.created_at) }}
            </div>
          </div>
        </div>
        <v-chip :color="statusColor" size="small">
          {{ statusLabel }}
        </v-chip>
      </div>

      <!-- Expiration Warning -->
      <v-alert
        v-if="proposal.status === 'pending' && !isExpired"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        <template v-slot:prepend>
          <v-icon>mdi-clock-alert-outline</v-icon>
        </template>
        Expires in {{ timeUntilExpiration }}
      </v-alert>

      <v-alert
        v-else-if="isExpired"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        <template v-slot:prepend>
          <v-icon>mdi-clock-remove-outline</v-icon>
        </template>
        This proposal has expired
      </v-alert>

      <!-- Proposed Times -->
      <div class="mb-4">
        <div class="text-subtitle-2">Proposed Times</div>
        <div class="text-caption text-medium-emphasis mb-2" data-testid="proposal-timezone">
          Shown in your local time ({{ viewerTimeZone }})
        </div>
        <v-radio-group
          v-if="canRespond && proposal.status === 'pending'"
          v-model="selectedTime"
          hide-details
        >
          <!-- A proposal outlives the times in it (48h): a slot that has
               already passed must not be acceptable, or the match is
               scheduled in the past and check-in opens with minutes to run. -->
          <v-radio
            v-for="time in proposal.proposed_times"
            :key="time"
            :value="time"
            :label="isPast(time) ? `${formatProposedTime(time)} — already passed` : formatProposedTime(time)"
            :disabled="isPast(time)"
            density="compact"
            class="mb-1"
          />
        </v-radio-group>
        <div v-else class="d-flex flex-wrap ga-2">
          <v-chip
            v-for="time in proposal.proposed_times"
            :key="time"
            variant="tonal"
            size="small"
          >
            <v-icon start size="small">mdi-calendar</v-icon>
            {{ formatProposedTime(time) }}
          </v-chip>
        </div>
      </div>

      <!-- Rejection reason (why the opponent declined) -->
      <v-alert
        v-if="proposal.status === 'rejected' && proposal.rejection_reason"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        <strong>Rejected:</strong> {{ proposal.rejection_reason }}
      </v-alert>

      <!-- Notes -->
      <div v-if="proposal.notes" class="mb-4">
        <div class="text-subtitle-2 mb-1">Notes</div>
        <div class="text-body-2 text-medium-emphasis pa-2 bg-surface-variant rounded">
          {{ proposal.notes }}
        </div>
      </div>

      <!-- Actions -->
      <template v-if="proposal.status === 'pending' && !isExpired">
        <!-- Responder Actions -->
        <template v-if="canRespond">
          <v-divider class="mb-4" />
          <v-alert
            v-if="allTimesPast"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
            data-testid="proposal-all-past"
          >
            Every proposed time has already passed. Counter-propose a new time or reject.
          </v-alert>
          <div class="d-flex ga-2 flex-wrap">
            <v-btn
              color="success"
              :loading="loading"
              :disabled="!selectedTime || isPast(selectedTime)"
              data-testid="proposal-accept"
              @click="handleAccept"
            >
              <v-icon start>mdi-check</v-icon>
              Accept
            </v-btn>
            <v-btn
              variant="outlined"
              color="primary"
              :loading="loading"
              @click="$emit('counter')"
            >
              <v-icon start>mdi-calendar-edit</v-icon>
              Counter-Propose
            </v-btn>
            <v-btn
              variant="text"
              color="error"
              :loading="loading"
              @click="openRejectDialog"
            >
              <v-icon start>mdi-close</v-icon>
              Reject
            </v-btn>
          </div>
        </template>

        <!-- Proposer Actions. The proposer has no accept/reject/counter — the
             one thing they can do is withdraw their own pending proposal
             (POST /schedule/cancel), which reopens scheduling immediately
             instead of leaving a mistyped time to block it for the full TTL. -->
        <template v-else>
          <v-divider class="mb-4" />
          <v-alert type="info" variant="tonal" density="compact" class="mb-4" data-testid="proposal-waiting">
            <template v-slot:prepend>
              <v-icon>mdi-clock-outline</v-icon>
            </template>
            <template v-if="isProposer">Waiting for your opponent to respond...</template>
            <!-- A teammate sent it: this viewer can neither answer their own
                 team's proposal nor withdraw one they did not send (the API
                 refuses both), so say so rather than offer the buttons. -->
            <template v-else>
              Your team sent this proposal — waiting for your opponent to respond.
              Only the teammate who sent it can withdraw it.
            </template>
          </v-alert>
          <!-- Nothing tells the other team a proposal (or counter-proposal)
               exists: they only find it on their own dashboard or match page.
               Until the site sends notifications, the proposer has to. -->
          <v-alert
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
            data-testid="proposal-not-notified"
          >
            <template v-slot:prepend>
              <v-icon>mdi-bell-off-outline</v-icon>
            </template>
            Tell the other captain you've proposed a time — the site doesn't send notifications yet.
          </v-alert>
          <div v-if="isProposer" class="d-flex ga-2 flex-wrap">
            <v-btn
              variant="outlined"
              color="error"
              :loading="loading"
              @click="openWithdrawDialog"
            >
              <v-icon start>mdi-undo</v-icon>
              Withdraw Proposal
            </v-btn>
          </div>
        </template>
      </template>

      <!-- Accepted Time Display -->
      <template v-if="proposal.status === 'accepted' && proposal.selected_time">
        <v-divider class="mb-4" />
        <v-alert type="success" variant="tonal">
          <template v-slot:prepend>
            <v-icon>mdi-calendar-check</v-icon>
          </template>
          <div>
            <strong>Scheduled for:</strong>
            <div class="mt-1">{{ formatProposedTime(proposal.selected_time) }}</div>
          </div>
        </v-alert>
      </template>
    </v-card-text>

    <!-- Reject Dialog: collects an optional reason so the opponent gets
         context instead of a bare rejection restarting the negotiation. -->
    <v-dialog v-model="rejectDialogOpen" max-width="480">
      <v-card>
        <v-card-title>Reject Proposal</v-card-title>
        <v-card-text>
          <p class="mb-3">Are you sure you want to reject this proposal?</p>
          <v-textarea
            v-model="rejectReason"
            label="Reason (optional)"
            placeholder="e.g. None of these times work for us — weekday evenings are better"
            rows="2"
            variant="outlined"
            density="comfortable"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="rejectDialogOpen = false">Cancel</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="loading"
            @click="confirmReject"
          >
            Reject
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Withdraw Dialog: withdrawing is destructive (the opponent loses the
         times they were about to answer), so it is confirmed rather than
         one-click. -->
    <v-dialog v-model="withdrawDialogOpen" max-width="480">
      <v-card>
        <v-card-title>Withdraw Proposal</v-card-title>
        <v-card-text>
          <p class="mb-0">
            Withdraw these proposed times? Your opponent will no longer be able to
            respond to them, and you can propose a new time straight away.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="withdrawDialogOpen = false">Keep Proposal</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="loading"
            @click="confirmWithdraw"
          >
            Withdraw
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { ScheduleProposalResponse } from '@/stores/matchScheduling'
import { formatDateTime } from '@/utils/formatters'
import {
  getProposalStatusColor,
  getProposalStatusLabel,
  formatProposedTime,
  isProposalExpired,
  getTimeUntilExpiration,
} from '@/stores/matchScheduling'

const props = defineProps<{
  proposal: ScheduleProposalResponse
  isProposer: boolean
  /**
   * The proposal came from the viewer's own team (possibly a teammate, not
   * the viewer). Their team cannot respond to it — the API answers 403.
   */
  isOwnTeam?: boolean
  loading?: boolean
  /** Who sent it, for the header. */
  fromName?: string | null
}>()

const emit = defineEmits<{
  accept: [time: string]
  reject: [reason?: string]
  counter: []
  withdraw: []
}>()

/** Only the OTHER team may accept, counter or reject. */
const canRespond = computed(() => !props.isProposer && !props.isOwnTeam)

const headerLabel = computed(() => {
  if (props.isProposer) return 'Your proposal'
  if (props.isOwnTeam) return "Your team's proposal"
  return `Proposal from ${props.fromName || 'your opponent'}`
})

const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'

// Re-evaluated on a slow tick so a slot that passes while the card is open
// stops being selectable without a reload.
const now = ref(Date.now())
const nowTimer = setInterval(() => { now.value = Date.now() }, 30_000)
onUnmounted(() => clearInterval(nowTimer))

function isPast(time: string): boolean {
  const ms = new Date(time).getTime()
  return !Number.isFinite(ms) || ms <= now.value
}

const allTimesPast = computed(() => props.proposal.proposed_times.every(isPast))

const selectedTime = ref<string | null>(null)
// One offered time needs no choosing — Accept used to sit disabled, with no
// hint that the lone radio had to be ticked first. Never a time that has
// already passed, though: that made accepting a stale slot a single click.
watch(
  [() => props.proposal.proposed_times, now],
  ([times]) => {
    const open = times.filter((t) => !isPast(t))
    if (selectedTime.value && !open.includes(selectedTime.value)) selectedTime.value = null
    if (!selectedTime.value && times.length === 1 && open.length === 1) {
      selectedTime.value = open[0] ?? null
    }
  },
  { immediate: true },
)
const rejectDialogOpen = ref(false)
const rejectReason = ref('')
const withdrawDialogOpen = ref(false)

const isExpired = computed(() => isProposalExpired(props.proposal))
const timeUntilExpiration = computed(() => getTimeUntilExpiration(props.proposal))
const statusColor = computed(() => getProposalStatusColor(props.proposal.status))
const statusLabel = computed(() => getProposalStatusLabel(props.proposal.status))

const cardColor = computed(() => {
  if (props.proposal.status === 'accepted') return 'success'
  if (props.proposal.status === 'rejected') return 'error'
  if (props.proposal.status === 'cancelled') return 'grey'
  if (isExpired.value) return 'grey'
  return 'warning'
})

function handleAccept() {
  now.value = Date.now()
  if (selectedTime.value && !isPast(selectedTime.value)) {
    emit('accept', selectedTime.value)
  }
}

function openRejectDialog() {
  rejectReason.value = ''
  rejectDialogOpen.value = true
}

function confirmReject() {
  emit('reject', rejectReason.value.trim() || undefined)
  rejectDialogOpen.value = false
}

function openWithdrawDialog() {
  withdrawDialogOpen.value = true
}

function confirmWithdraw() {
  emit('withdraw')
  withdrawDialogOpen.value = false
}
</script>
