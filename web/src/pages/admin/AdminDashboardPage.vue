<template>
  <div>
    <h1 class="text-h4 mb-6">Dashboard</h1>

    <v-row v-if="loading">
      <v-col cols="12" class="text-center">
        <v-progress-circular indeterminate color="primary" size="64" />
      </v-col>
    </v-row>

    <v-alert v-else-if="error" type="error" class="mb-4">
      {{ error }}
    </v-alert>

    <template v-else-if="stats">
      <v-row>
        <v-col cols="12" sm="6" md="3">
          <v-card color="primary" variant="tonal">
            <v-card-text class="d-flex align-center">
              <v-icon size="48" class="mr-4">mdi-account-group</v-icon>
              <div>
                <div class="text-h4 font-weight-bold">{{ stats.total_users }}</div>
                <div class="text-subtitle-2">Total Users</div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6" md="3">
          <v-card color="secondary" variant="tonal">
            <v-card-text class="d-flex align-center">
              <v-icon size="48" class="mr-4">mdi-controller</v-icon>
              <div>
                <div class="text-h4 font-weight-bold">{{ stats.total_players }}</div>
                <div class="text-subtitle-2">Total Players</div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6" md="3">
          <v-card color="success" variant="tonal">
            <v-card-text class="d-flex align-center">
              <v-icon size="48" class="mr-4">mdi-shield-account</v-icon>
              <div>
                <div class="text-h4 font-weight-bold">{{ stats.total_teams }}</div>
                <div class="text-subtitle-2">Active Teams</div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6" md="3">
          <v-card color="info" variant="tonal">
            <v-card-text class="d-flex align-center">
              <v-icon size="48" class="mr-4">mdi-gamepad-variant</v-icon>
              <div>
                <div class="text-h4 font-weight-bold">{{ stats.active_games }}</div>
                <div class="text-subtitle-2">Active Games</div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-row class="mt-4">
        <v-col cols="12" md="6">
          <v-card>
            <v-card-title>Recent Activity</v-card-title>
            <v-card-text>
              <v-list density="compact">
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon color="success">mdi-account-plus</v-icon>
                  </template>
                  <v-list-item-title>{{ stats.users_last_24h }} new users</v-list-item-title>
                  <v-list-item-subtitle>Last 24 hours</v-list-item-subtitle>
                </v-list-item>
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon color="primary">mdi-account-group</v-icon>
                  </template>
                  <v-list-item-title>{{ stats.users_last_7d }} new users</v-list-item-title>
                  <v-list-item-subtitle>Last 7 days</v-list-item-subtitle>
                </v-list-item>
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon color="secondary">mdi-shield-plus</v-icon>
                  </template>
                  <v-list-item-title>{{ stats.teams_last_7d }} new teams</v-list-item-title>
                  <v-list-item-subtitle>Last 7 days</v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <v-card>
            <v-card-title>Moderation</v-card-title>
            <v-card-text>
              <v-list density="compact">
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon :color="stats.active_bans > 0 ? 'error' : 'success'">mdi-gavel</v-icon>
                  </template>
                  <v-list-item-title>{{ stats.active_bans }} active bans</v-list-item-title>
                  <v-list-item-subtitle>Currently enforced</v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card-text>
            <v-card-actions>
              <v-btn
                variant="text"
                color="primary"
                :to="{ name: 'admin-bans' }"
              >
                View All Bans
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>

      <v-row class="mt-4">
        <v-col cols="12">
          <v-card>
            <v-card-title>Quick Actions</v-card-title>
            <v-card-text>
              <v-row>
                <v-col cols="12" sm="6" md="3">
                  <v-btn
                    block
                    color="primary"
                    variant="outlined"
                    prepend-icon="mdi-trophy-outline"
                    :to="{ name: 'admin-leagues' }"
                  >
                    Manage Leagues
                  </v-btn>
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-btn
                    block
                    color="secondary"
                    variant="outlined"
                    prepend-icon="mdi-tournament"
                    :to="{ name: 'admin-tournaments' }"
                  >
                    Tournaments
                  </v-btn>
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-btn
                    block
                    color="error"
                    variant="outlined"
                    prepend-icon="mdi-gavel"
                    @click="openBanModal = true"
                  >
                    Ban Player
                  </v-btn>
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-btn
                    block
                    color="info"
                    variant="outlined"
                    prepend-icon="mdi-gamepad-variant-outline"
                    :to="{ name: 'admin-games' }"
                  >
                    Manage Games
                  </v-btn>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Ban Modal from Dashboard -->
    <BanCreateModal
      v-model="openBanModal"
      @created="onBanCreated"
    />

    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
      {{ snackbarText }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ApiError } from '@/api'
import BanCreateModal from '@/components/admin/BanCreateModal.vue'

// Platform stats type - matches backend PlatformStatsResponse
// TODO: Replace with generated type once API types are regenerated
interface PlatformStats {
  total_users: number
  total_players: number
  total_teams: number
  active_games: number
  active_bans: number
  users_last_24h: number
  users_last_7d: number
  teams_last_7d: number
}

const stats = ref<PlatformStats | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Ban modal state
const openBanModal = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function onBanCreated() {
  snackbarText.value = 'Ban created successfully'
  snackbarColor.value = 'success'
  snackbar.value = true
  // Refresh stats to update active_bans count
  fetchStats()
}

async function fetchStats() {
  loading.value = true
  error.value = null
  try {
    // Use fetch directly since the endpoint isn't in generated types yet
    const response = await fetch(`${API_URL}/v1/admin/stats`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to fetch stats')
    }

    const result = await response.json()
    stats.value = result.data
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to load dashboard stats'
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchStats()
})
</script>
