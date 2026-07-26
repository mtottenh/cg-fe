<template>
  <v-card>
    <v-card-title class="d-flex align-center ga-2">
      <v-icon icon="mdi-tire" />
      The Wheel
      <v-chip size="small" variant="tonal" color="primary">
        Map {{ nextGameNumber }} of {{ mapsRequired }}
      </v-chip>
      <v-spacer />
      <v-chip v-if="spinning" size="small" color="warning" variant="tonal">
        Spinning…
      </v-chip>
    </v-card-title>

    <v-card-text>
      <v-alert
        v-if="segments.length === 0"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        Waiting for the wheel…
      </v-alert>

      <template v-else>
        <WheelSpinner
          :segments="segments"
          :spin="activeSpin"
          @settled="onSettled"
        />

        <!-- Weighted legend: who nominated what -->
        <div class="d-flex flex-wrap ga-2 mt-4 justify-center">
          <v-chip
            v-for="segment in segments"
            :key="segment.map_id"
            size="small"
            variant="tonal"
            :data-testid="`wheel-segment-${segment.map_id}`"
          >
            {{ formatMapName(segment.map_id) }}
            <template v-if="segment.weight > 1"> ×{{ segment.weight }}</template>
            <v-tooltip
              v-if="segment.nominated_by.length > 0"
              activator="parent"
              location="top"
            >
              Nominated by {{ segment.nominated_by.join(', ') }}
            </v-tooltip>
          </v-chip>
        </div>

        <div class="d-flex justify-center mt-4">
          <v-btn
            v-if="canSpin"
            color="primary"
            size="large"
            prepend-icon="mdi-rotate-right"
            :loading="spinPending"
            :disabled="spinning"
            data-testid="wheel-spin-button"
            @click="emit('spin')"
          >
            Spin the wheel
          </v-btn>
          <div v-else class="text-body-2 text-medium-emphasis">
            Waiting for the creator or a captain to spin…
          </div>
        </div>
      </template>

      <!-- Results so far -->
      <v-timeline v-if="results.length > 0" density="compact" side="end" class="mt-4">
        <v-timeline-item
          v-for="result in results"
          :key="result.game_number"
          dot-color="success"
          size="small"
        >
          <span class="text-body-2">
            Map {{ result.game_number }}:
            <strong>{{ formatMapName(result.winner_map_id) }}</strong>
          </span>
        </v-timeline-item>
      </v-timeline>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
/**
 * Wheel-mode map selection panel. The parent owns the socket and the spin
 * action; this panel renders the wheel, plays incoming spin animations, and
 * lists the maps already drawn.
 */
import { computed, ref, watch } from 'vue'
import WheelSpinner from '@/components/pug/WheelSpinner.vue'
import type { WheelSegmentInput } from '@/utils/wheel'
import { formatMapName } from '@/utils/maps'

export interface WheelSpinPlayback {
  game_number: number
  segments: WheelSegmentInput[]
  winner_map_id: string
  spin_seed: number
  duration_ms: number
}

export interface WheelResult {
  game_number: number
  winner_map_id: string
}

const props = defineProps<{
  /** Current segments (remaining maps with weights). */
  segments: WheelSegmentInput[]
  /** Maps drawn so far, in order. */
  results: WheelResult[]
  mapsRequired: number
  canSpin: boolean
  spinPending: boolean
  /** Set when a spin frame arrives; the panel plays it then clears. */
  playback: WheelSpinPlayback | null
}>()

const emit = defineEmits<{
  spin: []
  /** Animation finished — parent may refetch/advance state. */
  settled: [winnerMapId: string]
}>()

const spinning = ref(false)
const activeSpin = ref<{ winnerMapId: string; spinSeed: number; durationMs: number } | null>(null)

const nextGameNumber = computed(() => props.results.length + 1)

watch(
  () => props.playback,
  (playback) => {
    if (!playback) return
    spinning.value = true
    activeSpin.value = {
      winnerMapId: playback.winner_map_id,
      spinSeed: playback.spin_seed,
      durationMs: playback.duration_ms,
    }
  }
)

function onSettled(winnerMapId: string): void {
  spinning.value = false
  activeSpin.value = null
  emit('settled', winnerMapId)
}
</script>
