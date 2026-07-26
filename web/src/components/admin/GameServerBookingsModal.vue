<template>
  <v-dialog v-model="open" max-width="640" persistent>
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Bookings: {{ server?.name }}</span>
        <v-btn aria-label="Close" icon variant="text" @click="open = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <p class="text-body-2 mb-4">
          A booking holds this server for an event window (§6.7): leave the tournament
          empty for a hard hold (maintenance, community night) that blocks all
          allocation; set one to reserve capacity for that event's matches.
        </p>

        <div
          v-for="booking in store.bookings"
          :key="booking.id"
          class="d-flex align-center ga-2 mb-2"
          data-testid="booking-row"
        >
          <v-chip size="x-small" :color="booking.tournament_id ? 'info' : 'warning'" variant="tonal">
            {{ booking.tournament_id ? 'Event hold' : 'Hard hold' }}
          </v-chip>
          <span class="text-caption">
            {{ formatWindow(booking) }}
            {{ booking.reason ? `— ${booking.reason}` : '' }}
          </span>
          <v-spacer />
          <v-btn
            aria-label="Delete booking"
            title="Delete booking"
            icon
            size="x-small"
            variant="text"
            color="error"
            @click="removeBooking(booking.id)"
          >
            <v-icon size="small">mdi-delete</v-icon>
          </v-btn>
        </div>
        <p v-if="store.bookings.length === 0" class="text-caption text-grey mb-4">
          No current or upcoming bookings.
        </p>

        <v-divider class="my-4" />

        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="startsAt"
              aria-label="Starts at"
              label="Starts at"
              type="datetime-local"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="endsAt"
              aria-label="Ends at"
              label="Ends at"
              type="datetime-local"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="tournamentId"
              aria-label="Tournament ID (optional)"
              label="Tournament ID (optional)"
              hint="Empty = hard hold"
              persistent-hint
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="reason"
              aria-label="Reason"
              label="Reason"
              variant="outlined"
              density="compact"
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Close</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="store.createBookingState.loading"
          :disabled="!startsAt || !endsAt"
          @click="addBooking"
        >
          Add Booking
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ApiError } from '@/api'
import { useGameServersStore } from '@/stores/gameServers'
import type { GameServer, ServerBooking } from '@/stores/gameServers'

const props = defineProps<{
  server: GameServer | null
}>()

const open = defineModel<boolean>({ required: true })

const store = useGameServersStore()
const startsAt = ref('')
const endsAt = ref('')
const tournamentId = ref('')
const reason = ref('')
const error = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen || !props.server) return
  error.value = null
  startsAt.value = ''
  endsAt.value = ''
  tournamentId.value = ''
  reason.value = ''
  void store.fetchBookings(props.server.id)
})

function formatWindow(booking: ServerBooking): string {
  const from = new Date(booking.starts_at).toLocaleString()
  const to = new Date(booking.ends_at).toLocaleString()
  return `${from} → ${to}`
}

async function addBooking() {
  if (!props.server) return
  error.value = null
  try {
    await store.createBooking(props.server.id, {
      tournament_id: tournamentId.value.trim() || null,
      reason: reason.value.trim() || null,
      starts_at: new Date(startsAt.value).toISOString(),
      ends_at: new Date(endsAt.value).toISOString(),
    })
    startsAt.value = ''
    endsAt.value = ''
    reason.value = ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.detail : 'Failed to create booking'
  }
}

async function removeBooking(bookingId: string) {
  if (!props.server) return
  error.value = null
  try {
    await store.deleteBooking(props.server.id, bookingId)
  } catch (e) {
    error.value = e instanceof ApiError ? e.detail : 'Failed to delete booking'
  }
}
</script>
