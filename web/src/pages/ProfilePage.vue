<template>
  <v-container>
    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <ErrorAlert :error="error" retryable @clear="error = null" @retry="fetchProfile" />

    <template v-if="user && playerProfile">
      <!-- Banner + Avatar header -->
      <v-card class="mb-6 overflow-hidden" rounded="lg" elevation="2">
        <div
          class="profile-banner"
          :style="bannerStyle"
        >
          <div class="profile-banner-overlay" />
        </div>

        <div class="profile-header-content px-6 pb-4">
          <v-avatar size="96" class="profile-avatar elevation-4">
            <v-img
              v-if="playerProfile.avatar_url"
              :src="playerProfile.avatar_url"
              :alt="playerProfile.display_name"
            />
            <v-icon v-else size="48" color="grey-lighten-1">mdi-account</v-icon>
          </v-avatar>

          <div class="ml-4 pt-2">
            <div class="d-flex align-center">
              <h1 class="text-h4 font-weight-bold">{{ playerProfile.display_name }}</h1>
              <v-chip
                v-if="playerProfile.looking_for_team"
                color="success"
                size="small"
                class="ml-2"
              >
                <v-icon start size="small">mdi-account-search</v-icon>
                Looking for Team
              </v-chip>
            </div>
            <span class="text-body-2 text-medium-emphasis">@{{ user.username }}</span>
          </div>
        </div>
      </v-card>

      <v-row>
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
                    <v-icon>mdi-email</v-icon>
                  </template>
                  <v-list-item-title>Email</v-list-item-title>
                  <v-list-item-subtitle>{{ user.email }}</v-list-item-subtitle>
                </v-list-item>

                <v-list-item v-if="playerProfile.bio">
                  <template v-slot:prepend>
                    <v-icon>mdi-text</v-icon>
                  </template>
                  <v-list-item-title>Bio</v-list-item-title>
                  <v-list-item-subtitle>{{ playerProfile.bio }}</v-list-item-subtitle>
                </v-list-item>

                <v-list-item v-if="playerProfile.country_code">
                  <template v-slot:prepend>
                    <v-icon>mdi-earth</v-icon>
                  </template>
                  <v-list-item-title>Country</v-list-item-title>
                  <v-list-item-subtitle>{{ playerProfile.country_code }}</v-list-item-subtitle>
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
              <div class="d-flex flex-wrap ga-2">
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

      <TrophyCase :player-id="playerProfile.id" own-profile class="mt-6 mb-4" />

      <MatchHistoryList class="mb-4" />

      <PublicMmStatsCard :player-id="playerProfile.id" class="mb-4" />
      <PlayerGameStatsCard :player-id="playerProfile.id" />
    </template>

    <EmptyState
      v-else-if="!loading"
      icon="mdi-account-off"
      title="Not Logged In"
      subtitle="Sign in to view your profile, or create an account to get started."
    >
      <template #action>
        <div class="mt-4">
          <v-btn color="primary" class="mr-2" to="/login">Sign In</v-btn>
          <v-btn variant="outlined" to="/register">Register</v-btn>
        </div>
      </template>
    </EmptyState>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePlayersStore } from '@/stores/players'
import PlayerGameStatsCard from '@/components/player/PlayerGameStatsCard.vue'
import PublicMmStatsCard from '@/components/player/PublicMmStatsCard.vue'
import MatchHistoryList from '@/components/player/MatchHistoryList.vue'
import TrophyCase from '@/components/player/TrophyCase.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const authStore = useAuthStore()
const playersStore = usePlayersStore()

const loading = ref(true)
const error = ref<string | null>(null)

const { user } = storeToRefs(authStore)
const { currentPlayer: playerProfile } = storeToRefs(playersStore)

const bannerStyle = computed(() => {
  if (playerProfile.value?.banner_url) {
    return {
      backgroundImage: `url(${playerProfile.value.banner_url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  }
})

async function fetchProfile() {
  loading.value = true
  error.value = null
  try {
    await Promise.all([
      authStore.fetchCurrentUser(),
      playersStore.fetchMyProfile(),
    ])
  } catch {
    error.value = authStore.error || 'Failed to load profile'
  } finally {
    loading.value = false
  }
}

onMounted(() => { fetchProfile() })

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
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

<style scoped>
.profile-banner {
  height: 180px;
  position: relative;
}

.profile-banner-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent 40%, rgba(var(--v-theme-surface), 0.9) 100%);
}

.profile-header-content {
  display: flex;
  align-items: flex-end;
  margin-top: -48px;
  position: relative;
  z-index: 1;
}

.profile-avatar {
  border: 3px solid rgb(var(--v-theme-surface));
  background: rgb(var(--v-theme-surface));
  flex-shrink: 0;
}
</style>
