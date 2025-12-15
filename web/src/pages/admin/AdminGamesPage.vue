<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Games</h1>
    </div>

    <v-card>
      <v-card-title class="d-flex align-center">
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          label="Search games..."
          single-line
          hide-details
          density="compact"
          variant="outlined"
          class="mr-4"
          style="max-width: 300px"
        />
        <v-spacer />
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="fetchGames"
        >
          Refresh
        </v-btn>
      </v-card-title>

      <v-data-table
        :headers="headers"
        :items="filteredGames"
        :loading="loading"
        :items-per-page="10"
        class="elevation-0"
      >
        <template v-slot:item.icon_url="{ item }">
          <v-avatar size="32" rounded="sm">
            <v-img v-if="item.icon_url" :src="item.icon_url" />
            <v-icon v-else>mdi-gamepad-variant</v-icon>
          </v-avatar>
        </template>

        <template v-slot:item.status="{ item }">
          <v-chip
            :color="item.status === 'active' ? 'success' : 'grey'"
            size="small"
            variant="flat"
          >
            {{ item.status }}
          </v-chip>
        </template>

        <template v-slot:item.is_featured="{ item }">
          <v-icon v-if="item.is_featured" color="warning">mdi-star</v-icon>
          <v-icon v-else color="grey-lighten-1">mdi-star-outline</v-icon>
        </template>

        <template v-slot:item.actions="{ item }">
          <v-btn
            icon
            size="small"
            variant="text"
            @click="openEditModal(item)"
            title="Edit"
          >
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
          <v-btn
            v-if="item.status === 'active'"
            icon
            size="small"
            variant="text"
            color="error"
            :loading="toggleLoading === item.id"
            @click="disableGame(item)"
            title="Disable"
          >
            <v-icon>mdi-eye-off</v-icon>
          </v-btn>
          <v-btn
            v-else
            icon
            size="small"
            variant="text"
            color="success"
            :loading="toggleLoading === item.id"
            @click="enableGame(item)"
            title="Enable"
          >
            <v-icon>mdi-eye</v-icon>
          </v-btn>
        </template>

        <template v-slot:no-data>
          <div class="text-center pa-4">
            <v-icon size="64" color="grey-lighten-1" class="mb-2">mdi-gamepad-variant-outline</v-icon>
            <p class="text-grey">No games found</p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <v-alert v-if="error" type="error" class="mt-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
      {{ snackbarText }}
    </v-snackbar>

    <GameEditModal
      v-model="editModalOpen"
      :game="selectedGame"
      @saved="onGameSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ApiError } from '@/api'
import GameEditModal from '@/components/admin/GameEditModal.vue'

// Game summary type - matches backend GameSummaryResponse
interface GameSummary {
  id: string
  display_name: string
  short_name: string | null
  description: string | null
  icon_url: string | null
  team_size_default: number
  status: string
  is_featured: boolean
}

const games = ref<GameSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const search = ref('')
const toggleLoading = ref<string | null>(null)
const editModalOpen = ref(false)
const selectedGame = ref<GameSummary | null>(null)

const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const headers = [
  { title: '', key: 'icon_url', width: '50px', sortable: false },
  { title: 'ID', key: 'id', width: '100px' },
  { title: 'Name', key: 'display_name' },
  { title: 'Short Name', key: 'short_name', width: '120px' },
  { title: 'Team Size', key: 'team_size_default', width: '100px', align: 'center' as const },
  { title: 'Status', key: 'status', width: '100px' },
  { title: 'Featured', key: 'is_featured', width: '90px', align: 'center' as const },
  { title: 'Actions', key: 'actions', width: '120px', sortable: false, align: 'center' as const },
]

const filteredGames = computed(() => {
  if (!search.value) return games.value
  const q = search.value.toLowerCase()
  return games.value.filter(g =>
    g.id.toLowerCase().includes(q) ||
    g.display_name.toLowerCase().includes(q) ||
    (g.short_name?.toLowerCase().includes(q))
  )
})

async function fetchGames() {
  loading.value = true
  error.value = null
  try {
    const response = await fetch(`${API_URL}/v1/games`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to fetch games')
    }

    const result = await response.json()
    games.value = result.data
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to load games'
    }
  } finally {
    loading.value = false
  }
}

async function enableGame(game: GameSummary) {
  toggleLoading.value = game.id
  try {
    const response = await fetch(`${API_URL}/v1/games/${game.id}/enable`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to enable game')
    }

    const result = await response.json()
    // Update local state
    const index = games.value.findIndex(g => g.id === game.id)
    if (index !== -1) {
      games.value[index] = result.data
    }
    showSnackbar('Game enabled successfully', 'success')
  } catch (e) {
    if (e instanceof ApiError) {
      showSnackbar(e.detail, 'error')
    } else {
      showSnackbar('Failed to enable game', 'error')
    }
  } finally {
    toggleLoading.value = null
  }
}

async function disableGame(game: GameSummary) {
  toggleLoading.value = game.id
  try {
    const response = await fetch(`${API_URL}/v1/games/${game.id}/disable`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to disable game')
    }

    const result = await response.json()
    // Update local state
    const index = games.value.findIndex(g => g.id === game.id)
    if (index !== -1) {
      games.value[index] = result.data
    }
    showSnackbar('Game disabled successfully', 'success')
  } catch (e) {
    if (e instanceof ApiError) {
      showSnackbar(e.detail, 'error')
    } else {
      showSnackbar('Failed to disable game', 'error')
    }
  } finally {
    toggleLoading.value = null
  }
}

function openEditModal(game: GameSummary) {
  selectedGame.value = game
  editModalOpen.value = true
}

function onGameSaved(updatedGame: GameSummary) {
  const index = games.value.findIndex(g => g.id === updatedGame.id)
  if (index !== -1) {
    games.value[index] = updatedGame
  }
  showSnackbar('Game updated successfully', 'success')
}

function showSnackbar(text: string, color: string) {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

onMounted(() => {
  fetchGames()
})
</script>
