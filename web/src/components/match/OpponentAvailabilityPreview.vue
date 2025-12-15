<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-calendar-account</v-icon>
      Opponent Availability
      <v-spacer />
      <v-btn
        icon
        size="small"
        variant="text"
        :loading="loading"
        @click="refresh"
      >
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </v-card-title>
    <v-divider />
    <v-card-text>
      <!-- Loading State -->
      <div v-if="loading && !hasData" class="text-center py-4">
        <v-progress-circular indeterminate size="24" class="mr-2" />
        <span class="text-grey">Loading availability...</span>
      </div>

      <!-- No Availability Set -->
      <v-alert
        v-else-if="!hasData && !loading"
        type="info"
        variant="tonal"
        density="compact"
      >
        <template v-slot:prepend>
          <v-icon>mdi-information</v-icon>
        </template>
        <div>
          <strong>No availability set</strong>
          <div class="text-caption">Your opponent hasn't configured their availability yet.</div>
        </div>
      </v-alert>

      <!-- Mutual Availability Found -->
      <template v-else>
        <!-- Summary -->
        <div v-if="mutualAvailability.length > 0" class="mb-4">
          <v-chip color="success" variant="tonal" size="small" class="mr-2">
            <v-icon start size="small">mdi-check-circle</v-icon>
            {{ totalMutualSlots }} overlapping slot{{ totalMutualSlots > 1 ? 's' : '' }} found
          </v-chip>
          <v-chip v-if="preferredSlotCount > 0" color="warning" variant="tonal" size="small">
            <v-icon start size="small">mdi-star</v-icon>
            {{ preferredSlotCount }} preferred
          </v-chip>
        </div>

        <!-- Day-by-day breakdown -->
        <div class="availability-grid">
          <div
            v-for="day in displayDays"
            :key="day.date"
            :class="['day-column', { 'has-availability': day.slots.length > 0 }]"
          >
            <div class="day-header">
              <div class="day-name">{{ formatDayName(day.date) }}</div>
              <div class="day-date text-caption text-grey">{{ formatDate(day.date) }}</div>
            </div>
            <div class="day-slots">
              <template v-if="day.slots.length > 0">
                <div
                  v-for="(slot, idx) in day.slots"
                  :key="idx"
                  :class="['time-slot', getSlotClass(slot)]"
                >
                  <v-icon v-if="slot.is_preferred_by_both" size="x-small" class="mr-1">mdi-star</v-icon>
                  <v-icon v-else-if="slot.is_preferred_by_opponent" size="x-small" class="mr-1">mdi-star-half-full</v-icon>
                  {{ formatTimeRange(slot.start_time, slot.end_time) }}
                </div>
              </template>
              <div v-else class="text-caption text-grey pa-2">
                No overlap
              </div>
            </div>
          </div>
        </div>

        <!-- Suggested Times (if any) -->
        <div v-if="suggestedTimes.length > 0" class="mt-4">
          <div class="text-subtitle-2 mb-2 d-flex align-center">
            <v-icon start size="small" color="success">mdi-lightbulb</v-icon>
            Suggested Times
          </div>
          <div class="d-flex flex-wrap gap-2">
            <v-chip
              v-for="time in suggestedTimes"
              :key="time"
              color="success"
              variant="outlined"
              size="small"
              class="cursor-pointer"
              @click="$emit('select-time', time)"
            >
              <v-icon start size="small">mdi-clock-outline</v-icon>
              {{ formatDateTime(time) }}
            </v-chip>
          </div>
        </div>

        <!-- No Mutual Availability -->
        <v-alert
          v-if="mutualAvailability.length === 0 && !loading"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          <template v-slot:prepend>
            <v-icon>mdi-alert</v-icon>
          </template>
          <div>
            <strong>No overlapping availability</strong>
            <div class="text-caption">
              Your schedules don't overlap in the next {{ lookAheadDays }} days.
              Consider proposing times anyway and letting your opponent suggest alternatives.
            </div>
          </div>
        </v-alert>
      </template>

      <!-- Link to set own availability -->
      <div class="mt-4 pt-4 border-t">
        <router-link to="/settings/availability" class="text-decoration-none">
          <v-btn variant="text" size="small" color="primary">
            <v-icon start size="small">mdi-cog</v-icon>
            Update Your Availability
          </v-btn>
        </router-link>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useTournamentAvailability, formatTimeRange as formatTimeRangeHelper } from '@/stores/availability'
