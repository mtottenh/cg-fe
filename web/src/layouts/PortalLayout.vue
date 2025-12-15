<template>
  <v-app>
    <v-app-bar color="surface" elevation="0" border="b">
      <v-app-bar-nav-icon @click="drawer = !drawer" />

      <v-app-bar-title>
        <router-link to="/" class="text-decoration-none text-white">
          Gaming Portal
        </router-link>
      </v-app-bar-title>

      <template v-slot:append>
        <v-chip v-if="authStore.isDevMode" color="warning" size="small" class="mr-2">
          DEV
        </v-chip>
        <v-btn v-if="authStore.isAdmin" variant="text" to="/admin" icon>
          <v-icon>mdi-shield-crown</v-icon>
          <v-tooltip activator="parent" location="bottom">Admin Panel</v-tooltip>
        </v-btn>
        <v-btn variant="text" to="/profile" icon>
          <v-icon>mdi-account</v-icon>
          <v-tooltip activator="parent" location="bottom">Profile</v-tooltip>
        </v-btn>
        <v-btn variant="text" @click="handleLogout" icon>
          <v-icon>mdi-logout</v-icon>
          <v-tooltip activator="parent" location="bottom">Logout</v-tooltip>
        </v-btn>
      </template>
    </v-app-bar>

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
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import PortalSidebar from '@/components/PortalSidebar.vue'

const authStore = useAuthStore()
const router = useRouter()

const drawer = ref(true)
const rail = ref(false)

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>
