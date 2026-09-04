<template>
  <v-app>
    <AppHeader title="CS2 10 Mans">
      <template #append>
        <!-- Leagues and tournaments are public; player profiles are members-only. -->
        <v-btn variant="text" to="/tournaments">Tournaments</v-btn>
        <v-btn variant="text" to="/leagues">Leagues</v-btn>
        <template v-if="isLoggedIn">
          <v-btn variant="text" to="/players">Players</v-btn>
        </template>
        <v-divider vertical class="mx-2" />
        <template v-if="!isLoggedIn">
          <v-btn variant="text" to="/login" prepend-icon="mdi-steam">Sign in</v-btn>
        </template>
        <template v-else>
          <v-btn v-if="authStore.isAdmin" variant="text" to="/admin" class="mr-2">
            Admin
          </v-btn>
          <v-btn variant="text" to="/invitations" class="mr-1">
            <v-badge
              v-if="pendingInvitationCount > 0"
              :content="pendingInvitationCount"
              color="error"
              offset-x="-2"
              offset-y="-2"
            >
              <v-icon>mdi-email-outline</v-icon>
            </v-badge>
            <v-icon v-else>mdi-email-outline</v-icon>
          </v-btn>
          <v-btn variant="text" to="/profile">Profile</v-btn>
          <v-btn variant="text" @click="handleLogout">Logout</v-btn>
        </template>
      </template>
    </AppHeader>

    <v-main>
      <slot />
    </v-main>

    <v-footer app color="surface" border="t">
      <v-container>
        <div class="text-center text-caption text-medium-emphasis">
          CS2 10 Mans &copy; {{ new Date().getFullYear() }}
        </div>
      </v-container>
    </v-footer>
  </v-app>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import AppHeader from '@/components/AppHeader.vue'

const authStore = useAuthStore()
const leagueTeamsStore = useLeagueTeamsStore()
const router = useRouter()

// User is considered logged in if authenticated OR in dev mode
const isLoggedIn = computed(() => authStore.isAuthenticated)
const pendingInvitationCount = computed(() => leagueTeamsStore.myInvitations.length)

// Fetch invitation count when logged in
watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    leagueTeamsStore.fetchMyInvitations().catch(() => {
      // Silently fail - not critical for initial load
    })
  }
}, { immediate: true })

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>
