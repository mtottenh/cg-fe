<template>
  <v-app>
    <AppHeader title="Admin Panel" title-to="/admin" show-nav @toggle-nav="drawer = !drawer">
      <template #append>
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
    </AppHeader>

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
import AppHeader from '@/components/AppHeader.vue'
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
