<template>
  <v-dialog v-model="open" max-width="700">
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Ban Details</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text v-if="loading" class="text-center pa-8">
        <v-progress-circular indeterminate color="primary" />
      </v-card-text>

      <template v-else-if="ban">
        <v-card-text>
          <!-- Status Banner -->
          <v-alert
            :type="getStatusAlertType()"
            variant="tonal"
            class="mb-4"
            density="compact"
          >
            <div class="d-flex justify-space-between align-center">
              <div>
                <strong>{{ getStatusText() }}</strong>
                <span v-if="ban.is_active && ban.ends_at" class="ml-2">
                  - Expires {{ formatRelativeTime(ban.ends_at) }}
                </span>
              </div>
              <v-chip
                :color="getBanTypeColor(ban.ban_type)"
                size="small"
                variant="flat"
              >
                {{ formatBanType(ban.ban_type) }}
              </v-chip>
            </div>
          </v-alert>

          <!-- Ban Information -->
          <v-list density="compact" class="mb-4">
            <v-list-item>
              <template v-slot:prepend>
                <v-icon>mdi-account</v-icon>
              </template>
              <v-list-item-title>User ID</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">{{ ban.user_id }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item>
              <template v-slot:prepend>
                <v-icon>mdi-text</v-icon>
              </template>
              <v-list-item-title>Reason</v-list-item-title>
              <v-list-item-subtitle class="text-body-2" style="white-space: pre-wrap;">
                {{ ban.reason }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="ban.scope_type">
              <template v-slot:prepend>
                <v-icon>mdi-target</v-icon>
              </template>
              <v-list-item-title>Scope</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">
                {{ ban.scope_type }}: {{ ban.scope_id }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item>
              <template v-slot:prepend>
                <v-icon>mdi-clock-start</v-icon>
              </template>
              <v-list-item-title>Started</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">
                {{ formatDateTime(ban.starts_at) }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item>
              <template v-slot:prepend>
                <v-icon>mdi-clock-end</v-icon>
              </template>
              <v-list-item-title>{{ ban.is_permanent ? 'Duration' : 'Expires' }}</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">
                {{ ban.is_permanent ? 'Permanent' : formatDateTime(ban.ends_at!) }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="ban.issued_by">
              <template v-slot:prepend>
                <v-icon>mdi-gavel</v-icon>
              </template>
              <v-list-item-title>Issued By</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">
                {{ ban.issued_by }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>

          <!-- Lifted Information (if lifted) -->
          <v-alert
            v-if="ban.lifted_at"
            type="info"
            variant="tonal"
            class="mb-4"
          >
            <div class="font-weight-medium mb-1">Ban Lifted</div>
            <div class="text-body-2">
              <div>Lifted at: {{ formatDateTime(ban.lifted_at) }}</div>
              <div v-if="ban.lifted_by">Lifted by: {{ ban.lifted_by }}</div>
              <div v-if="ban.lift_reason">Reason: {{ ban.lift_reason }}</div>
            </div>
          </v-alert>

          <!-- User Ban History Section -->
          <v-expansion-panels v-if="!loadingHistory">
            <v-expansion-panel>
              <v-expansion-panel-title>
                <div class="d-flex align-center">
                  <v-icon class="mr-2">mdi-history</v-icon>
                  User Ban History
                  <v-chip size="x-small" class="ml-2" color="grey">
                    {{ banHistory.length }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-list v-if="banHistory.length > 0" density="compact">
                  <v-list-item
                    v-for="historyBan in banHistory"
                    :key="historyBan.id"
                    :class="{ 'bg-grey-lighten-4': historyBan.id === ban.id }"
                  >
                    <template v-slot:prepend>
                      <v-icon
                        :color="historyBan.is_active ? 'error' : 'grey'"
                        size="small"
                      >
                        {{ historyBan.is_active ? 'mdi-alert-circle' : 'mdi-check-circle' }}
                      </v-icon>
                    </template>
                    <v-list-item-title class="text-body-2">
                      {{ formatBanType(historyBan.ban_type) }}
                      <v-chip
                        v-if="historyBan.id === ban.id"
                        size="x-small"
                        color="primary"
                        class="ml-2"
                      >
                        Current
                      </v-chip>
                    </v-list-item-title>
                    <v-list-item-subtitle class="text-caption">
                      {{ formatDateTime(historyBan.starts_at) }}
                      <span v-if="historyBan.lifted_at" class="text-success">
                        - Lifted {{ formatRelativeTime(historyBan.lifted_at) }}
                      </span>
                      <span v-else-if="!historyBan.is_active && historyBan.ends_at" class="text-grey">
                        - Expired
                      </span>
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>
                <p v-else class="text-grey text-center pa-4">No other bans on record</p>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <!-- Lift Ban Form -->
          <v-expand-transition>
            <v-card v-if="showLiftForm && ban.is_active" variant="outlined" class="mt-4">
              <v-card-title class="text-subtitle-1">Lift This Ban</v-card-title>
              <v-card-text>
                <v-textarea
                  v-model="liftReason"
                  label="Reason for lifting (optional)"
                  placeholder="Explain why this ban is being lifted..."
                  variant="outlined"
                  density="compact"
                  rows="2"
                />
              </v-card-text>
              <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="showLiftForm = false">Cancel</v-btn>
                <v-btn
                  color="success"
                  variant="flat"
                  :loading="lifting"
                  @click="liftBan"
                >
                  Confirm Lift
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-expand-transition>
        </v-card-text>

        <v-divider />

        <v-card-actions>
          <v-btn
            v-if="ban.is_active && !showLiftForm"
            color="success"
            variant="tonal"
            prepend-icon="mdi-hand-back-right"
            @click="showLiftForm = true"
          >
            Lift Ban
          </v-btn>
          <v-spacer />
          <v-btn variant="text" @click="close">Close</v-btn>
        </v-card-actions>
      </template>

      <v-card-text v-else class="text-center pa-8">
        <v-icon size="64" color="grey-lighten-1">mdi-alert-circle-outline</v-icon>
        <p class="text-grey mt-2">Failed to load ban details</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useBansStore, type BanResponse } from '@/stores/bans'
import { formatDateTime } from '@/utils/formatters'

const props = defineProps<{  banId: string | null
}>()

const emit = defineEmits<{
  (e: 'updated'): void
}>()

const open = defineModel<boolean>({ required: true })

const bansStore = useBansStore()

const loading = ref(false)
const loadingHistory = ref(false)
const ban = ref<BanResponse | null>(null)
const banHistory = ref<BanResponse[]>([])
const showLiftForm = ref(false)
const liftReason = ref('')
const lifting = ref(false)

watch(open,
  async (isOpen) => {
    if (isOpen && props.banId) {
      await loadBan()
    } else {
      ban.value = null
      banHistory.value = []
      showLiftForm.value = false
      liftReason.value = ''
    }
  }
)

async function loadBan() {
  if (!props.banId) return

  loading.value = true
  loadingHistory.value = true

  try {
    ban.value = await bansStore.getBan(props.banId)

    // Load ban history for this user
    if (ban.value) {
      try {
        banHistory.value = await bansStore.getUserBanHistory(ban.value.user_id)
      } catch {
        banHistory.value = []
      }
    }
  } catch (e) {
    console.error('Failed to load ban:', e)
    ban.value = null
  } finally {
    loading.value = false
    loadingHistory.value = false
  }
}

async function liftBan() {
  if (!props.banId) return

  lifting.value = true
  try {
    await bansStore.liftBan(props.banId, liftReason.value || undefined)
    emit('updated')
    close()
  } catch (e) {
    console.error('Failed to lift ban:', e)
  } finally {
    lifting.value = false
  }
}

function close() {
  open.value = false
}

function getStatusText(): string {
  if (!ban.value) return ''
  if (ban.value.lifted_at) return 'Lifted'
  if (!ban.value.is_active && ban.value.ends_at) return 'Expired'
  if (ban.value.is_active) return 'Active'
  return 'Unknown'
}

function getStatusAlertType(): 'error' | 'warning' | 'success' | 'info' {
  if (!ban.value) return 'info'
  if (ban.value.is_active) return 'error'
  if (ban.value.lifted_at) return 'success'
  return 'warning' // expired
}

function formatBanType(type: string): string {
  const labels: Record<string, string> = {
    platform: 'Platform',
    matchmaking: 'Matchmaking',
    chat: 'Chat',
    league: 'League',
    tournament: 'Tournament',
  }
  return labels[type] || type
}

function getBanTypeColor(type: string): string {
  const colors: Record<string, string> = {
    platform: 'error',
    matchmaking: 'warning',
    chat: 'info',
    league: 'purple',
    tournament: 'orange',
  }
  return colors[type] || 'grey'
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60))
    if (diffHours === 0) {
      const diffMins = Math.round(diffMs / (1000 * 60))
      return diffMins > 0 ? `in ${diffMins} minutes` : `${Math.abs(diffMins)} minutes ago`
    }
    return diffHours > 0 ? `in ${diffHours} hours` : `${Math.abs(diffHours)} hours ago`
  }

  return diffDays > 0 ? `in ${diffDays} days` : `${Math.abs(diffDays)} days ago`
}
</script>
