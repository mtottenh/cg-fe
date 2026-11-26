<template>
  <v-card class="mb-4" data-testid="team-delegates-card">
    <v-card-title>
      <v-icon start>mdi-account-key</v-icon>
      Match delegates
      <v-chip size="small" class="ml-2">{{ activeDelegates.length }}</v-chip>
    </v-card-title>
    <v-card-text>
      <p class="text-body-2 text-medium-emphasis mb-3">
        Only the captain can agree match times, check the team in and run the
        map veto. A delegate can do all three for the team, so a match is not
        stuck when the captain is away.
      </p>
      <v-progress-linear v-if="vetoStore.fetchDelegatesState.loading" indeterminate class="mb-2" />
      <v-alert
        v-if="vetoStore.fetchDelegatesState.error"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-2"
      >
        {{ vetoStore.fetchDelegatesState.error }}
      </v-alert>

      <v-list v-if="activeDelegates.length > 0" density="compact" class="mb-2">
        <v-list-item
          v-for="delegate in activeDelegates"
          :key="delegate.id"
          :data-testid="`team-delegate-${delegate.player_id}`"
        >
          <v-list-item-title>{{ memberName(delegate.player_id) }}</v-list-item-title>
          <v-list-item-subtitle>
            Can schedule, check in and veto for the team
          </v-list-item-subtitle>
          <template v-slot:append>
            <v-btn
              :aria-label="`Remove ${memberName(delegate.player_id)} as a delegate`"
              size="small"
              variant="text"
              color="error"
              :loading="revokingId === delegate.id"
              @click="revoke(delegate.id, delegate.player_id)"
            >
              Remove
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
      <p v-else-if="!vetoStore.fetchDelegatesState.loading" class="text-body-2 mb-3" data-testid="team-delegates-empty">
        No delegates yet.
      </p>

      <div class="d-flex align-center ga-2">
        <v-select
          v-model="selectedPlayerId"
          aria-label="Player to make a delegate"
          :items="candidates"
          item-title="display_name"
          item-value="player_id"
          label="Add a delegate"
          variant="outlined"
          density="compact"
          hide-details
          :no-data-text="'Every roster member is already a captain or delegate'"
          data-testid="team-delegate-select"
        />
        <v-btn
          color="primary"
          :disabled="!selectedPlayerId"
          :loading="vetoStore.createDelegateState.loading"
          data-testid="team-delegate-add"
          @click="add"
        >
          Add
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useVetoStore } from '@/stores/veto'

interface RosterMember {
  player_id: string
  display_name: string
  role: string
  status: string
}

/**
 * Captain/owner control for a team's match delegates.
 *
 * Delegations are made for the whole team season (no tournament scope), so a
 * delegate can act in every tournament the team is entered in.
 */
const props = defineProps<{
  leagueId: string
  teamId: string
  teamSeasonId: string
  members: RosterMember[]
}>()

const vetoStore = useVetoStore()
const feedback = useActionFeedback()

const selectedPlayerId = ref<string | null>(null)
const revokingId = ref<string | null>(null)

const activeDelegates = computed(() => vetoStore.delegates.filter((d) => d.is_active))

/** Active roster members who are not already able to act for the team. */
const candidates = computed(() => {
  const delegated = new Set(activeDelegates.value.map((d) => d.player_id))
  return props.members.filter(
    (m) => m.status === 'active' && m.role !== 'captain' && !delegated.has(m.player_id),
  )
})

function memberName(playerId: string): string {
  return props.members.find((m) => m.player_id === playerId)?.display_name ?? 'Former member'
}

watch(
  () => props.teamSeasonId,
  (id) => {
    // Failure is shown inline in the card.
    if (id) void vetoStore.fetchDelegates(props.leagueId, props.teamId, id).catch(() => null)
  },
  { immediate: true },
)

async function add() {
  const playerId = selectedPlayerId.value
  if (!playerId) return
  const name = memberName(playerId)
  const created = await feedback.run(
    () => vetoStore.createDelegate(props.leagueId, props.teamId, props.teamSeasonId, { player_id: playerId }),
    {
      success: `${name} can now schedule, check in and veto for the team`,
      errorSource: vetoStore.createDelegateState,
    },
  )
  if (created) selectedPlayerId.value = null
}

async function revoke(delegateId: string, playerId: string) {
  revokingId.value = delegateId
  try {
    await feedback.run(
      () => vetoStore.revokeDelegate(props.leagueId, props.teamId, props.teamSeasonId, delegateId),
      {
        success: `${memberName(playerId)} is no longer a delegate`,
        errorSource: vetoStore.revokeDelegateState,
      },
    )
  } finally {
    revokingId.value = null
  }
}
</script>
