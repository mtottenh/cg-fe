<template>
  <v-app>
    <v-app-bar color="surface" elevation="0" border="b">
      <v-app-bar-title>
        <router-link to="/" class="text-decoration-none text-white">
          Gaming Portal
        </router-link>
      </v-app-bar-title>

      <template v-slot:append>
        <v-btn variant="text" to="/tournaments">Tournaments</v-btn>
        <v-btn variant="text" to="/teams">Teams</v-btn>
        <v-btn variant="text" to="/players">Players</v-btn>
        <v-divider vertical class="mx-2" />
        <template v-if="!isLoggedIn">
          <v-btn variant="text" to="/login">Login</v-btn>
          <v-btn variant="text" to="/register">Register</v-btn>
        </template>
        <template v-else>
          <v-chip v-if="authStore.isDevMode" color="warning" size="small" class="mr-2">
            DEV
          </v-chip>
          <v-btn v-if="authStore.isAdmin" variant="text" to="/admin" class="mr-2">
            Admin
          </v-btn>
          <v-btn variant="text" to="/invitations" class="mr-1">
            <v-badge
              v-if="invitationsStore.hasPendingInvitations"
              :content="invitationsStore.pendingCount"
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
    </v-app-bar>

    <v-main>
      <slot />
    </v-main>

    <v-footer app color="surface" border="t">
      <v-container>
        <div class="text-center text-caption text-medium-emphasis">
          Gaming Portal &copy; {{ new Date().getFullYear() }}
        </div>
      </v-container>
    </v-footer>
  </v-app>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useInvitationsStore } from '@/stores/invitations'

const authStore = useAuthStore()
const invitationsStore = useInvitationsStore()
const router = useRouter()

// User is considered logged in if authenticated OR in dev mode
const isLoggedIn = computed(() => authStore.isAuthenticated || authStore.isDevMode)

// Fetch invitation count when logged in
watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    invitationsStore.fetchPendingCount().catch(() => {
      // Silently fail - not critical for initial load
    })
  } else {
    invitationsStore.clearInvitations()
  }
}, { immediate: true })

function handleLogout() {
  authStore.logout()
  invitationsStore.clearInvitations()
  router.push('/login')
}
</script>
