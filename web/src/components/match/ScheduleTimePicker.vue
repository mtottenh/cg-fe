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
      <div v-if="suggestedTimes.length > 0" class="d-flex flex-wrap gap-2">
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
      <v-row>
        <v-col v-for="(time, index) in modelValue" :key="index" cols="12" md="6">
          <v-text-field
            :model-value="toLocalDatetime(time)"
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
                v-if="index > 0 || modelValue.length > 1"
                icon
                size="small"
                variant="text"
                @click="removeTime(index)"
              >
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </template>
          </v-text-field>
        </v-col>
      </v-row>

      <v-btn
        v-if="modelValue.length < maxTimes"
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
import { computed } from 'vue'
import { useFormRules } from '@/composables/useFormRules'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
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

const emit = defineEmits<{
  'update:modelValue': [times: string[]]
}>()

// Computed
const validTimes = computed(() => props.modelValue.filter((t) => t !== ''))

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
  })
}

function isTimeSelected(time: string): boolean {
  return props.modelValue.includes(time)
}

function toggleSuggestedTime(time: string) {
  const index = props.modelValue.indexOf(time)
  if (index >= 0) {
    // Remove it
    const newTimes = [...props.modelValue]
    newTimes.splice(index, 1)
    if (newTimes.length === 0) {
      newTimes.push('') // Keep at least one slot
    }
    emit('update:modelValue', newTimes)
  } else if (props.modelValue.length < props.maxTimes) {
    // Add it
    const newTimes = props.modelValue.filter((t) => t !== '')
    newTimes.push(time)
    emit('update:modelValue', newTimes)
  }
}

function addQuickTime(time: Date) {
  const isoTime = time.toISOString()
  if (!props.modelValue.includes(isoTime) && props.modelValue.length < props.maxTimes) {
    // Replace first empty slot or add new
    const emptyIndex = props.modelValue.findIndex((t) => t === '')
    if (emptyIndex >= 0) {
      const newTimes = [...props.modelValue]
      newTimes[emptyIndex] = isoTime
      emit('update:modelValue', newTimes)
    } else {
      emit('update:modelValue', [...props.modelValue, isoTime])
    }
  }
}

function updateTime(index: number, localValue: string) {
  const newTimes = [...props.modelValue]
  if (localValue) {
    newTimes[index] = new Date(localValue).toISOString()
  } else {
    newTimes[index] = ''
  }
  emit('update:modelValue', newTimes)
}

function removeTime(index: number) {
  const newTimes = [...props.modelValue]
  newTimes.splice(index, 1)
  if (newTimes.length === 0) {
    newTimes.push('')
  }
  emit('update:modelValue', newTimes)
}

function addEmptySlot() {
  if (props.modelValue.length < props.maxTimes) {
    emit('update:modelValue', [...props.modelValue, ''])
  }
}
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