import type { MutualAvailability, MutualSlot } from '@/stores/availability'

const props = withDefaults(
  defineProps<{
    opponentPlayerId: string
    lookAheadDays?: number
  }>(),
  {
    lookAheadDays: 7,
  }
)

const emit = defineEmits<{
  'select-time': [time: string]
}>()

const { calculateMutualAvailability, getSuggestedTimes } = useTournamentAvailability()

// State
const loading = ref(false)
const mutualAvailability = ref<MutualAvailability[]>([])
const suggestedTimes = ref<string[]>([])

// Computed
const hasData = computed(() => mutualAvailability.value.length > 0)

const totalMutualSlots = computed(() => mutualAvailability.value.reduce((sum, day) => sum + day.slots.length, 0))

const preferredSlotCount = computed(() =>
  mutualAvailability.value.reduce(
    (sum, day) => sum + day.slots.filter((s) => s.is_preferred_by_both).length,
    0
  )
)

const displayDays = computed(() => {
  const days: { date: string; slots: MutualSlot[] }[] = []
  const today = new Date()

  for (let i = 0; i < props.lookAheadDays; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() + i + 1) // Start from tomorrow
    const dateStr = date.toISOString().split('T')[0]

    const dayData = mutualAvailability.value.find((d) => d.date === dateStr)
    days.push({
      date: dateStr,
      slots: dayData?.slots || [],
    })
  }

  return days
})

// Methods
async function fetchData() {
  if (!props.opponentPlayerId) return

  loading.value = true
  try {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() + 1)
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + props.lookAheadDays)

    const [availability, suggestions] = await Promise.all([
      calculateMutualAvailability(
        props.opponentPlayerId,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      ),
      getSuggestedTimes(props.opponentPlayerId, [], 5),
    ])

    mutualAvailability.value = availability
    suggestedTimes.value = suggestions
  } catch {
    // Silently fail - just show empty state
    mutualAvailability.value = []
    suggestedTimes.value = []
  } finally {
    loading.value = false
  }
}

function refresh() {
  fetchData()
}

function formatDayName(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (dateStr === today.toISOString().split('T')[0]) return 'Today'
  if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow'

  return date.toLocaleDateString(undefined, { weekday: 'short' })
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTimeRange(start: string, end: string): string {
  return formatTimeRangeHelper(start, end)
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getSlotClass(slot: MutualSlot): string {
  if (slot.is_preferred_by_both) return 'preferred-both'
  if (slot.is_preferred_by_opponent) return 'preferred-opponent'
  if (slot.is_preferred_by_current_user) return 'preferred-self'
  return 'regular'
}

// Lifecycle
onMounted(() => {
  fetchData()
})

watch(
  () => props.opponentPlayerId,
  () => {
    fetchData()
  }
)
</script>

<style scoped>
.availability-grid {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.day-column {
  min-width: 100px;
  flex: 1;
  border: 1px solid rgba(var(--v-border-color), 0.2);
  border-radius: 8px;
  overflow: hidden;
}

.day-column.has-availability {
  border-color: rgba(var(--v-theme-success), 0.3);
}

.day-header {
  padding: 8px;
  background-color: rgba(var(--v-theme-surface-variant), 0.3);
  text-align: center;
}

.day-name {
  font-weight: 500;
  font-size: 13px;
}

.day-slots {
  padding: 8px;
  min-height: 60px;
}

.time-slot {
  font-size: 11px;
  padding: 4px 6px;
  margin-bottom: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.time-slot.regular {
  background-color: rgba(var(--v-theme-success), 0.1);
  color: rgb(var(--v-theme-success));
}

.time-slot.preferred-both {
  background-color: rgba(var(--v-theme-warning), 0.15);
  color: rgb(var(--v-theme-warning));
  font-weight: 500;
}

.time-slot.preferred-opponent {
  background-color: rgba(var(--v-theme-info), 0.1);
  color: rgb(var(--v-theme-info));
}

.time-slot.preferred-self {
  background-color: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.cursor-pointer {
  cursor: pointer;
}

.border-t {
  border-top: 1px solid rgba(var(--v-border-color), 0.2);
}

@media (max-width: 600px) {
  .day-column {
    min-width: 80px;
  }
}
</style>
