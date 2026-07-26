<template>
  <v-row dense>
    <v-col v-for="team in [1, 2] as const" :key="team" cols="12" md="4">
      <v-card variant="tonal" :color="team === 1 ? 'primary' : 'orange-darken-2'">
        <v-card-title class="d-flex align-center ga-2 text-subtitle-1">
          Team {{ team }}
          <v-chip size="x-small" variant="flat">
            {{ teamPlayers(team).length }}/{{ teamSize }}
          </v-chip>
          <v-spacer />
          <v-btn
            v-if="editable && !onTeam(team) && teamPlayers(team).length < teamSize"
            size="small"
            variant="text"
            prepend-icon="mdi-account-plus"
            :data-testid="`join-team-${team}`"
            @click="emit('join-team', team)"
          >
            Join
          </v-btn>
        </v-card-title>
        <v-card-text>
          <PugPlayerRow
            v-for="player in teamPlayers(team)"
            :key="player.player_id"
            :player="player"
            :is-creator="isCreator"
            :editable="editable"
            @kick="emit('kick', player.player_id)"
            @toggle-captain="emit('toggle-captain', player.player_id, !player.is_captain)"
            @move="(team) => emit('move', player.player_id, team)"
          />
          <div
            v-if="teamPlayers(team).length === 0"
            class="text-body-2 text-medium-emphasis text-center py-2"
          >
            No players yet
          </div>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" md="4">
      <v-card variant="outlined">
        <v-card-title class="d-flex align-center ga-2 text-subtitle-1">
          Bench
          <v-spacer />
          <v-btn
            v-if="editable && myTeam !== null"
            size="small"
            variant="text"
            prepend-icon="mdi-seat-outline"
            data-testid="join-bench"
            @click="emit('join-team', null)"
          >
            Sit out
          </v-btn>
        </v-card-title>
        <v-card-text>
          <div v-for="player in benchPlayers" :key="player.player_id" class="d-flex align-center">
            <PugPlayerRow
              class="flex-grow-1"
              :player="player"
              :is-creator="isCreator"
              :editable="editable"
              @kick="emit('kick', player.player_id)"
              @toggle-captain="emit('toggle-captain', player.player_id, !player.is_captain)"
              @move="(team) => emit('move', player.player_id, team)"
            />
            <v-btn
              v-if="editable && canDraft"
              size="x-small"
              variant="tonal"
              color="primary"
              :data-testid="`draft-${player.player_id}`"
              @click="emit('draft', player.player_id)"
            >
              Draft
            </v-btn>
          </div>
          <div
            v-if="benchPlayers.length === 0"
            class="text-body-2 text-medium-emphasis text-center py-2"
          >
            Empty bench
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PugPlayerRow from '@/components/pug/PugPlayerRow.vue'
import type { components } from '@/api/types'

type PugPlayerResponse = components['schemas']['PugPlayerResponse']

const props = defineProps<{
  players: PugPlayerResponse[]
  teamSize: number
  myPlayerId: string | null
  isCreator: boolean
  /** Team changes allowed (gathering only). */
  editable: boolean
}>()

/**
 * Captains draft: the team with fewer players picks (tie: team 1). The
 * button shows for the picking team's captain and the creator; the backend
 * enforces the same rule.
 */
const canDraft = computed(() => {
  if (props.isCreator) return true
  const count = (team: number) => props.players.filter((p) => p.team === team).length
  const picking = count(1) <= count(2) ? 1 : 2
  return props.players.some(
    (p) => p.player_id === props.myPlayerId && p.is_captain && p.team === picking
  )
})

const emit = defineEmits<{
  'join-team': [team: 1 | 2 | null]
  kick: [playerId: string]
  'toggle-captain': [playerId: string, isCaptain: boolean]
  move: [playerId: string, team: 1 | 2 | null]
  draft: [playerId: string]
}>()

const myTeam = computed<number | null>(() => {
  const me = props.players.find((p) => p.player_id === props.myPlayerId)
  return me?.team ?? null
})

function teamPlayers(team: 1 | 2): PugPlayerResponse[] {
  return props.players.filter((p) => p.team === team)
}

const benchPlayers = computed(() => props.players.filter((p) => p.team == null))

function onTeam(team: 1 | 2): boolean {
  return myTeam.value === team
}
</script>
