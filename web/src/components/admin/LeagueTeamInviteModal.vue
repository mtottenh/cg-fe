<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="500"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Invite Player to Team</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-form ref="formRef" v-model="formValid">
          <v-row>
            <v-col cols="12">
              <v-autocomplete
                v-model="form.player_id"
                v-model:search="playerSearch"
                :items="playerResults"
                :loading="searchingPlayers"
                item-title="display_name"
                item-value="id"
                label="Search Player"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-magnify"
                no-filter
                clearable
                return-object
                @update:search="searchPlayers"
              >
                <template v-slot:item="{ item, props }">
                  <v-list-item v-bind="props">
                    <template v-slot:prepend>
                      <v-avatar size="32">
                        <v-img v-if="item.raw.avatar_url" :src="item.raw.avatar_url" />
                        <v-icon v-else>mdi-account</v-icon>
                      </v-avatar>
                    </template>
                    <v-list-item-subtitle>{{ item.raw.id.substring(0, 8) }}...</v-list-item-subtitle>
                  </v-list-item>
                </template>
                <template v-slot:no-data>
                  <v-list-item v-if="playerSearch && playerSearch.length >= 2">
                    <v-list-item-title>No players found</v-list-item-title>
                  </v-list-item>
                  <v-list-item v-else>
                    <v-list-item-title>Type at least 2 characters to search</v-list-item-title>
                  </v-list-item>
                </template>
              </v-autocomplete>
            </v-col>

            <v-col cols="12">
              <v-select
                v-model="form.role"
                :items="roleOptions"
                item-title="label"
                item-value="value"
                label="Role"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.message"
                label="Message (Optional)"
                :rules="[rules.maxLength(500)]"
                rows="2"
                variant="outlined"
                density="comfortable"
                hint="Optional message to include with the invitation"
                persistent-hint
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="sending"
          :disabled="!formValid || !form.player_id"
          @click="send"
        >
          Send Invitation
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ApiError } from '@/api'
import { useFormRules } from '@/composables/useFormRules'

interface PlayerSearchResult {
  id: string
  display_name: string
  avatar_url: string | null
}

const props = defineProps<{
  modelValue: boolean
  teamSeasonId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  invited: []
}>()

const formRef = ref()
const formValid = ref(false)
const sending = ref(false)
const error = ref<string | null>(null)

// Player search
const playerSearch = ref('')
const playerResults = ref<PlayerSearchResult[]>([])
const searchingPlayers = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

const form = ref<{
  player_id: PlayerSearchResult | null
  role: string
  message: string
}>({
  player_id: null,
  role: 'player',
  message: '',
})

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const roleOptions = [
  { value: 'player', label: 'Player' },
  { value: 'substitute', label: 'Substitute' },
  { value: 'captain', label: 'Captain' },
]

const rules = useFormRules()

async function searchPlayers(search: string) {
  if (!search || search.length < 2) {
    playerResults.value = []
    return
  }

  // Debounce search
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  searchTimeout = setTimeout(async () => {
    searchingPlayers.value = true
    try {
      const response = await fetch(`${API_URL}/v1/players?search=${encodeURIComponent(search)}&per_page=10`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const result = await response.json()
      playerResults.value = result.data.map((p: { id: string; display_name: string; avatar_url: string | null }) => ({
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      }))
    } catch {
      playerResults.value = []
    } finally {
      searchingPlayers.value = false
    }
  }, 300)
}

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    form.value = {
      player_id: null,
      role: 'player',
      message: '',
    }
    playerSearch.value = ''
    playerResults.value = []
    error.value = null
  }
})

function close() {
  error.value = null
  emit('update:modelValue', false)
}

async function send() {
  if (!formValid.value || !props.teamSeasonId || !form.value.player_id) return

  sending.value = true
  error.value = null

  try {
    const body: Record<string, unknown> = {
      player_id: form.value.player_id.id,
      role: form.value.role,
    }

    if (form.value.message) {
      body.message = form.value.message
    }

    const response = await fetch(`${API_URL}/v1/league-team-seasons/${props.teamSeasonId}/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to send invitation')
    }

    emit('invited')
    close()
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to send invitation'
    }
  } finally {
    sending.value = false
  }
}
</script>
