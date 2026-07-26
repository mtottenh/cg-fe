<template>
  <v-card variant="tonal" color="purple" class="text-center pa-6">
    <v-icon size="48" class="mb-4">mdi-coin</v-icon>
    <h3 class="text-h6 mb-2">Coin Flip</h3>

    <!-- Waiting for opponent -->
    <template v-if="!bothConnected && !flipping && !result">
      <p class="text-body-2 text-medium-emphasis mb-4">
        Waiting for both teams to connect...
      </p>
      <v-progress-circular indeterminate size="32" color="purple" />
    </template>

    <!-- Coin flip animation -->
    <template v-else-if="flipping">
      <p class="text-body-2 text-medium-emphasis mb-4">Flipping coin...</p>
      <div class="coin-container">
        <div class="coin" :class="{ flipping: flipping }">
          <div class="coin-face coin-front">
            <span class="coin-label">{{ participant1Name }}</span>
          </div>
          <div class="coin-face coin-back">
            <span class="coin-label">{{ participant2Name }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Result -->
    <template v-else-if="result">
      <div class="coin-container mb-4">
        <div class="coin" :class="{ 'show-back': resultIsP2 }">
          <div class="coin-face coin-front">
            <span class="coin-label">{{ participant1Name }}</span>
          </div>
          <div class="coin-face coin-back">
            <span class="coin-label">{{ participant2Name }}</span>
          </div>
        </div>
      </div>
      <v-alert type="success" variant="tonal" density="compact">
        <strong>{{ result.winner_name }}</strong> won the coin flip!
        <strong>{{ result.first_action_name }}</strong> will act first.
      </v-alert>
    </template>

    <!-- Both connected, waiting for server -->
    <template v-else>
      <p class="text-body-2 text-medium-emphasis mb-4">
        Both teams connected. Starting coin flip...
      </p>
      <v-progress-circular indeterminate size="32" color="purple" />
    </template>
  </v-card>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import type { CoinFlipResultMessage } from '@/composables/useMatchLobbySocket'

const props = defineProps<{
  participant1Name: string
  participant2Name: string
  coinFlipResult: CoinFlipResultMessage | null
  bothConnected: boolean
}>()

const flipping = ref(false)
const result = ref<CoinFlipResultMessage | null>(null)
const resultIsP2 = ref(false)

let animationTimer: ReturnType<typeof setTimeout> | null = null

function showResult(msg: CoinFlipResultMessage) {
  flipping.value = false
  result.value = msg
  // If winner is participant2, show the back face
  resultIsP2.value = msg.winner_name === props.participant2Name
}

// `immediate` matters: a late joiner (rejoin/refresh mid-phase) mounts with
// the result already present — without it no animation ever fires and the
// component would be stuck on the waiting state.
watch(() => props.coinFlipResult, (msg, prev) => {
  if (animationTimer) {
    clearTimeout(animationTimer)
    animationTimer = null
  }
  if (!msg) return
  if (prev === undefined) {
    // Initial run for an already-known result: skip the animation.
    showResult(msg)
    return
  }
  flipping.value = true
  animationTimer = setTimeout(() => {
    animationTimer = null
    showResult(msg)
  }, 2000)
}, { immediate: true })

onUnmounted(() => {
  if (animationTimer) {
    clearTimeout(animationTimer)
    animationTimer = null
  }
})
</script>

<style scoped>
.coin-container {
  perspective: 600px;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 120px;
}

.coin {
  width: 120px;
  height: 120px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.3s ease;
}

.coin.show-back {
  transform: rotateY(180deg);
}

.coin.flipping {
  animation: coin-flip 2s ease-in-out;
}

.coin-face {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  font-weight: 600;
  font-size: 13px;
  text-align: center;
  line-height: 1.2;
  overflow: hidden;
}

.coin-front {
  background: linear-gradient(135deg, #7c4dff 0%, #b388ff 100%);
  color: white;
  border: 3px solid #651fff;
}

.coin-back {
  background: linear-gradient(135deg, #ff6d00 0%, #ffab40 100%);
  color: white;
  border: 3px solid #e65100;
  transform: rotateY(180deg);
}

.coin-label {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes coin-flip {
  0% { transform: rotateY(0deg); }
  100% { transform: rotateY(1800deg); }
}
</style>
