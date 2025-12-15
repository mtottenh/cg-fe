<template>
  <v-app>
    <v-app-bar color="surface" elevation="0" border="b">
      <v-app-bar-nav-icon @click="drawer = !drawer" />

      <v-app-bar-title>
        <router-link to="/admin" class="text-decoration-none text-white">
          Admin Panel
        </router-link>
      </v-app-bar-title>

      <template v-slot:append>
        <v-chip color="warning" size="small" class="mr-4">
          ADMIN
        </v-chip>
        <v-btn variant="text" to="/" icon>
          <v-icon>mdi-home</v-icon>
          <v-tooltip activator="parent" location="bottom">Back to Portal</v-tooltip>
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

    <AdminSidebar
      v-model="drawer"
      :rail="rail"
      @update:rail="rail = $event"
    />

    <v-main>
      <v-container fluid class="pa-6">
        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AdminSidebar from '@/components/admin/AdminSidebar.vue'

const authStore = useAuthStore()
const router = useRouter()

const drawer = ref(true)
const rail = ref(false)

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>
