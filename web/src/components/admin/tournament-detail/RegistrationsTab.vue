<template>
  <v-card-text>
    <v-data-table
      :headers="headers"
      :items="registrations"
      :loading="loading"
      density="comfortable"
    >
      <template v-slot:item.participant_logo_url="{ item }">
        <v-avatar size="32" rounded="sm">
          <v-img :alt="item.participant_name ?? ''" v-if="item.participant_logo_url" :src="item.participant_logo_url" />
          <v-icon v-else>mdi-account</v-icon>
        </v-avatar>
      </template>

      <template v-slot:item.participant_name="{ item }">
        <div class="font-weight-medium">{{ item.participant_name }}</div>
      </template>

      <template v-slot:item.status="{ item }">
        <v-chip :color="getStatusColor(item.status)" size="small">
          {{ item.status }}
        </v-chip>
      </template>

      <template v-slot:item.checked_in="{ item }">
        <v-icon v-if="item.checked_in" color="success">mdi-check-circle</v-icon>
        <v-icon v-else color="grey">mdi-circle-outline</v-icon>
      </template>

      <template v-slot:item.seed="{ item }">
        {{ item.seed || '-' }}
      </template>

      <template v-slot:item.registered_at="{ item }">
        {{ formatDateTime(item.registered_at) }}
      </template>

      <template v-slot:item.actions="{ item }">
        <div class="d-flex ga-1">
          <!-- Pending: Approve / Reject -->
          <template v-if="item.status === 'pending'">
            <v-btn
              color="success"
              size="small"
              variant="tonal"
              :loading="actionLoadingId === item.id"
              :disabled="actionLoadingId !== null && actionLoadingId !== item.id"
              @click="$emit('approve', item)"
            >
              Approve
            </v-btn>
            <v-btn
              color="warning"
              size="small"
              variant="tonal"
              :disabled="actionLoadingId !== null"
              @click="$emit('reject', item)"
            >
              Reject
            </v-btn>
          </template>

          <!-- Approved: Admin Check-In + Disqualify -->
          <template v-else-if="item.status === 'approved'">
            <v-btn
              v-if="checkInRequired"
              color="info"
              size="small"
              variant="tonal"
              :loading="actionLoadingId === item.id"
              :disabled="actionLoadingId !== null && actionLoadingId !== item.id"
              @click="$emit('admin-check-in', item)"
            >
              Check In
            </v-btn>
            <v-btn
              color="error"
              size="small"
              variant="tonal"
              :disabled="actionLoadingId !== null"
              @click="$emit('disqualify', item)"
            >
              Disqualify
            </v-btn>
          </template>

          <!-- Checked-in / Active: Disqualify only -->
          <template v-else-if="['checked_in', 'active'].includes(item.status)">
            <v-btn
              color="error"
              size="small"
              variant="tonal"
              :disabled="actionLoadingId !== null"
              @click="$emit('disqualify', item)"
            >
              Disqualify
            </v-btn>
          </template>

          <!-- Terminal states: No actions -->
          <span v-else class="text-medium-emphasis text-caption">-</span>
        </div>
      </template>

      <template v-slot:no-data>
        <div class="text-center pa-4">
          <p class="text-medium-emphasis">No registrations yet</p>
        </div>
      </template>
    </v-data-table>
  </v-card-text>
</template>

<script setup lang="ts">
import type { TournamentRegistrationResponse } from '@/stores/tournaments'
import { formatDateTime } from '@/utils/formatters'
import { registrationStatusMap, getStatusColor as mapStatusColor } from '@/utils/statusMaps'

defineProps<{
  registrations: TournamentRegistrationResponse[]
  loading: boolean
  checkInRequired: boolean
  actionLoadingId: string | null
}>()

defineEmits<{
  approve: [registration: TournamentRegistrationResponse]
  reject: [registration: TournamentRegistrationResponse]
  disqualify: [registration: TournamentRegistrationResponse]
  'admin-check-in': [registration: TournamentRegistrationResponse]
}>()

const headers = [
  { title: '', key: 'participant_logo_url', width: '50px', sortable: false },
  { title: 'Participant', key: 'participant_name' },
  { title: 'Status', key: 'status', width: '120px' },
  { title: 'Checked In', key: 'checked_in', width: '100px' },
  { title: 'Seed', key: 'seed', width: '80px' },
  { title: 'Registered', key: 'registered_at', width: '150px' },
  { title: 'Actions', key: 'actions', width: '200px', sortable: false },
]

const getStatusColor = (status: string) => mapStatusColor(registrationStatusMap, status)
</script>
