<template>
  <v-app>
    <AppHeader title="CS2 10 Mans" show-nav @toggle-nav="drawer = !drawer">
      <template #append>
        <CaptainActionsBell />
        <v-btn aria-label="Admin Panel" v-if="authStore.isAdmin" variant="text" to="/admin" icon>
          <v-icon>mdi-shield-crown</v-icon>
          <v-tooltip activator="parent" location="bottom">Admin Panel</v-tooltip>
        </v-btn>
        <v-btn aria-label="Profile" variant="text" to="/profile" icon>
          <v-icon>mdi-account</v-icon>
          <v-tooltip activator="parent" location="bottom">Profile</v-tooltip>
        </v-btn>
        <v-btn aria-label="Logout" variant="text" @click="handleLogout" icon>
          <v-icon>mdi-logout</v-icon>
          <v-tooltip activator="parent" location="bottom">Logout</v-tooltip>
        </v-btn>
      </template>
    </AppHeader>

    <PortalSidebar
      v-model="drawer"
      :rail="rail"
      @update:rail="rail = $event"
    />

    <v-main>
      <v-container fluid class="pa-6">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useAuthStore } from '@/stores/auth'
import AppHeader from '@/components/AppHeader.vue'
import PortalSidebar from '@/components/PortalSidebar.vue'
import CaptainActionsBell from '@/components/CaptainActionsBell.vue'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const { mdAndUp } = useDisplay()

// Below `md` the sidebar is a temporary overlay (PortalSidebar), so it must
// start closed there: `ref(true)` opened the menu over every page on a
// phone, on every navigation, until the user dismissed it.
const drawer = ref(mdAndUp.value)
const rail = ref(false)

// A phone user who picks a destination expects the overlay to go away.
watch(() => route.fullPath, () => {
  if (!mdAndUp.value) drawer.value = false
})

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>
