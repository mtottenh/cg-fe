<template>
  <v-card variant="outlined">
    <!-- Header with week navigation -->
    <v-card-title class="d-flex justify-space-between align-center">
      <span class="text-body-1 font-weight-medium">Availability</span>
      <div class="d-flex align-center gap-1">
        <v-btn icon variant="text" size="small" @click="overlay.previousWeek()">
          <v-icon>mdi-chevron-left</v-icon>
        </v-btn>
        <span class="text-body-2">{{ overlay.weekLabel.value }}</span>
        <v-btn icon variant="text" size="small" @click="overlay.nextWeek()">
          <v-icon>mdi-chevron-right</v-icon>
        </v-btn>
        <v-btn
          v-if="overlay.weekOffset.value !== 0"
          variant="text"
          size="x-small"
          @click="overlay.goToCurrentWeek()"
        >
          This Week
        </v-btn>
      </div>
    </v-card-title>
    <v-divider />

    <v-card-text>
      <!-- Loading -->
      <div v-if="overlay.loading.value && !hasGridData" class="d-flex justify-center py-8">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <template v-else>
        <!-- Desktop: 7-day grid -->
        <div class="calendar-overlay d-none d-sm-block">
          <!-- Day headers -->
          <div class="grid-header">
            <div class="time-gutter" />
            <div
              v-for="day in grid.days"
              :key="day.date"
              class="day-header text-center"
              :class="{ 'today-header': day.isToday }"
            >
              <div class="text-caption text-medium-emphasis">{{ day.dayLabel }}</div>
              <div class="text-body-2">{{ formatDayDate(day.date) }}</div>
            </div>
          </div>

          <!-- Grid body (scrollable) -->
          <div class="grid-body">
            <template v-for="timeKey in grid.timeSlots" :key="timeKey">
              <div class="time-gutter text-caption text-medium-emphasis">
                {{ timeKey.endsWith(':00') ? formatHour(timeKey) : '' }}
              </div>
              <div
                v-for="day in grid.days"
                :key="`${day.date}-${timeKey}`"
                :class="[
                  'grid-cell',
                  `cell-${day.cells.get(timeKey) || 'empty'}`,
                  {
                    'cell-selected': isSelected(day.date, timeKey),
                    'cell-clickable': isCellClickable(day.cells.get(timeKey) || 'empty'),
                  },
                ]"
                @click="handleCellClick(day.date, timeKey, day.cells.get(timeKey) || 'empty')"
              >
                <v-icon
                  v-if="isSelected(day.date, timeKey)"
                  size="x-small"
                  class="selected-icon"
                >mdi-check</v-icon>
              </div>
            </template>
          </div>
        </div>

        <!-- Mobile: single-day view -->
        <div class="d-sm-none">
          <div class="d-flex align-center justify-center gap-2 mb-3">
            <v-btn icon variant="text" size="small" @click="mobileDayIndex = Math.max(0, mobileDayIndex - 1)">
              <v-icon>mdi-chevron-left</v-icon>
            </v-btn>
            <span class="text-body-1 font-weight-medium">
              {{ currentMobileDay?.dayLabel }} {{ formatDayDate(currentMobileDay?.date || '') }}
            </span>
            <v-btn icon variant="text" size="small" @click="mobileDayIndex = Math.min(6, mobileDayIndex + 1)">
              <v-icon>mdi-chevron-right</v-icon>
            </v-btn>
          </div>

          <div class="mobile-slots">
            <template v-for="timeKey in grid.timeSlots" :key="timeKey">
              <div
                v-if="currentMobileDay && (currentMobileDay.cells.get(timeKey) || 'empty') !== 'empty'"
                :class="[
                  'mobile-slot d-flex align-center',
                  `cell-${currentMobileDay.cells.get(timeKey)}`,
                  {
                    'cell-selected': isSelected(currentMobileDay.date, timeKey),
                    'cell-clickable': isCellClickable(currentMobileDay.cells.get(timeKey) || 'empty'),
                  },
                ]"
                @click="handleCellClick(currentMobileDay.date, timeKey, currentMobileDay.cells.get(timeKey) || 'empty')"
              >
                <span class="text-caption font-weight-medium mr-2">{{ formatHour(timeKey) || timeKey }}</span>
                <v-chip size="x-small" :color="getStatusChipColor(currentMobileDay.cells.get(timeKey) || 'empty')" variant="tonal">
                  {{ getStatusLabel(currentMobileDay.cells.get(timeKey) || 'empty') }}
                </v-chip>
                <v-spacer />
                <v-icon v-if="isSelected(currentMobileDay.date, timeKey)" size="small" color="primary">mdi-check-circle</v-icon>
              </div>
            </template>
            <div
              v-if="currentMobileDay && !hasMobileDaySlots"
              class="text-center text-medium-emphasis py-4"
            >
              No availability on this day
            </div>
          </div>
        </div>

        <!-- Legend -->
        <div class="d-flex flex-wrap gap-3 mt-3 justify-center text-caption">
          <div class="d-flex align-center gap-1">
            <span class="legend-swatch swatch-my-only" />
            You
          </div>
          <div class="d-flex align-center gap-1">
            <span class="legend-swatch swatch-opponent-only" />
            Opponent
          </div>
          <div class="d-flex align-center gap-1">
            <span class="legend-swatch swatch-mutual" />
            Mutual
          </div>
          <div class="d-flex align-center gap-1">
            <span class="legend-swatch swatch-suggested" />
            <v-icon size="x-small">mdi-star</v-icon>
            Suggested
          </div>
        </div>

        <!-- Selected times summary -->
        <div v-if="selectedTimes.length > 0" class="mt-3">
          <v-alert type="info" variant="tonal" density="compact">
            <div class="text-body-2">
              <strong>{{ selectedTimes.length }} time{{ selectedTimes.length > 1 ? 's' : '' }} selected:</strong>
              <div class="d-flex flex-wrap gap-1 mt-1">
                <v-chip
                  v-for="time in selectedTimes"
                  :key="time"
                  size="small"
                  color="primary"
                  variant="flat"
                  closable
                  @click:close="removeTime(time)"
                >
                  {{ formatSelectedTime(time) }}
                </v-chip>
              </div>
            </div>
          </v-alert>
        </div>

        <!-- Link to availability settings -->
        <div class="mt-3 text-center">
          <router-link to="/profile/availability" class="text-decoration-none">
            <v-btn variant="text" size="small" color="primary">
              <v-icon start size="small">mdi-cog</v-icon>
              Update Your Availability
            </v-btn>
          </router-link>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, toRef } from 'vue'
