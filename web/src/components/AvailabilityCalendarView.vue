<template>
  <v-card>
    <v-card-title class="d-flex justify-space-between align-center">
      <span>Availability Calendar</span>
      <div class="d-flex align-center ga-2">
        <v-btn aria-label="Previous period" icon variant="text" size="small" @click="previousPeriod">
          <v-icon>mdi-chevron-left</v-icon>
        </v-btn>
        <span class="text-body-1">{{ periodRangeLabel }}</span>
        <v-btn aria-label="Next period" icon variant="text" size="small" @click="nextPeriod">
          <v-icon>mdi-chevron-right</v-icon>
        </v-btn>
        <v-btn variant="text" size="small" @click="goToToday">Today</v-btn>
      </div>
    </v-card-title>

    <v-card-text>
      <div v-if="loading" class="d-flex justify-center py-8">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <div v-else>
        <!-- Week 1 -->
        <div class="calendar-grid mb-4">
          <div class="calendar-header">
            <div
              v-for="(day, index) in week1Days"
              :key="index"
              class="calendar-header-cell text-center"
            >
              <div class="text-caption text-medium-emphasis">{{ day.dayName }}</div>
              <div
                class="text-body-1"
                :class="{ 'text-primary font-weight-bold': day.isToday }"
              >
                {{ day.date }}
              </div>
            </div>
          </div>

          <div class="calendar-body">
            <div
              v-for="(day, dayIndex) in week1Days"
              :key="dayIndex"
              class="calendar-day-column"
              :class="{ 'today-column': day.isToday }"
            >
              <template v-if="dayAvailability[day.dateStr]">
                <div
                  v-if="dayAvailability[day.dateStr]!.is_blocked"
                  class="blocked-day d-flex align-center justify-center"
                >
                  <v-chip color="error" size="x-small">Blocked</v-chip>
                </div>
                <template v-else>
                  <div
                    v-for="(slot, slotIndex) in dayAvailability[day.dateStr]!.available_slots"
                    :key="slotIndex"
                    class="time-slot"
                    :class="{ 'preferred-slot': slot.is_preferred }"
                  >
                    <v-icon size="x-small" class="mr-1" :color="slot.is_preferred ? 'primary' : 'grey'">
                      {{ slot.is_preferred ? 'mdi-star' : 'mdi-clock-outline' }}
                    </v-icon>
                    <span class="text-caption">
                      {{ formatTime(slot.start) }} - {{ formatTime(slot.end) }}
                    </span>
                  </div>
                  <div
                    v-if="!dayAvailability[day.dateStr]!.available_slots?.length"
                    class="no-availability text-center text-medium-emphasis"
                  >
                    <v-icon size="x-small">mdi-calendar-blank-outline</v-icon>
                  </div>
                </template>
              </template>
              <div v-else class="no-availability text-center text-medium-emphasis">
                <v-icon size="x-small">mdi-calendar-blank-outline</v-icon>
              </div>
            </div>
          </div>
        </div>

        <!-- Week 2 -->
        <div class="calendar-grid">
          <div class="calendar-header">
            <div
              v-for="(day, index) in week2Days"
              :key="index"
              class="calendar-header-cell text-center"
            >
              <div class="text-caption text-medium-emphasis">{{ day.dayName }}</div>
              <div
                class="text-body-1"
                :class="{ 'text-primary font-weight-bold': day.isToday }"
              >
                {{ day.date }}
              </div>
            </div>
          </div>

          <div class="calendar-body">
            <div
              v-for="(day, dayIndex) in week2Days"
              :key="dayIndex"
              class="calendar-day-column"
              :class="{ 'today-column': day.isToday }"
            >
              <template v-if="dayAvailability[day.dateStr]">
                <div
                  v-if="dayAvailability[day.dateStr]!.is_blocked"
                  class="blocked-day d-flex align-center justify-center"
                >
                  <v-chip color="error" size="x-small">Blocked</v-chip>
                </div>
                <template v-else>
                  <div
                    v-for="(slot, slotIndex) in dayAvailability[day.dateStr]!.available_slots"
                    :key="slotIndex"
                    class="time-slot"
                    :class="{ 'preferred-slot': slot.is_preferred }"
                  >
                    <v-icon size="x-small" class="mr-1" :color="slot.is_preferred ? 'primary' : 'grey'">
                      {{ slot.is_preferred ? 'mdi-star' : 'mdi-clock-outline' }}
                    </v-icon>
                    <span class="text-caption">
                      {{ formatTime(slot.start) }} - {{ formatTime(slot.end) }}
                    </span>
                  </div>
                  <div
                    v-if="!dayAvailability[day.dateStr]!.available_slots?.length"
                    class="no-availability text-center text-medium-emphasis"
                  >
                    <v-icon size="x-small">mdi-calendar-blank-outline</v-icon>
                  </div>
                </template>
              </template>
              <div v-else class="no-availability text-center text-medium-emphasis">
                <v-icon size="x-small">mdi-calendar-blank-outline</v-icon>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div class="d-flex ga-4 mt-4 justify-center text-caption">
        <div class="d-flex align-center ga-1">
          <v-icon size="small" color="primary">mdi-star</v-icon>
          <span>Preferred</span>
        </div>
        <div class="d-flex align-center ga-1">
          <v-icon size="small" color="grey">mdi-clock-outline</v-icon>
          <span>Available</span>
        </div>
        <div class="d-flex align-center ga-1">
          <v-icon size="small" color="error">mdi-calendar-remove</v-icon>
          <span>Blocked</span>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAvailabilityStore, formatTime, DAY_NAMES_SHORT, type DateAvailability } from '@/stores/availability'

