<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <div class="d-flex align-center">
        <h3 class="text-h6 mr-4">Teams</h3>
        <v-select
          aria-label="Season"
          :model-value="selectedSeasonId"
          @update:model-value="$emit('update:selected-season-id', $event)"
          :items="seasons"
          item-title="name"
          item-value="id"
          label="Season"
          density="compact"
          variant="outlined"
          style="min-width: 200px"
          hide-details
        />
      </div>
      <div class="d-flex align-center ga-4">
        <v-switch
          :model-value="includeArchived"
          @update:model-value="$emit('update:include-archived', !!$event)"
          label="Show archived"
          density="compact"
          hide-details
          color="primary"
        />
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-plus"
          :disabled="!selectedSeasonId"
          @click="$emit('create')"
        >
          Create Team
        </v-btn>
      </div>
    </div>

    <v-alert v-if="!selectedSeasonId" type="info" variant="tonal" class="mb-4">
      Select a season to view and manage teams.
    </v-alert>

    <div v-else-if="loading" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-data-table
      v-else
      :headers="headers"
      :items="teams"
      :items-per-page="10"
      class="elevation-1"
    >
      <template v-slot:item.team_logo_url="{ item }">
        <v-avatar size="32" rounded="sm">
          <v-img :alt="item.team_name ?? ''" v-if="item.team_logo_url" :src="item.team_logo_url" />
          <v-icon v-else>mdi-shield</v-icon>
        </v-avatar>
      </template>

      <template v-slot:item.team_name="{ item }">
        <div>
          <div class="font-weight-medium">{{ item.team_name }}</div>
          <div class="text-caption text-medium-emphasis">[{{ item.team_tag }}]</div>
        </div>
      </template>

      <template v-slot:item.team_status="{ item }">
        <v-chip
          :color="getTeamStatusColor(item.team_status)"
          size="small"
          variant="flat"
        >
          {{ formatStatus(item.team_status) }}
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

      <template v-slot:item.roster="{ item }">
        <div class="d-flex align-center">
          <span class="mr-2">{{ item.active_member_count }}</span>
          <v-progress-linear
            :model-value="getRosterFillPercent(item)"
            :color="getRosterFillColor(item)"
            height="6"
            rounded
            style="max-width: 60px"
          />
          <span class="ml-2 text-caption text-medium-emphasis">
            / {{ item.team_size_max || '?' }}
          </span>
        </div>
      </template>

      <template v-slot:item.breakdown="{ item }">
        <div class="text-caption">
          <span title="Captains">C: {{ item.captain_count }}</span>
          <span class="mx-1">|</span>
          <span title="Players">P: {{ item.player_count }}</span>
          <span class="mx-1">|</span>
          <span title="Substitutes">S: {{ item.substitute_count }}</span>
        </div>
      </template>

      <template v-slot:item.actions="{ item }">
        <v-btn aria-label="Manage team"
          icon
          size="small"
          variant="text"
          @click="$emit('manage', item)"
          title="Manage Team"
        >
          <v-icon>mdi-cog</v-icon>
        </v-btn>
        <v-btn
          v-if="canMove"
          aria-label="Move team to another league"
          icon
          size="small"
          variant="text"
          title="Move to another league"
          @click="$emit('move', item)"
        >
          <v-icon>mdi-swap-horizontal</v-icon>
        </v-btn>
        <v-btn
          :aria-label="item.archived_at ? 'Restore team' : 'Archive team'"
          icon
          size="small"
          variant="text"
          :title="item.archived_at
            ? 'Restore Team'
            : 'Archive Team (hides it from players; nothing is deleted)'"
          @click="$emit('set-archived', item, !item.archived_at)"
        >
          <v-icon>{{ item.archived_at ? 'mdi-restore' : 'mdi-archive-arrow-down' }}</v-icon>
        </v-btn>
      </template>

      <template v-slot:no-data>
        <div class="text-center pa-8">
          <v-icon size="48" color="grey-lighten-1">mdi-account-group-outline</v-icon>
          <p class="text-medium-emphasis mt-2">No teams registered for this season</p>
          <v-btn
            color="primary"
            variant="tonal"
            prepend-icon="mdi-plus"
            class="mt-4"
            @click="$emit('create')"
          >
            Create First Team
          </v-btn>
        </div>
      </template>
    </v-data-table>
  </div>
</template>

<script setup lang="ts">
import type { LeagueSeasonResponse } from '@/stores/leagueSeasons'
import type { LeagueTeamSummaryResponse } from '@/stores/leagueTeams'
import { teamStatusMap, getStatusColor, getStatusLabel } from '@/utils/statusMaps'

type LeagueSeason = LeagueSeasonResponse
type LeagueTeamSummary = LeagueTeamSummaryResponse

defineProps<{
  leagueId: string
  seasons: LeagueSeason[]
  selectedSeasonId: string | null
  teams: LeagueTeamSummary[]
  loading: boolean
  includeArchived: boolean
  /** Moving a team between leagues is a platform-admin action; the control
   *  is hidden for everyone else rather than 403-ing on click. */
  canMove: boolean
}>()

defineEmits<{
  'update:selected-season-id': [value: string | null]
  'update:include-archived': [value: boolean]
  create: []
  manage: [team: LeagueTeamSummary]
  'set-archived': [team: LeagueTeamSummary, archived: boolean]
  move: [team: LeagueTeamSummary]
  refresh: []
}>()

const headers = [
  { title: '', key: 'team_logo_url', width: '50px', sortable: false },
  { title: 'Team', key: 'team_name' },
  { title: 'Status', key: 'team_status', width: '120px' },
  { title: 'Roster', key: 'roster', width: '140px', sortable: false },
  { title: 'Breakdown', key: 'breakdown', width: '140px', sortable: false },
  { title: 'Actions', key: 'actions', width: '160px', sortable: false, align: 'center' as const },
]

const formatStatus = (status: string) => getStatusLabel(teamStatusMap, status)
const getTeamStatusColor = (status: string) => getStatusColor(teamStatusMap, status)

function getRosterFillPercent(team: LeagueTeamSummary): number {
  if (!team.team_size_max) return 0
  return Math.min((team.active_member_count / team.team_size_max) * 100, 100)
}

function getRosterFillColor(team: LeagueTeamSummary): string {
  const percent = getRosterFillPercent(team)
  if (percent >= 100) return 'success'
  if (percent >= 60) return 'info'
  if (percent >= 30) return 'warning'
  return 'error'
}
</script>