import { useAvailabilityOverlay, type OverlayCellStatus } from '@/composables/useAvailabilityOverlay'

const props = withDefaults(
  defineProps<{
    opponentPlayerId: string
    tournamentId: string
    matchId: string
    modelValue: string[]
    maxSelections?: number
  }>(),
  {
    maxSelections: 5,
  }
)

const emit = defineEmits<{
  'update:modelValue': [times: string[]]
}>()

const overlay = useAvailabilityOverlay(
  toRef(props, 'opponentPlayerId') as any,
  toRef(props, 'tournamentId') as any,
  toRef(props, 'matchId') as any,
)

const grid = computed(() => overlay.overlayData.value)
const hasGridData = computed(() => grid.value.days.some(d => d.cells.size > 0))

// Mobile state
const mobileDayIndex = ref(0)
const currentMobileDay = computed(() => grid.value.days[mobileDayIndex.value])
const hasMobileDaySlots = computed(() => {
  if (!currentMobileDay.value) return false
  for (const status of currentMobileDay.value.cells.values()) {
    if (status !== 'empty') return true
  }
  return false
})

// Selected times (filter out empty strings from parent)
const selectedTimes = computed(() => props.modelValue.filter(t => t !== ''))

// Build a set of selected "date|time" keys for fast lookup
const selectedKeys = computed(() => {
  const keys = new Set<string>()
  for (const iso of selectedTimes.value) {
    const d = new Date(iso)
    const y = d.getFullYear()
    const mo = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    keys.add(`${y}-${mo}-${day}|${h}:${m}`)
  }
  return keys
})

function isSelected(date: string, timeKey: string): boolean {
  return selectedKeys.value.has(`${date}|${timeKey}`)
}

function isCellClickable(status: OverlayCellStatus): boolean {
  return status === 'mutual' || status === 'suggested'
}

