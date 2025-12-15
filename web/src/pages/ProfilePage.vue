<template>
  <v-container class="py-8">
    <h1 class="text-h3 mb-6">My Profile</h1>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <v-alert v-if="error" type="error" class="mb-4">
      {{ error }}
    </v-alert>

    <v-row v-if="user">
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>
            <v-icon start>mdi-account</v-icon>
            Account Information
          </v-card-title>
          <v-divider />
          <v-card-text>
            <v-list>
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-account-circle</v-icon>
                </template>
                <v-list-item-title>Username</v-list-item-title>
                <v-list-item-subtitle>{{ user.username }}</v-list-item-subtitle>
              </v-list-item>

              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-email</v-icon>
                </template>
                <v-list-item-title>Email</v-list-item-title>
                <v-list-item-subtitle>{{ user.email }}</v-list-item-subtitle>
              </v-list-item>

              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-calendar</v-icon>
                </template>
                <v-list-item-title>Member Since</v-list-item-title>
                <v-list-item-subtitle>{{ formatDate(user.created_at) }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>
            <v-icon start>mdi-cog</v-icon>
            Settings
          </v-card-title>
          <v-divider />
          <v-card-text>
            <v-list>
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-key</v-icon>
                </template>
                <v-list-item-title>API Token</v-list-item-title>
                <v-list-item-subtitle class="text-truncate" style="max-width: 200px;">
                  {{ authStore.token }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>

            <div class="d-flex flex-wrap gap-2 mt-4">
              <v-btn
                color="primary"
                variant="outlined"
                to="/profile/edit"
              >
                <v-icon start>mdi-pencil</v-icon>
                Edit Profile
              </v-btn>

              <v-btn
                color="secondary"
                variant="outlined"
                to="/profile/availability"
              >
                <v-icon start>mdi-calendar-clock</v-icon>
                My Availability
              </v-btn>

              <v-btn
                color="error"
                variant="outlined"
                @click="handleLogout"
              >
                <v-icon start>mdi-logout</v-icon>
                Logout
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-else-if="!loading">
      <v-col cols="12" class="text-center py-12">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-account-off</v-icon>
        <h3 class="text-h5 text-medium-emphasis mb-2">Not Logged In</h3>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Using dev token. Register to create an account.
        </p>
        <v-btn color="primary" to="/register">Register</v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const loading = ref(true)
const error = ref<string | null>(null)

const user = computed(() => authStore.user)

onMounted(async () => {
  try {
    await authStore.fetchCurrentUser()
  } catch (e) {
    error.value = authStore.error || 'Failed to load profile'
  } finally {
    loading.value = false
  }
})

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function handleLogout() {
  authStore.logout()
  router.push('/')
}
</script>
