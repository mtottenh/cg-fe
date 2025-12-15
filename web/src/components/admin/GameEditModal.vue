<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="600"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Edit Game: {{ game?.id }}</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-form ref="formRef" v-model="formValid">
          <v-row>
            <v-col cols="12">
              <v-text-field
                v-model="form.display_name"
                label="Display Name"
                :rules="[rules.required, rules.maxLength(64)]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.short_name"
                label="Short Name"
                :rules="[rules.maxLength(16)]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="form.sort_order"
                label="Sort Order"
                type="number"
                hint="Lower numbers appear first"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.description"
                label="Description"
                :rules="[rules.maxLength(1000)]"
                rows="3"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.icon_url"
                label="Icon URL"
                :rules="[rules.url]"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-image"
              />
            </v-col>

            <v-col cols="12">
              <v-switch
                v-model="form.is_featured"
                label="Featured on homepage"
                color="warning"
                hide-details
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
          :loading="saving"
          :disabled="!formValid"
          @click="save"
        >
          Save Changes
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

// Game summary type
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

const props = defineProps<{
  modelValue: boolean
  game: GameSummary | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [game: GameSummary]
}>()

const formRef = ref()
const formValid = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const form = ref({
  display_name: '',
  short_name: '',
  description: '',
  icon_url: '',
  is_featured: false,
  sort_order: 0,
})

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const rules = {
  required: (v: string) => !!v || 'Required',
  maxLength: (max: number) => (v: string) => !v || v.length <= max || `Max ${max} characters`,
  url: (v: string) => {
    if (!v) return true
    try {
      new URL(v)
      return true
    } catch {
      return 'Must be a valid URL'
    }
  },
}

// Watch for game changes to populate form
watch(() => props.game, (newGame) => {
  if (newGame) {
    form.value = {
      display_name: newGame.display_name,
      short_name: newGame.short_name || '',
      description: newGame.description || '',
      icon_url: newGame.icon_url || '',
      is_featured: newGame.is_featured,
      sort_order: 0,
    }
  }
}, { immediate: true })

function close() {
  error.value = null
  emit('update:modelValue', false)
}

async function save() {
  if (!props.game || !formValid.value) return

  saving.value = true
  error.value = null

  try {
    // Build request body with only changed fields
    const body: Record<string, unknown> = {}

    if (form.value.display_name !== props.game.display_name) {
      body.display_name = form.value.display_name
    }
    if (form.value.short_name !== (props.game.short_name || '')) {
      body.short_name = form.value.short_name || null
    }
    if (form.value.description !== (props.game.description || '')) {
      body.description = form.value.description || null
    }
    if (form.value.icon_url !== (props.game.icon_url || '')) {
      body.icon_url = form.value.icon_url || null
    }
    if (form.value.is_featured !== props.game.is_featured) {
      body.is_featured = form.value.is_featured
    }
    if (form.value.sort_order !== 0) {
      body.sort_order = form.value.sort_order
    }

    // Skip if nothing changed
    if (Object.keys(body).length === 0) {
      close()
      return
    }

    const response = await fetch(`${API_URL}/v1/games/${props.game.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to update game')
    }

    const result = await response.json()

    // Convert GameDetailResponse to GameSummary format
    const updatedGame: GameSummary = {
      id: result.data.id,
      display_name: result.data.display_name,
      short_name: result.data.short_name,
      description: result.data.description,
      icon_url: result.data.icon_url,
      team_size_default: result.data.team_size?.default || props.game.team_size_default,
      status: result.data.status,
      is_featured: result.data.is_featured,
    }

    emit('saved', updatedGame)
    close()
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to update game'
    }
  } finally {
    saving.value = false
  }
}
</script>