function handleCellClick(date: string, timeKey: string, status: OverlayCellStatus) {
  if (!isCellClickable(status)) return

  const iso = overlay.cellToIso(date, timeKey)
  const key = `${date}|${timeKey}`

  if (selectedKeys.value.has(key)) {
    // Deselect
    const newTimes = props.modelValue.filter(t => {
      if (t === '') return false
      const d = new Date(t)
      const y = d.getFullYear()
      const mo = (d.getMonth() + 1).toString().padStart(2, '0')
      const day = d.getDate().toString().padStart(2, '0')
      const h = d.getHours().toString().padStart(2, '0')
      const m = d.getMinutes().toString().padStart(2, '0')
      return `${y}-${mo}-${day}|${h}:${m}` !== key
    })
    emit('update:modelValue', newTimes.length > 0 ? newTimes : [''])
  } else if (selectedTimes.value.length < props.maxSelections) {
    // Select
    const newTimes = [...props.modelValue.filter(t => t !== ''), iso]
    emit('update:modelValue', newTimes)
  }
}

function removeTime(iso: string) {
  const newTimes = props.modelValue.filter(t => t !== '' && t !== iso)
  emit('update:modelValue', newTimes.length > 0 ? newTimes : [''])
}

function formatDayDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00') // Avoid timezone shift
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatHour(timeKey: string): string {
  if (!timeKey.endsWith(':00')) return ''
  const h = parseInt(timeKey.split(':')[0]!)
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h > 12 ? `${h - 12} PM` : `${h} AM`
}

function formatSelectedTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusChipColor(status: OverlayCellStatus): string {
  switch (status) {
    case 'suggested': return 'warning'
    case 'mutual': return 'success'
    case 'my_only': return 'primary'
    case 'opponent_only': return 'info'
    case 'blocked': return 'error'
    default: return 'grey'
  }
}

function getStatusLabel(status: OverlayCellStatus): string {
  switch (status) {
    case 'suggested': return 'Suggested'
    case 'mutual': return 'Both available'
    case 'my_only': return 'You only'
    case 'opponent_only': return 'Opponent only'
    case 'blocked': return 'Blocked'
    default: return ''
  }
}

// Fetch on mount and when week changes
onMounted(() => overlay.fetchWeek())

watch(() => overlay.weekOffset.value, () => overlay.fetchWeek())
watch(() => props.opponentPlayerId, () => overlay.fetchWeek())
</script>

<style scoped>
/* Grid layout */
.grid-header,
.grid-body {
  display: grid;
  grid-template-columns: 48px repeat(7, 1fr);
}

.grid-header {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.2);
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
}

.day-header {
  padding: 4px 2px;
  border-left: 1px solid rgba(var(--v-border-color), 0.1);
}

.today-header {
  background-color: rgba(var(--v-theme-primary), 0.06);
}

.grid-body {
  max-height: 360px;
  overflow-y: auto;
}

.time-gutter {
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 0.65rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  user-select: none;
}

/* Cells */
.grid-cell {
  height: 16px;
  border-left: 1px solid rgba(var(--v-border-color), 0.06);
  border-bottom: 1px solid rgba(var(--v-border-color), 0.04);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cell-clickable {
  cursor: pointer;
}

.cell-clickable:hover {
  filter: brightness(0.92);
}

/* Status colors */
.cell-empty { background: transparent; }
.cell-my_only { background-color: rgba(var(--v-theme-primary), 0.12); }
.cell-opponent_only { background-color: rgba(var(--v-theme-info), 0.12); }
.cell-mutual { background-color: rgba(var(--v-theme-success), 0.18); }
.cell-suggested { background-color: rgba(var(--v-theme-warning), 0.22); }
.cell-blocked { background-color: rgba(var(--v-theme-error), 0.06); }

.cell-selected {
  background-color: rgba(var(--v-theme-primary), 0.35) !important;
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -1px;
  z-index: 1;
}

.selected-icon {
  color: rgb(var(--v-theme-primary));
}

/* Mobile slots */
.mobile-slot {
  padding: 8px 12px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: default;
}

.mobile-slot.cell-clickable {
  cursor: pointer;
}

.mobile-slot.cell-selected {
  outline: 2px solid rgb(var(--v-theme-primary));
}

/* Legend */
.legend-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  display: inline-block;
}

.swatch-my-only { background-color: rgba(var(--v-theme-primary), 0.25); }
.swatch-opponent-only { background-color: rgba(var(--v-theme-info), 0.25); }
.swatch-mutual { background-color: rgba(var(--v-theme-success), 0.3); }
.swatch-suggested { background-color: rgba(var(--v-theme-warning), 0.35); }
</style>
