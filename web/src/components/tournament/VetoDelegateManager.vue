<template>
  <v-card variant="outlined">
    <v-card-title class="text-subtitle-1">
      <v-icon start size="small">mdi-account-switch</v-icon>
      Veto Delegates
    </v-card-title>
    <v-card-text>
      <p class="text-body-2 text-medium-emphasis mb-3">
        Designate a player to handle map veto on behalf of your team.
      </p>

      <v-progress-linear v-if="vetoStore.fetchDelegatesState.loading.value" indeterminate class="mb-2" />

      <v-list v-if="vetoStore.delegates.length > 0" density="compact">
        <v-list-item v-for="delegate in vetoStore.delegates" :key="delegate.id">
          <v-list-item-title>{{ delegate.player_id }}</v-list-item-title>
          <v-list-item-subtitle>
            {{ delegate.tournament_id ? 'This tournament only' : 'All tournaments' }}
          </v-list-item-subtitle>
          <template v-slot:append>
            <v-btn
              icon
              size="small"
              variant="text"
              color="error"
              :loading="revokingId === delegate.id"
              @click="handleRevoke(delegate.id)"
            >
              <v-icon>mdi-close</v-icon>
              <v-tooltip activator="parent" location="top">Revoke</v-tooltip>
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
      <p v-else-if="!vetoStore.fetchDelegatesState.loading.value" class="text-caption text-medium-emphasis text-center py-2">
        No delegates assigned. The captain handles veto by default.
      </p>

      <v-btn
        variant="tonal"
        size="small"
        prepend-icon="mdi-plus"
        class="mt-2"
        @click="showAddDialog = true"
      >
        Add Delegate
      </v-btn>
    </v-card-text>

    <!-- Add Delegate Dialog -->
    <v-dialog v-model="showAddDialog" max-width="400">
      <v-card>
        <v-card-title>Add Veto Delegate</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newDelegatePlayerId"
            label="Player ID"
            hint="Must be a member of this team"
            persistent-hint
          />
          <v-checkbox
            v-model="scopeToTournament"
            label="Scope to current tournament only"
            density="compact"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showAddDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="vetoStore.createDelegateState.loading.value"
            :disabled="!newDelegatePlayerId"
            @click="handleAdd"
          >
            Add
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useVetoStore } from '@/stores/veto'

const props = defineProps<{
  leagueId: string
  teamId: string
  seasonId: string
  tournamentId?: string
}>()

const vetoStore = useVetoStore()

const showAddDialog = ref(false)
const newDelegatePlayerId = ref('')
const scopeToTournament = ref(false)
const revokingId = ref<string | null>(null)

onMounted(() => {
  vetoStore.fetchDelegates(props.leagueId, props.teamId, props.seasonId)
})

async function handleAdd() {
  if (!newDelegatePlayerId.value) return
  try {
    await vetoStore.createDelegate(props.leagueId, props.teamId, props.seasonId, {
      player_id: newDelegatePlayerId.value,
      tournament_id: scopeToTournament.value ? (props.tournamentId ?? null) : null,
    })
    showAddDialog.value = false
    newDelegatePlayerId.value = ''
    scopeToTournament.value = false
  } catch {
    // Error in store
  }
}

async function handleRevoke(delegateId: string) {
  revokingId.value = delegateId
  try {
    await vetoStore.revokeDelegate(props.leagueId, props.teamId, props.seasonId, delegateId)
  } catch {
    // Error in store
  } finally {
    revokingId.value = null
  }
}
</script>