const props = defineProps<{
  playerId?: string
}>()

const store = useAvailabilityStore()

const loading = ref(false)
const periodOffset = ref(0) // Offset in 2-week increments
const dayAvailability = ref<Record<string, DateAvailability>>({})

const today = new Date()
today.setHours(0, 0, 0, 0)

const startOfPeriod = computed(() => {
  const start = new Date(today)
  // Start from beginning of current week (Sunday)
  start.setDate(start.getDate() - start.getDay() + periodOffset.value * 14)
  return start
})

function createDayInfo(date: Date) {
  const dayOfWeek = date.getDay()
  return {
    dayName: DAY_NAMES_SHORT[dayOfWeek],
    date: date.getDate(),
    dateStr: date.toISOString().split('T')[0]!,
    isToday: date.toDateString() === today.toDateString(),
    fullDate: new Date(date),
  }
}

const week1Days = computed(() => {
  const days = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfPeriod.value)
    date.setDate(date.getDate() + i)
    days.push(createDayInfo(date))
  }
  return days
})

const week2Days = computed(() => {
  const days = []
  for (let i = 7; i < 14; i++) {
    const date = new Date(startOfPeriod.value)
    date.setDate(date.getDate() + i)
    days.push(createDayInfo(date))
  }
  return days
})

const allDays = computed(() => [...week1Days.value, ...week2Days.value])

const periodRangeLabel = computed(() => {
  const start = week1Days.value[0]!.fullDate
  const end = week2Days.value[6]!.fullDate
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.toLocaleDateString(undefined, { ...options, year: 'numeric' })} - ${end.toLocaleDateString(undefined, { ...options, year: 'numeric' })}`
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${start.toLocaleDateString(undefined, options)} - ${end.toLocaleDateString(undefined, options)}, ${start.getFullYear()}`
  }
  return `${start.toLocaleDateString(undefined, { month: 'short' })} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`
})

function previousPeriod() {
  periodOffset.value--
}

function nextPeriod() {
  periodOffset.value++
}

function goToToday() {
  periodOffset.value = 0
}

async function loadAvailability() {
  loading.value = true
  try {
    const promises = allDays.value.map(async (day) => {
      try {
        let availability: DateAvailability
        if (props.playerId) {
          availability = await store.fetchPlayerDateAvailability(props.playerId, day.dateStr)
        } else {
          availability = await store.fetchDateAvailability(day.dateStr)
        }
        dayAvailability.value[day.dateStr] = availability
      } catch {
        // Day may not have availability data
        dayAvailability.value[day.dateStr] = {
          date: day.dateStr,
          is_blocked: false,
          available_slots: [],
          notes: [],
        }
      }
    })
    await Promise.all(promises)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAvailability()
})

// Reload when period changes
watch(() => periodOffset.value, () => {
  loadAvailability()
})

// Reload when player changes
watch(() => props.playerId, () => {
  loadAvailability()
})

// Watch for changes in windows or overrides and refresh calendar
watch(
  () => [store.windows, store.overrides],
  () => {
    loadAvailability()
  },
  { deep: true }
)
</script>

<style scoped>
.calendar-grid {
  border: 1px solid rgb(var(--v-theme-outline));
  border-radius: 8px;
  overflow: hidden;
}

.calendar-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background-color: rgb(var(--v-theme-surface-variant));
  border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.calendar-header-cell {
  padding: 6px 4px;
  border-right: 1px solid rgb(var(--v-theme-outline));
}

.calendar-header-cell:last-child {
  border-right: none;
}

.calendar-body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  min-height: 100px;
}

.calendar-day-column {
  border-right: 1px solid rgb(var(--v-theme-outline));
  padding: 4px;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.calendar-day-column:last-child {
  border-right: none;
}

.today-column {
  background-color: rgba(var(--v-theme-primary), 0.04);
}

.time-slot {
  display: flex;
  align-items: center;
  padding: 2px 4px;
  background-color: rgb(var(--v-theme-surface-variant));
  border-radius: 4px;
  font-size: 0.7rem;
}

.preferred-slot {
  background-color: rgba(var(--v-theme-primary), 0.12);
  border: 1px solid rgba(var(--v-theme-primary), 0.3);
}

.blocked-day {
  flex: 1;
  background-color: rgba(var(--v-theme-error), 0.08);
  border-radius: 4px;
}

.no-availability {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0.4;
}
</style>
