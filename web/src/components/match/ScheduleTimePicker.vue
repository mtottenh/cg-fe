<template>
  <div class="schedule-time-picker">
    <!-- Recommended Times (backend suggestions or fallback quick select) -->
    <div class="mb-4">
      <div class="text-subtitle-2 mb-2 d-flex align-center">
        <v-icon start size="small" :color="suggestedTimes.length > 0 ? 'success' : undefined">
          {{ suggestedTimes.length > 0 ? 'mdi-clock-check' : 'mdi-calendar-today' }}
        </v-icon>
        {{ suggestedTimes.length > 0 ? 'Recommended Times' : 'Quick Select' }}
      </div>

      <!-- Backend-scored suggestions -->
      <div v-if="suggestedTimes.length > 0" class="d-flex flex-wrap ga-2">
        <v-chip
          v-for="(time, idx) in suggestedTimes"
          :key="time"
          :color="isTimeSelected(time) ? 'primary' : idx === 0 ? 'success' : 'default'"
          :variant="isTimeSelected(time) ? 'flat' : 'outlined'"
          class="cursor-pointer"
          @click="toggleSuggestedTime(time)"
        >
          <v-icon start size="small">
            {{ isTimeSelected(time) ? 'mdi-check-circle' : idx === 0 ? 'mdi-star' : 'mdi-clock-outline' }}
          </v-icon>
          {{ formatTime(time) }}
        </v-chip>
      </div>

      <!-- Fallback: hardcoded quick times when no suggestions available -->
      <v-chip-group v-else>
        <v-chip
          v-for="quick in quickTimes"
          :key="quick.label"
          variant="outlined"
          size="small"
          @click="addQuickTime(quick.time)"
        >
          {{ quick.label }}
        </v-chip>
      </v-chip-group>
    </div>

    <!-- Manual Time Input -->
    <div class="mb-4">
      <div class="text-subtitle-2 mb-2 d-flex align-center">
        <v-icon start size="small">mdi-calendar-edit</v-icon>
        Custom Times
      </div>
      <!-- Cross-region leagues live or die on this being unambiguous. -->
      <div class="text-caption text-medium-emphasis mb-2">
        Times are in your local timezone ({{ timezoneLabel }})
      </div>
      <v-form v-model="formValid">
        <v-row>
          <v-col v-for="(entry, index) in entries" :key="entry.id" cols="12" md="6">
            <v-text-field
              :model-value="toLocalDatetime(entry.value)"
              :label="`Time Option ${index + 1}`"
              type="datetime-local"
              variant="outlined"
              density="comfortable"
              :min="minDateTime"
              :rules="index === 0 ? [rules.required, rules.futureDate] : [rules.futureDate]"
              @update:model-value="(val) => updateTime(index, val)"
            >
              <template v-slot:append>
                <v-btn
                  v-if="index > 0 || entries.length > 1"
                  icon
                  size="small"
                  variant="text"
                  aria-label="Remove time option"
                  @click="removeTime(index)"
                >
                  <v-icon>mdi-close</v-icon>
                </v-btn>
              </template>
            </v-text-field>
          </v-col>
        </v-row>
      </v-form>

      <v-btn
        v-if="entries.length < maxTimes"
        variant="tonal"
        size="small"
        @click="addEmptySlot"
      >
        <v-icon start>mdi-plus</v-icon>
        Add Another Time
      </v-btn>
    </div>

    <!-- Selected Times Summary -->
    <div v-if="validTimes.length > 0" class="mt-4">
      <v-alert type="info" variant="tonal" density="compact">
        <template v-slot:prepend>
          <v-icon>mdi-information</v-icon>
        </template>
        <div class="text-body-2">
          <strong>{{ validTimes.length }} time{{ validTimes.length > 1 ? 's' : '' }} selected:</strong>
          <ul class="mt-1 mb-0 pl-4">
            <li v-for="time in validTimes" :key="time">
              {{ formatTime(time) }}
            </li>
          </ul>
        </div>
      </v-alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useFormRules } from '@/composables/useFormRules'

const props = withDefaults(
  defineProps<{
    suggestedTimes?: string[]
    maxTimes?: number
    minHoursFromNow?: number
  }>(),
  {
    suggestedTimes: () => [],
    maxTimes: 5,
    minHoursFromNow: 1,
  }
)

const times = defineModel<string[]>({ required: true })

/** True when every rendered rule passes — parents gate submission on this
 * instead of merely "some string is non-empty". */
const formValid = defineModel<boolean>('valid', { default: false })

