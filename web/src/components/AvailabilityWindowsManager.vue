<template>
  <v-card>
    <v-card-title class="d-flex justify-space-between align-center">
      <span>Weekly Availability</span>
      <v-btn color="primary" variant="tonal" size="small" @click="showAddDialog = true">
        <v-icon start>mdi-plus</v-icon>
        Add Time Slot
      </v-btn>
    </v-card-title>

    <v-card-text>
      <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>

      <div v-if="loading" class="d-flex justify-center py-4">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <div v-else-if="windows.length === 0" class="text-center py-4 text-medium-emphasis">
        <v-icon size="48" class="mb-2">mdi-calendar-blank-outline</v-icon>
        <p>No availability windows set.</p>
        <p class="text-body-2">Add your weekly availability to help schedule matches.</p>
      </div>

      <div v-else>
        <v-list lines="two">
          <template v-for="day in 7" :key="day - 1">
            <template v-if="(windowsByDay[day - 1]?.length ?? 0) > 0">
              <v-list-subheader>{{ getDayName(day - 1) }}</v-list-subheader>
              <v-list-item
                v-for="window in windowsByDay[day - 1]"
                :key="window.id"
                :class="{ 'bg-primary-lighten-5': window.is_preferred }"
              >
                <template #prepend>
                  <v-icon :color="window.is_preferred ? 'primary' : 'grey'">
                    {{ window.is_preferred ? 'mdi-star' : 'mdi-clock-outline' }}
                  </v-icon>
                </template>

                <v-list-item-title>
                  {{ formatTimeRange(window.start_time, window.end_time) }}
                  <v-chip v-if="window.is_preferred" size="x-small" color="primary" class="ml-2">
                    Preferred
                  </v-chip>
                </v-list-item-title>

                <v-list-item-subtitle v-if="window.notes">
                  {{ window.notes }}
                </v-list-item-subtitle>

                <template #append>
                  <v-btn aria-label="Edit availability window" icon variant="text" size="small" @click="editWindow(window)">
                    <v-icon>mdi-pencil</v-icon>
                  </v-btn>
                  <v-btn aria-label="Delete availability window" icon variant="text" size="small" color="error" @click="confirmDelete(window)">
                    <v-icon>mdi-delete</v-icon>
                  </v-btn>
                </template>
              </v-list-item>
            </template>
          </template>
        </v-list>
      </div>
    </v-card-text>

    <!-- Add/Edit Dialog -->
    <v-dialog v-model="showAddDialog" max-width="500" persistent>
      <v-card>
        <v-card-title>
          {{ editingWindow ? 'Edit Availability' : 'Add Availability' }}
        </v-card-title>

        <v-divider />

        <v-card-text>
          <v-form ref="formRef" v-model="formValid">
            <v-select
              v-model="form.day_of_week"
              :items="dayOptions"
              label="Day of Week"
              :rules="[rules.required]"
              variant="outlined"
              density="comfortable"
              class="mb-4"
            />

            <v-row>
              <v-col cols="6">
                <v-text-field
                  v-model="form.start_time"
                  label="Start Time"
                  type="time"
                  :rules="[rules.required]"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model="form.end_time"
                  label="End Time"
                  type="time"
                  :rules="[rules.required, rules.endAfterStart]"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
            </v-row>

            <v-switch
              v-model="form.is_preferred"
              label="Preferred Time"
              color="primary"
              hint="Mark this as a preferred time slot"
              persistent-hint
              class="mb-4"
            />

            <v-textarea
              v-model="form.notes"
              label="Notes (Optional)"
              rows="2"
              variant="outlined"
              density="comfortable"
              placeholder="e.g., Available after work"
            />
          </v-form>
        </v-card-text>

        <v-divider />

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeDialog">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="saving"
            :disabled="!formValid"
            @click="saveWindow"
          >
            {{ editingWindow ? 'Save Changes' : 'Add' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Availability</v-card-title>
        <v-card-text>
          Are you sure you want to delete this availability window?
          <div v-if="deletingWindow" class="mt-2 text-medium-emphasis">
            <strong>{{ getDayName(deletingWindow.day_of_week) }}</strong>
            {{ formatTimeRange(deletingWindow.start_time, deletingWindow.end_time) }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDeleteDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" :loading="deleting" @click="performDelete">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAvailabilityStore, getDayName, formatTimeRange, DAY_NAMES, type AvailabilityWindow } from '@/stores/availability'
import { useFormRules } from '@/composables/useFormRules'

const store = useAvailabilityStore()

const formRef = ref()
const formValid = ref(false)
const showAddDialog = ref(false)
const showDeleteDialog = ref(false)
const saving = ref(false)
const deleting = ref(false)
const editingWindow = ref<AvailabilityWindow | null>(null)
const deletingWindow = ref<AvailabilityWindow | null>(null)

const form = ref({
  day_of_week: 1, // Monday
  start_time: '18:00',
  end_time: '22:00',
  is_preferred: false,
  notes: '',
})

const dayOptions = DAY_NAMES.map((name, index) => ({
  title: name,
  value: index,
}))

const rules = {
  ...useFormRules(),
  endAfterStart: () => {
    if (!form.value.start_time || !form.value.end_time) return true
    return form.value.end_time > form.value.start_time || 'End time must be after start time'
  },
}

// Computed from store
const windows = computed(() => store.windows)
const windowsByDay = computed(() => store.windowsByDay)
const loading = computed(() => store.loading)
const error = computed({
  get: () => store.error,
  set: (v) => { store.error = v },
})

onMounted(async () => {
  if (windows.value.length === 0) {
    await store.fetchWindows()
  }
})

function editWindow(window: AvailabilityWindow) {
  editingWindow.value = window
  form.value = {
    day_of_week: window.day_of_week,
    start_time: window.start_time.substring(0, 5), // HH:MM:SS -> HH:MM
    end_time: window.end_time.substring(0, 5),
    is_preferred: window.is_preferred,
    notes: window.notes || '',
  }
  showAddDialog.value = true
}

function confirmDelete(window: AvailabilityWindow) {
  deletingWindow.value = window
  showDeleteDialog.value = true
}

function closeDialog() {
  showAddDialog.value = false
  editingWindow.value = null
  form.value = {
    day_of_week: 1,
    start_time: '18:00',
    end_time: '22:00',
    is_preferred: false,
    notes: '',
  }
}

async function saveWindow() {
  if (!formValid.value) return

  saving.value = true
  try {
    const payload = {
      day_of_week: form.value.day_of_week,
      start_time: form.value.start_time + ':00', // HH:MM -> HH:MM:SS
      end_time: form.value.end_time + ':00',
      is_preferred: form.value.is_preferred,
      notes: form.value.notes || null,
    }

    if (editingWindow.value) {
      await store.updateWindow(editingWindow.value.id, payload)
    } else {
      await store.createWindow(payload)
    }
    closeDialog()
  } catch {
    // Error handled by store
  } finally {
    saving.value = false
  }
}

async function performDelete() {
  if (!deletingWindow.value) return

  deleting.value = true
  try {
    await store.deleteWindow(deletingWindow.value.id)
    showDeleteDialog.value = false
    deletingWindow.value = null
  } catch {
    // Error handled by store
  } finally {
    deleting.value = false
  }
}
</script>
