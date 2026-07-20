<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <h3 class="text-h6">Seasons</h3>
      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-plus"
        @click="$emit('create')"
      >
        Create Season
      </v-btn>
    </div>

    <div v-if="loading" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-data-table
      v-else
      :headers="headers"
      :items="seasons"
      :items-per-page="10"
      class="elevation-1"
    >
      <template v-slot:item.name="{ item }">
        <div>
          <div class="font-weight-medium">{{ item.name }}</div>
          <div class="text-caption text-medium-emphasis">{{ item.slug }}</div>
        </div>
      </template>

      <template v-slot:item.status="{ item }">
        <v-chip
          :color="getStatusColor(item.status)"
          size="small"
          variant="flat"
        >
          {{ formatStatus(item.status) }}
        </v-chip>
      </template>

      <template v-slot:item.registration="{ item }">
        <div v-if="item.registration_start || item.registration_end" class="text-caption">
          <div v-if="item.registration_start">Start: {{ formatDate(item.registration_start) }}</div>
          <div v-if="item.registration_end">End: {{ formatDate(item.registration_end) }}</div>
        </div>
        <span v-else class="text-grey-lighten-1">-</span>
      </template>

      <template v-slot:item.team_size="{ item }">
        <span v-if="item.team_size_min || item.team_size_max">
          {{ item.team_size_min || '?' }} - {{ item.team_size_max || '?' }}
        </span>
        <span v-else class="text-grey-lighten-1">-</span>
      </template>

      <template v-slot:item.roster_lock_status="{ item }">
        <v-chip
          :color="item.roster_lock_status === 'locked' ? 'error' : 'success'"
          size="x-small"
          variant="flat"
        >
          {{ item.roster_lock_status === 'locked' ? 'Locked' : 'Open' }}
        </v-chip>
      </template>

      <template v-slot:item.actions="{ item }">
        <v-btn aria-label="Edit season"
          icon
          size="small"
          variant="text"
          @click="$emit('edit', item)"
          title="Edit Season"
        >
          <v-icon>mdi-pencil</v-icon>
        </v-btn>
        <v-btn aria-label="View teams"
          icon
          size="small"
          variant="text"
          @click="$emit('view-teams', item)"
          title="View Teams"
        >
          <v-icon>mdi-account-group</v-icon>
        </v-btn>
      </template>

      <template v-slot:no-data>
        <div class="text-center pa-8">
          <v-icon size="48" color="grey-lighten-1">mdi-calendar-blank</v-icon>
          <p class="text-medium-emphasis mt-2">No seasons yet</p>
          <v-btn
            color="primary"
            variant="tonal"
            prepend-icon="mdi-plus"
            class="mt-4"
            @click="$emit('create')"
          >
            Create First Season
          </v-btn>
        </div>
      </template>
    </v-data-table>
  </div>
</template>

<script setup lang="ts">
import { formatDate } from '@/utils/formatters'
import type { LeagueSeasonResponse } from '@/stores/leagueSeasons'
import { seasonStatusMap, getStatusColor as mapStatusColor, getStatusLabel } from '@/utils/statusMaps'

type LeagueSeason = LeagueSeasonResponse

defineProps<{
  leagueId: string
  seasons: LeagueSeason[]
  loading: boolean
}>()

defineEmits<{
  create: []
  edit: [season: LeagueSeason]
  'view-teams': [season: LeagueSeason]
  refresh: []
}>()

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Status', key: 'status', width: '120px' },
  { title: 'Registration', key: 'registration', width: '160px', sortable: false },
  { title: 'Team Size', key: 'team_size', width: '100px', sortable: false },
  { title: 'Roster', key: 'roster_lock_status', width: '100px' },
  { title: 'Actions', key: 'actions', width: '100px', sortable: false, align: 'center' as const },
]

const formatStatus = (status: string) => getStatusLabel(seasonStatusMap, status)
const getStatusColor = (status: string) => mapStatusColor(seasonStatusMap, status)

</script>