// Internal rows carry a stable id so Vuetify field state (validation, dirty,
// focus) follows the datum, not the position — with `:key="index"` deleting
// row 1 of 3 leaves row 2 wearing row 3's state.
interface TimeEntry {
  id: number
  value: string
}
let nextRowId = 0
const entries = ref<TimeEntry[]>(
  (times.value.length > 0 ? times.value : ['']).map((value) => ({ id: nextRowId++, value }))
)

function commit() {
  times.value = entries.value.map((e) => e.value)
}

// External replacement of the model (e.g. parent resets after submit)
// rebuilds the rows; internal commits round-trip without rebuilding.
watch(times, (external) => {
  const current = entries.value.map((e) => e.value)
  if (external.length === current.length && external.every((v, i) => v === current[i])) return
  entries.value = (external.length > 0 ? external : ['']).map((value) => ({
    id: nextRowId++,
    value,
  }))
})

// Computed
const validTimes = computed(() => entries.value.map((e) => e.value).filter((t) => t !== ''))

const timezoneLabel = computed(() => {
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date())
  const zone = parts.find((p) => p.type === 'timeZoneName')?.value
  return zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
})

const minDateTime = computed(() => {
  const min = new Date()
  min.setHours(min.getHours() + props.minHoursFromNow)
  return toLocalDatetimeString(min)
})

// Quick time options
const quickTimes = computed(() => {
  const now = new Date()
  const times: { label: string; time: Date }[] = []

  // Today evening (if it's before 6pm)
  if (now.getHours() < 18) {
    const todayEvening = new Date(now)
    todayEvening.setHours(20, 0, 0, 0)
    times.push({ label: 'Today 8PM', time: todayEvening })
  }

  // Tomorrow afternoon
  const tomorrowAfternoon = new Date(now)
  tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1)
  tomorrowAfternoon.setHours(14, 0, 0, 0)
  times.push({ label: 'Tomorrow 2PM', time: tomorrowAfternoon })

  // Tomorrow evening
  const tomorrowEvening = new Date(now)
  tomorrowEvening.setDate(tomorrowEvening.getDate() + 1)
  tomorrowEvening.setHours(20, 0, 0, 0)
  times.push({ label: 'Tomorrow 8PM', time: tomorrowEvening })

  // This weekend
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7
  const saturday = new Date(now)
  saturday.setDate(saturday.getDate() + daysUntilSaturday)
  saturday.setHours(15, 0, 0, 0)
  times.push({ label: 'Sat 3PM', time: saturday })

  const sunday = new Date(saturday)
  sunday.setDate(sunday.getDate() + 1)
  times.push({ label: 'Sun 3PM', time: sunday })

  // Filter out past times
  return times.filter((t) => t.time > now)
})

// Validation rules
const { required: _required, ...baseRules } = useFormRules()
const rules = {
  ...baseRules,
  required: (v: string) => !!v || 'At least one time is required',
  futureDate: (v: string) => {
    if (!v) return true
    return new Date(v) > new Date() || 'Time must be in the future'
  },
}

// Helpers
function toLocalDatetimeString(date: Date): string {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

function toLocalDatetime(isoString: string): string {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    return toLocalDatetimeString(date)
  } catch {
    return isoString
  }
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function isTimeSelected(time: string): boolean {
  return entries.value.some((e) => e.value === time)
}

function toggleSuggestedTime(time: string) {
  const index = entries.value.findIndex((e) => e.value === time)
  if (index >= 0) {
    entries.value.splice(index, 1)
    if (entries.value.length === 0) {
      entries.value.push({ id: nextRowId++, value: '' }) // Keep at least one slot
    }
  } else if (entries.value.length < props.maxTimes) {
    // Drop empty slots, then add the suggestion
    entries.value = entries.value.filter((e) => e.value !== '')
    entries.value.push({ id: nextRowId++, value: time })
  }
  commit()
}

function addQuickTime(time: Date) {
  const isoTime = time.toISOString()
  if (isTimeSelected(isoTime) || entries.value.length >= props.maxTimes) return
  // Replace first empty slot (same row, new value) or add a new row
  const empty = entries.value.find((e) => e.value === '')
  if (empty) {
    empty.value = isoTime
  } else {
    entries.value.push({ id: nextRowId++, value: isoTime })
  }
  commit()
}

function updateTime(index: number, localValue: string) {
  const entry = entries.value[index]
  if (!entry) return
  entry.value = localValue ? new Date(localValue).toISOString() : ''
  commit()
}

function removeTime(index: number) {
  entries.value.splice(index, 1)
  if (entries.value.length === 0) {
    entries.value.push({ id: nextRowId++, value: '' })
  }
  commit()
}

function addEmptySlot() {
  if (entries.value.length < props.maxTimes) {
    entries.value.push({ id: nextRowId++, value: '' })
  }
}
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
