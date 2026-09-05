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
        <v-chip
          v-if="item.archived_at"
          color="grey"
          size="x-small"
          variant="outlined"
          class="ml-1"
        >
          Archived
        </v-chip>
      </template>

      <template v-slot:item.registration="{ item }">
        <div v-if="item.registration_start || item.registration_end || item.season_start || item.season_end" class="text-caption">
          <div v-if="item.registration_start || item.registration_end">
            Registration: {{ formatDate(item.registration_start) }} – {{ formatDate(item.registration_end) }}
          </div>
          <div v-if="item.season_start || item.season_end">
            Plays: {{ formatDate(item.season_start) }} – {{ formatDate(item.season_end) }}
          </div>
        </div>
        <span v-else class="text-warning" title="No dates set — nobody can plan around this season">No dates</span>
      </template>

      <template v-slot:item.team_size="{ item }">
        <span v-if="item.team_size_min || item.team_size_max">
          {{ item.team_size_min || '?' }} - {{ item.team_size_max || '?' }}
        </span>
        <span v-else class="text-grey-lighten-1">-</span>
      </template>

      <template v-slot:item.roster_lock_status="{ item }">
        <v-chip
          :color="rosterChipColor(item.roster_lock_status)"
          size="x-small"
          variant="flat"
          :title="rosterLockHint(item.roster_lock_status) ?? undefined"
        >
          {{ rosterChipLabel(item.roster_lock_status) }}
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
        <v-btn
          :aria-label="item.archived_at ? 'Restore season' : 'Archive season'"
          icon
          size="small"
          variant="text"
          :title="item.archived_at
            ? 'Restore Season'
            : 'Archive Season (hides it from players; nothing is deleted)'"
          @click="$emit('set-archived', item, !item.archived_at)"
        >
          <v-icon>{{ item.archived_at ? 'mdi-restore' : 'mdi-archive-arrow-down' }}</v-icon>
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
import { rosterLockColor, rosterLockHint, rosterLockLabel } from '@/utils/rosterLock'

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
  'set-archived': [season: LeagueSeason, archived: boolean]
  refresh: []
}>()

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Status', key: 'status', width: '120px' },
  { title: 'Dates', key: 'registration', width: '220px', sortable: false },
  { title: 'Team Size', key: 'team_size', width: '100px', sortable: false },
  { title: 'Roster', key: 'roster_lock_status', width: '100px' },
  { title: 'Actions', key: 'actions', width: '140px', sortable: false, align: 'center' as const },
]

const formatStatus = (status: string) => getStatusLabel(seasonStatusMap, status)
const getStatusColor = (status: string) => mapStatusColor(seasonStatusMap, status)

// ---------------------------------------------------------------------------
// Roster column (COVERAGE-PLAN §9b P-22 — a second instance of P-11)
//
// This column used to render `roster_lock_status === 'locked' ? 'Locked' : 'Open'`.
// The DB CHECK permits only open / soft_lock / hard_lock
// (api/migrations/0025_league_teams_and_seasons.sql:69), so `'locked'` can never
// occur and EVERY season — locked or not — reported "Open" to admins.
//
// `utils/rosterLock.ts` is the single mirror of the backend enum and fails
// CLOSED: a value we do not recognise is treated as `hard_lock` rather than
// silently reading as "unlocked". `rosterLockLabel` returns null for `open`
// (its callers use it as a "show a warning chip?" test); this column always
// shows a chip, so the open case supplies its own label and colour here.
// ---------------------------------------------------------------------------
const rosterChipLabel = (value: string | null | undefined) => rosterLockLabel(value) ?? 'Open'
const rosterChipColor = (value: string | null | undefined) =>
  rosterLockLabel(value) === null ? 'success' : rosterLockColor(value)

</script>
