<template>
  <v-navigation-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :rail="rail"
    permanent
    color="surface"
  >
    <v-list density="compact" nav>
      <!-- Home -->
      <v-list-item
        prepend-icon="mdi-view-dashboard"
        title="Dashboard"
        :to="{ name: 'home' }"
        :active="route.name === 'home'"
      />

      <v-list-subheader v-if="!rail">Browse</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-trophy"
        title="Leagues"
        :to="{ name: 'leagues' }"
        :active="route.name?.toString().startsWith('league')"
      />

      <v-list-item
        prepend-icon="mdi-tournament"
        title="Tournaments"
        :to="{ name: 'tournaments' }"
        :active="route.name?.toString().startsWith('tournament') || route.name?.toString().startsWith('match')"
      />

      <v-list-item
        prepend-icon="mdi-account-group"
        title="Players"
        :to="{ name: 'players' }"
        :active="route.name?.toString().startsWith('player')"
      />

      <v-list-subheader v-if="!rail">My Hub</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-bell-badge-outline"
        title="Action Items"
        :to="{ name: 'home' }"
        :active="false"
      >
        <template v-slot:append v-if="actionCount > 0">
          <v-badge :content="actionCount" :color="hasCriticalAction ? 'error' : 'warning'" inline />
        </template>
      </v-list-item>

      <v-list-item
        prepend-icon="mdi-shield-account"
        title="My Teams"
        :to="{ name: 'my-teams' }"
        :active="route.name === 'my-teams'"
      />

      <v-list-item
        prepend-icon="mdi-email"
        title="Invitations"
        :to="{ name: 'invitations' }"
        :active="route.name === 'invitations'"
      >
        <template v-slot:append v-if="pendingInvitationsCount > 0">
          <v-badge :content="pendingInvitationsCount" color="error" inline />
        </template>
      </v-list-item>

      <v-list-subheader v-if="!rail">Account</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-account"
        title="Profile"
        :to="{ name: 'profile' }"
        :active="route.name?.toString().startsWith('profile')"
      />
    </v-list>

    <template v-slot:append>
      <v-list density="compact" nav>
        <v-list-item
          :prepend-icon="rail ? 'mdi-chevron-right' : 'mdi-chevron-left'"
          :title="rail ? '' : 'Collapse'"
          @click="$emit('update:rail', !rail)"
        />
      </v-list>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useLeaguesStore } from '@/stores/leagues'
import { useCaptainActionsStore } from '@/stores/captainActions'

const route = useRoute()
const leagueTeamsStore = useLeagueTeamsStore()
const leaguesStore = useLeaguesStore()
const captainActionsStore = useCaptainActionsStore()
const { actionCount, hasCritical: hasCriticalAction } = storeToRefs(captainActionsStore)

defineProps<{
  modelValue: boolean
  rail: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
  'update:rail': [value: boolean]
}>()

const pendingInvitationsCount = computed(() =>
  leagueTeamsStore.myInvitations.length + leaguesStore.myLeagueInvitations.length
)

onMounted(async () => {
  // Fetch invitations for the badge count
  try {
    await Promise.all([
      leagueTeamsStore.fetchMyInvitations(),
      leaguesStore.fetchMyLeagueInvitations(),
    ])
  } catch {
    // Silently fail - badge just won't show
  }
})
</script>
