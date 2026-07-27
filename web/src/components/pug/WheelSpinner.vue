<template>
  <div class="wheel-wrap" :style="{ width: `${size}px` }">
    <!-- Pointer at 12 o'clock -->
    <svg class="wheel-pointer" :width="size" height="28" aria-hidden="true">
      <polygon
        :points="`${size / 2 - 12},0 ${size / 2 + 12},0 ${size / 2},24`"
        fill="rgb(var(--v-theme-primary))"
      />
    </svg>

    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${VIEWBOX} ${VIEWBOX}`"
      role="img"
      :aria-label="ariaLabel"
      data-testid="wheel-spinner"
    >
      <g
        class="wheel-disc"
        :style="discStyle"
        :transform-origin="`${CENTER} ${CENTER}`"
      >
        <path
          v-for="(segment, i) in geometry"
          :key="segment.map_id"
          :d="describeArc(CENTER, CENTER, RADIUS, segment.startDeg, segment.endDeg)"
          :fill="WHEEL_COLORS[i % WHEEL_COLORS.length]"
          stroke="rgba(0, 0, 0, 0.35)"
          stroke-width="1.5"
        />
        <!-- Labels along each segment's mid-angle -->
        <text
          v-for="segment in geometry"
          :key="`label-${segment.map_id}`"
          :x="labelPoint(segment.midDeg).x"
          :y="labelPoint(segment.midDeg).y"
          :transform="`rotate(${segment.midDeg}, ${labelPoint(segment.midDeg).x}, ${labelPoint(segment.midDeg).y})`"
          text-anchor="middle"
          class="wheel-label"
        >
          {{ formatMapName(segment.map_id) }}
        </text>
        <circle :cx="CENTER" :cy="CENTER" :r="HUB_RADIUS" class="wheel-hub" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
/**
 * The wheel. Renders weighted segments as an SVG disc; when `spin` fires it
 * rotates by the deterministic amount from `computeSpinRotation`, so every
 * client watching the lobby sees the identical animation land on the same
 * map (the server chose the winner; this is theater around that fact).
 */
import { computed, ref, watch } from 'vue'
import type { WheelSegmentInput } from '@/utils/wheel'
import { WHEEL_COLORS, computeSpinRotation, computeWheelGeometry, describeArc } from '@/utils/wheel'
import { formatMapName } from '@/utils/maps'

const VIEWBOX = 320
const CENTER = VIEWBOX / 2
const RADIUS = CENTER - 4
const HUB_RADIUS = 26
const LABEL_RADIUS = RADIUS * 0.62

const props = withDefaults(
  defineProps<{
    segments: WheelSegmentInput[]
    size?: number
    /** Set when a spin should play: the wheel animates then emits `settled`. */
    spin?: { winnerMapId: string; spinSeed: number; durationMs: number } | null
  }>(),
  { size: 320, spin: null }
)

const emit = defineEmits<{ settled: [winnerMapId: string] }>()

const geometry = computed(() => computeWheelGeometry(props.segments))
const rotation = ref(0)
const animating = ref(false)
const currentDurationMs = ref(0)

const discStyle = computed(() => ({
  transform: `rotate(${rotation.value}deg)`,
  transition: animating.value
    ? `transform ${currentDurationMs.value}ms cubic-bezier(0.12, 0.8, 0.2, 1)`
    : 'none',
}))

const ariaLabel = computed(
  () => `Map wheel with ${props.segments.length} maps: ${props.segments.map((s) => s.map_id).join(', ')}`
)

function labelPoint(midDeg: number): { x: number; y: number } {
  const rad = ((midDeg - 90) * Math.PI) / 180
  return {
    x: CENTER + LABEL_RADIUS * Math.cos(rad),
    y: CENTER + LABEL_RADIUS * Math.sin(rad),
  }
}

let settleTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.spin,
  (spin) => {
    if (!spin) return
    const delta = computeSpinRotation(props.segments, spin.winnerMapId, spin.spinSeed)
    if (delta === 0) {
      // Malformed payload (winner not on the wheel): skip the theater, the
      // authoritative veto frames still carry the result.
      emit('settled', spin.winnerMapId)
      return
    }
    // Re-baseline the current angle into [0, 360) so consecutive spins keep
    // accumulating clockwise without unwinding.
    animating.value = false
    rotation.value = rotation.value % 360
    currentDurationMs.value = spin.durationMs
    // Next frame: enable the transition and rotate.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        animating.value = true
        rotation.value += delta
      })
    })
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      animating.value = false
      emit('settled', spin.winnerMapId)
    }, spin.durationMs + 80)
  }
)
</script>

<style scoped>
.wheel-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-inline: auto;
}

.wheel-pointer {
  margin-bottom: -6px;
  z-index: 1;
}

.wheel-disc {
  will-change: transform;
}

.wheel-label {
  fill: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 600;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.5);
  stroke-width: 2px;
  user-select: none;
}

.wheel-hub {
  fill: rgb(var(--v-theme-surface));
  stroke: rgba(255, 255, 255, 0.25);
  stroke-width: 2;
}
</style>
