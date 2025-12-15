<template>
  <v-container class="py-8">
    <div class="d-flex align-center mb-6">
      <v-btn icon variant="text" class="mr-2" @click="$router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div>
        <h1 class="text-h4">My Availability</h1>
        <p class="text-body-2 text-medium-emphasis">
          Set your weekly availability and date-specific overrides to help schedule matches
        </p>
      </div>
    </div>

    <v-tabs v-model="activeTab" class="mb-6">
      <v-tab value="calendar">
        <v-icon start>mdi-calendar-month</v-icon>
        Calendar View
      </v-tab>
      <v-tab value="weekly">
        <v-icon start>mdi-calendar-week</v-icon>
        Weekly Schedule
      </v-tab>
      <v-tab value="overrides">
        <v-icon start>mdi-calendar-edit</v-icon>
        Date Overrides
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <v-window-item value="calendar">
        <AvailabilityCalendarView />
      </v-window-item>

      <v-window-item value="weekly">
        <AvailabilityWindowsManager />
      </v-window-item>

      <v-window-item value="overrides">
        <AvailabilityOverridesManager />
      </v-window-item>
    </v-window>

    <!-- Quick Tips Card -->
    <v-card class="mt-6" variant="tonal" color="info">
      <v-card-text>
        <div class="d-flex align-start gap-3">
          <v-icon color="info">mdi-lightbulb-outline</v-icon>
          <div>
            <p class="text-subtitle-2 mb-1">Tips for setting availability:</p>
            <ul class="text-body-2 text-medium-emphasis ml-4">
              <li>Set your <strong>weekly schedule</strong> for recurring availability times</li>
              <li>Mark <strong>preferred times</strong> to help prioritize match scheduling</li>
              <li>Use <strong>date overrides</strong> for vacations or special days</li>
              <li>Your availability helps team captains and tournament organizers schedule matches</li>
            </ul>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAvailabilityStore } from '@/stores/availability'
import AvailabilityCalendarView from '@/components/AvailabilityCalendarView.vue'
import AvailabilityWindowsManager from '@/components/AvailabilityWindowsManager.vue'
import AvailabilityOverridesManager from '@/components/AvailabilityOverridesManager.vue'

const store = useAvailabilityStore()
const activeTab = ref('calendar')

onMounted(() => {
  // Pre-load availability data
  store.fetchAll()
})
</script>
