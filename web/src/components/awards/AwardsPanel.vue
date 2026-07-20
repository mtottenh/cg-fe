<template>
  <div data-testid="awards-panel">
    <div v-if="initialLoading" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" size="40" />
      <p class="text-grey mt-4">Loading awards...</p>
    </div>

    <template v-else>
      <v-row v-if="visibleAwards.length > 0">
        <v-col
          v-for="award in visibleAwards"
          :key="award.id"
          cols="12"
          sm="6"
          lg="4"
        >
          <AwardCard
            :award="award"
            :entries="standings[award.id]?.entries"
            :loading="standingsLoadingIds.has(award.id)"
            :current-player-id="currentPlayerId"
          />
        </v-col>
      </v-row>

      <div v-else class="text-center pa-8" data-testid="awards-empty">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-trophy-outline</v-icon>
        <h3 class="text-h6 mb-2">No Awards Yet</h3>
        <p class="text-grey">
          Organizers can create stat awards - from templates like "Headshot Machine"
          or fully custom - and they'll show up here with live standings.
        </p>
      </div>

      <v-alert
        v-if="awardsStore.fetchAwardsState.error"
        type="error"
        class="mt-4"
        closable
        @click:close="awardsStore.fetchAwardsState.error = null"
      >
        {{ awardsStore.fetchAwardsState.error }}
      </v-alert>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAwardsStore, type AwardScopeType } from '@/stores/awards'
import { useAuthStore } from '@/stores/auth'
import AwardCard from './AwardCard.vue'

const props = defineProps<{
  scopeType: AwardScopeType
  scopeId: string
}>()

const awardsStore = useAwardsStore()
const authStore = useAuthStore()
const { standings } = storeToRefs(awardsStore)

const initialLoading = ref(false)
const standingsLoadingIds = ref(new Set<string>())

const currentPlayerId = computed(() => authStore.playerId)

const visibleAwards = computed(() =>
  awardsStore.awards.filter(
    (a) => a.scope_type === props.scopeType && a.scope_id === props.scopeId && a.status !== 'void',
  ),
)

async function fetchData() {
  if (!props.scopeId) return
  initialLoading.value = true
  try {
    const awards = await awardsStore.fetchAwards(props.scopeType, props.scopeId)
    const active = awards.filter((a) => a.status !== 'void')
    standingsLoadingIds.value = new Set(active.map((a) => a.id))
    await Promise.allSettled(
      active.map(async (award) => {
        try {
          await awardsStore.fetchStandings(props.scopeType, props.scopeId, award.id, 50)
        } finally {
          standingsLoadingIds.value.delete(award.id)
          standingsLoadingIds.value = new Set(standingsLoadingIds.value)
        }
      }),
    )
  } catch {
    // Error captured in store state
  } finally {
    initialLoading.value = false
  }
}

watch(() => [props.scopeType, props.scopeId], fetchData)
onMounted(fetchData)

defineExpose({ refresh: fetchData })
</script>
