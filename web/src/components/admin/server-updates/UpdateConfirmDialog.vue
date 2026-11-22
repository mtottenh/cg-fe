<template>
  <v-dialog v-model="open" max-width="560">
    <v-card v-if="plan" data-testid="update-confirm">
      <v-card-title>{{ plan.title }}?</v-card-title>
      <v-card-text>
        <v-progress-linear
          v-if="refreshing"
          indeterminate
          class="mb-3"
          data-testid="update-confirm-refreshing"
        />
        <div class="text-subtitle-2 mb-1">What changes</div>
        <v-table density="compact" class="mb-3" data-testid="update-confirm-changes">
          <tbody>
            <tr v-for="c in plan.changes" :key="c.label">
              <td>{{ c.label }}</td>
              <td>
                <code>{{ c.installed ?? 'unknown' }}</code>
                →
                <code>{{ c.latest ?? 'unknown' }}</code>
              </td>
              <td class="text-right">
                <v-chip v-if="c.available === true" size="x-small" color="info" variant="tonal">
                  Update available
                </v-chip>
                <span v-else-if="c.available === false" class="text-caption text-medium-emphasis">
                  Up to date
                </span>
                <span v-else class="text-caption text-medium-emphasis">Not compared</span>
              </td>
            </tr>
          </tbody>
        </v-table>

        <p class="text-body-2 mb-2" data-testid="update-confirm-restart">
          <template v-if="plan.restarts">
            <v-icon size="small" color="warning">mdi-restart-alert</v-icon>
            CS2 restarts if anything changes. The server is out of match allocation until the job ends.
          </template>
          <template v-else>
            <v-icon size="small" color="success">mdi-check</v-icon>
            CS2 keeps running.
          </template>
        </p>

        <p class="text-body-2 mb-2" data-testid="update-confirm-players">
          <template v-if="plan.humansConnected === null">Who is connected is unknown.</template>
          <template v-else-if="plan.humansConnected === 0">Nobody is connected.</template>
          <template v-else>
            {{ plan.humansConnected }} connected<template v-if="plan.players.length">:
              {{ plan.players.join(', ') }}</template>.
          </template>
        </p>
        <p v-if="plan.reservation" class="text-body-2 mb-2" data-testid="update-confirm-reservation">
          {{ plan.reservation.kind === 'pug' ? 'PUG' : 'Match' }}
          <code>{{ plan.reservation.match_id.slice(0, 8) }}…</code>
          · {{ getStatusLabel(reservationStatusMap, plan.reservation.status) }}
        </p>
        <ul v-if="plan.bookings.length" class="text-body-2 mb-2 pl-5" data-testid="update-confirm-bookings">
          <li v-for="b in plan.bookings" :key="b.id">
            {{ bookingLabel(b) }}
          </li>
        </ul>

        <v-alert
          v-if="plan.needsForce"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-2"
          data-testid="update-confirm-reasons"
        >
          <div class="mb-1">Restarting now would interrupt:</div>
          <ul class="pl-5">
            <li v-for="r in plan.reasons" :key="r">{{ r }}</li>
          </ul>
          <v-checkbox
            v-model="interrupt"
            density="compact"
            hide-details
            color="warning"
            label="Interrupt anyway"
            aria-label="Interrupt anyway"
            data-testid="update-confirm-force"
          />
        </v-alert>

        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          data-testid="update-confirm-error"
        >
          {{ error }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          :disabled="refreshing || blocked || (plan.needsForce && !interrupt)"
          data-testid="update-confirm-start"
          @click="$emit('confirm', plan.needsForce && interrupt)"
        >
          Start
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatDateTime } from '@/utils/formatters'
import type { UpdatePlan } from '@/utils/gameServerUpdates'
import { getStatusLabel, reservationStatusMap } from '@/utils/statusMaps'

const props = defineProps<{
  modelValue: boolean
  plan: UpdatePlan | null
  loading?: boolean
  error?: string | null
  /** The safety picture is being re-read; nothing may start until it is fresh. */
  refreshing?: boolean
  /** It could not be re-read: starting would rest on stale safety. */
  blocked?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** Start; `force` only when the admin ticked "Interrupt anyway". */
  confirm: [force: boolean]
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/** Booking `reason` is free text an admin typed, not an enum. */
function bookingLabel(b: UpdatePlan['bookings'][number]): string {
  const when = `Booking ${formatDateTime(b.starts_at)} – ${formatDateTime(b.ends_at)}`
  return b.reason ? `${when} (${b.reason})` : when
}

const interrupt = ref(false)
// Consent is to THESE reasons: any change (a refresh after opening, or after
// a refused start) clears the tick so a stale consent is never sent.
watch(
  () => [props.modelValue, props.plan?.operation, props.plan?.reasons.join('\n'), props.refreshing],
  () => {
    interrupt.value = false
  },
)
</script>
