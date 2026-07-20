<template>
  <v-card>
    <v-card-title class="d-flex justify-space-between align-center">
      <span>Date Overrides</span>
      <v-btn color="primary" variant="tonal" size="small" @click="showAddDialog = true">
        <v-icon start>mdi-plus</v-icon>
        Add Override
      </v-btn>
    </v-card-title>

    <v-card-text>
      <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>

      <div v-if="loading" class="d-flex justify-center py-4">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <div v-else-if="futureOverrides.length === 0" class="text-center py-4 text-medium-emphasis">
        <v-icon size="48" class="mb-2">mdi-calendar-remove-outline</v-icon>
        <p>No upcoming date overrides.</p>
        <p class="text-body-2">Add overrides for specific dates when your availability differs from normal.</p>
      </div>

      <div v-else>
        <v-list lines="two">
          <v-list-item
            v-for="override in futureOverrides"
            :key="override.id"
            :class="override.override_type === 'blocked' ? 'bg-error-lighten-5' : 'bg-success-lighten-5'"
          >
            <template #prepend>
              <v-icon :color="override.override_type === 'blocked' ? 'error' : 'success'">
                {{ override.override_type === 'blocked' ? 'mdi-calendar-remove' : 'mdi-calendar-plus' }}
              </v-icon>
            </template>

            <v-list-item-title>
              {{ formatDate(override.override_date) }}
              <v-chip
                size="x-small"
                :color="override.override_type === 'blocked' ? 'error' : 'success'"
                class="ml-2"
              >
                {{ override.override_type === 'blocked' ? 'Blocked' : 'Extra Availability' }}
              </v-chip>
            </v-list-item-title>

            <v-list-item-subtitle>
              <template v-if="override.start_time && override.end_time">
                {{ formatTimeRange(override.start_time, override.end_time) }}
              </template>
              <template v-else>All Day</template>
              <span v-if="override.reason" class="ml-2"> - {{ override.reason }}</span>
            </v-list-item-subtitle>

            <template #append>
              <v-btn aria-label="Delete override" icon variant="text" size="small" color="error" @click="confirmDelete(override)">
                <v-icon>mdi-delete</v-icon>
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </div>

      <v-expansion-panels v-if="pastOverrides.length > 0" class="mt-4" variant="accordion">
        <v-expansion-panel>
          <v-expansion-panel-title>
            Past Overrides ({{ pastOverrides.length }})
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-list density="compact">
              <v-list-item
                v-for="override in pastOverrides"
                :key="override.id"
                class="text-medium-emphasis"
              >
                <template #prepend>
                  <v-icon size="small" :color="override.override_type === 'blocked' ? 'error' : 'success'">
                    {{ override.override_type === 'blocked' ? 'mdi-calendar-remove' : 'mdi-calendar-plus' }}
                  </v-icon>
                </template>
                <v-list-item-title>
                  {{ formatDate(override.override_date) }} -
                  {{ override.override_type === 'blocked' ? 'Blocked' : 'Available' }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>

    <!-- Add Override Dialog -->
    <v-dialog v-model="showAddDialog" max-width="500" persistent>
      <v-card>
        <v-card-title>Add Date Override</v-card-title>

        <v-divider />

        <v-card-text>
          <v-form ref="formRef" v-model="formValid">
            <!-- Date Picker with Menu -->
            <v-menu
              v-model="dateMenu"
              :close-on-content-click="false"
              location="bottom start"
            >
              <template #activator="{ props }">
                <v-text-field
                  v-bind="props"
                  :model-value="formattedDate"
                  label="Date"
                  readonly
                  :rules="[rules.required]"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-calendar"
                  class="mb-4"
                  placeholder="Select a date"
                />
              </template>
              <v-date-picker
                v-model="form.override_date"
                :min="minDate"
                @update:model-value="dateMenu = false"
              />
            </v-menu>

            <v-btn-toggle
              v-model="form.override_type"
              mandatory
              color="primary"
              class="mb-4"
            >
              <v-btn value="blocked">
                <v-icon start>mdi-calendar-remove</v-icon>
                Blocked
              </v-btn>
              <v-btn value="available">
                <v-icon start>mdi-calendar-plus</v-icon>
                Extra Available
              </v-btn>
            </v-btn-toggle>

            <v-switch
              v-model="form.all_day"
              label="All Day"
              color="primary"
              class="mb-4"
            />

            <v-row v-if="!form.all_day">
              <v-col cols="6">
                <v-text-field
                  v-model="form.start_time"
                  label="Start Time"
                  type="time"
                  :rules="form.all_day ? [] : [rules.required]"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model="form.end_time"
                  label="End Time"
                  type="time"
                  :rules="form.all_day ? [] : [rules.required, rules.endAfterStart]"
                  variant="outlined"
                  density="comfortable"
                />
              </v-col>
            </v-row>

            <v-textarea
              v-model="form.reason"
              label="Reason (Optional)"
              rows="2"
              variant="outlined"
              density="comfortable"
              placeholder="e.g., Vacation, Doctor appointment"
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
            :disabled="!formValid || !form.override_date"
            @click="saveOverride"
          >
            Add Override
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Override</v-card-title>
        <v-card-text>
          Are you sure you want to delete this date override?
          <div v-if="deletingOverride" class="mt-2 text-medium-emphasis">
            <strong>{{ formatDate(deletingOverride.override_date) }}</strong>
            - {{ deletingOverride.override_type === 'blocked' ? 'Blocked' : 'Extra Available' }}
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
import { useAvailabilityStore, formatTimeRange, type AvailabilityOverride } from '@/stores/availability'
import { useFormRules } from '@/composables/useFormRules'

const store = useAvailabilityStore()

const formRef = ref()
const formValid = ref(false)
const showAddDialog = ref(false)
const showDeleteDialog = ref(false)
const dateMenu = ref(false)
const saving = ref(false)
const deleting = ref(false)
const deletingOverride = ref<AvailabilityOverride | null>(null)

const form = ref({
  override_date: null as Date | null,
  override_type: 'blocked' as 'blocked' | 'available',
  all_day: true,
  start_time: '09:00',
  end_time: '17:00',
  reason: '',
})

// Minimum date is today
const minDate = computed(() => {
  const today = new Date()
  return today.toISOString().split('T')[0]
})

// Format the selected date for display
const formattedDate = computed(() => {
  if (!form.value.override_date) return ''
  const date = new Date(form.value.override_date)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})

const rules = {
  ...useFormRules(),
  endAfterStart: () => {
    if (!form.value.start_time || !form.value.end_time) return true
    return form.value.end_time > form.value.start_time || 'End time must be after start time'
  },
}

// Computed from store
const loading = computed(() => store.loading)
const error = computed({
  get: () => store.error,
  set: (v) => { store.error = v },
})

const futureOverrides = computed(() => store.futureOverrides)

const pastOverrides = computed(() => {
  const today = new Date().toISOString().split('T')[0]!
  return store.overrides.filter((o) => o.override_date < today).sort((a, b) => b.override_date.localeCompare(a.override_date))
})

onMounted(async () => {
  if (store.overrides.length === 0) {
    await store.fetchOverrides()
  }
})

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function confirmDelete(override: AvailabilityOverride) {
  deletingOverride.value = override
  showDeleteDialog.value = true
}

function closeDialog() {
  showAddDialog.value = false
  dateMenu.value = false
  form.value = {
    override_date: null,
    override_type: 'blocked',
    all_day: true,
    start_time: '09:00',
    end_time: '17:00',
    reason: '',
  }
}

async function saveOverride() {
  if (!formValid.value || !form.value.override_date) return

  saving.value = true
  try {
    // Convert Date to YYYY-MM-DD string
    const date = new Date(form.value.override_date)
    const dateStr = date.toISOString().split('T')[0]!

    const payload = {
      override_date: dateStr,
      override_type: form.value.override_type,
      start_time: form.value.all_day ? null : form.value.start_time + ':00',
      end_time: form.value.all_day ? null : form.value.end_time + ':00',
      reason: form.value.reason || null,
    }

    await store.createOverride(payload)
    closeDialog()
  } catch {
    // Error handled by store
  } finally {
    saving.value = false
  }
}

async function performDelete() {
  if (!deletingOverride.value) return

  deleting.value = true
  try {
    await store.deleteOverride(deletingOverride.value.id)
    showDeleteDialog.value = false
    deletingOverride.value = null
  } catch {
    // Error handled by store
  } finally {
    deleting.value = false
  }
}
</script>
