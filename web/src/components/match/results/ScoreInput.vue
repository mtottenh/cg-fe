<template>
  <div class="score-input">
    <div class="game-label d-flex align-center mb-2">
      <v-chip size="small" :color="gameColor" variant="flat">
        {{ gameLabel }}
      </v-chip>
      <span v-if="mapName" class="text-caption text-medium-emphasis ml-2">{{ mapName }}</span>
    </div>

    <div class="score-row d-flex align-center">
      <span class="team-name text-body-2" :class="{ 'text-success font-weight-bold': team1Wins }">
        {{ teamAName }}
      </span>

      <v-text-field
        v-model.number="localTeamAScore"
        :aria-label="`${teamAName} score, game ${gameNumber}`"
        type="number"
        min="0"
        max="99"
        density="compact"
        variant="outlined"
        hide-details
        class="score-field mx-2"
        :disabled="disabled"
        @update:model-value="emitTeamAScore"
      />

      <span class="vs text-medium-emphasis">-</span>

      <v-text-field
        v-model.number="localTeamBScore"
        :aria-label="`${teamBName} score, game ${gameNumber}`"
        type="number"
        min="0"
        max="99"
        density="compact"
        variant="outlined"
        hide-details
        class="score-field mx-2"
        :disabled="disabled"
        @update:model-value="emitTeamBScore"
      />

      <span class="team-name text-body-2" :class="{ 'text-success font-weight-bold': team2Wins }">
        {{ teamBName }}
      </span>
    </div>

    <div v-if="showValidation && hasValidationError" class="validation-error mt-1">
      <span class="text-caption text-error">{{ validationError }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    gameNumber: number
    teamAName: string
    teamBName: string
    teamAScore: number
    teamBScore: number
    mapName?: string
    disabled?: boolean
    showValidation?: boolean
    allowTies?: boolean
  }>(),
  {
    mapName: undefined,
    disabled: false,
    showValidation: true,
    allowTies: false,
  }
)

const emit = defineEmits<{
  'update:teamAScore': [score: number]
  'update:teamBScore': [score: number]
}>()

const localTeamAScore = ref(props.teamAScore)
const localTeamBScore = ref(props.teamBScore)

// Watch for prop changes
watch(
  () => props.teamAScore,
  (v) => (localTeamAScore.value = v)
)
watch(
  () => props.teamBScore,
  (v) => (localTeamBScore.value = v)
)

// Computed
const gameLabel = computed(() => `Map ${props.gameNumber}`)

const team1Wins = computed(() => localTeamAScore.value > localTeamBScore.value)
const team2Wins = computed(() => localTeamBScore.value > localTeamAScore.value)

const gameColor = computed(() => {
  if (team1Wins.value || team2Wins.value) return 'success'
  if (localTeamAScore.value === localTeamBScore.value && localTeamAScore.value > 0) return 'warning'
  return 'grey'
})

const hasValidationError = computed(() => {
  if (localTeamAScore.value < 0 || localTeamBScore.value < 0) return true
  if (!props.allowTies && localTeamAScore.value === localTeamBScore.value && localTeamAScore.value > 0) return true
  return false
})

const validationError = computed(() => {
  if (localTeamAScore.value < 0 || localTeamBScore.value < 0) {
    return 'Scores must be non-negative'
  }
  if (!props.allowTies && localTeamAScore.value === localTeamBScore.value && localTeamAScore.value > 0) {
    return 'Ties are not allowed'
  }
  return ''
})

// Emit handlers
function emitTeamAScore(value: number | string) {
  const score = typeof value === 'string' ? parseInt(value, 10) || 0 : value
  emit('update:teamAScore', Math.max(0, score))
}

function emitTeamBScore(value: number | string) {
  const score = typeof value === 'string' ? parseInt(value, 10) || 0 : value
  emit('update:teamBScore', Math.max(0, score))
}
</script>

<style scoped>
.score-input {
  margin-bottom: 16px;
}

.team-name {
  min-width: 120px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.team-name:first-of-type {
  text-align: right;
}

.team-name:last-of-type {
  text-align: left;
}

.score-field {
  max-width: 70px;
}

.score-field :deep(input) {
  text-align: center;
}

.vs {
  font-weight: bold;
  min-width: 20px;
  text-align: center;
}
</style>
