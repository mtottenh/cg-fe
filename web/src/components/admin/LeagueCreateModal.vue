<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="600"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Create New League</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-form ref="formRef" v-model="formValid">
          <v-row>
            <v-col cols="12">
              <v-select
                v-model="form.game_id"
                :items="activeGames"
                item-title="display_name"
                item-value="id"
                label="Game"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-gamepad-variant"
              >
                <template v-slot:item="{ item, props }">
                  <v-list-item v-bind="props">
                    <template v-slot:prepend>
                      <v-avatar size="24" rounded="sm">
                        <v-img v-if="item.raw.icon_url" :src="item.raw.icon_url" />
                        <v-icon v-else size="16">mdi-gamepad-variant</v-icon>
                      </v-avatar>
                    </template>
                  </v-list-item>
                </template>
              </v-select>
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.name"
                label="League Name"
                :rules="[rules.required, rules.minLength(3), rules.maxLength(100)]"
                variant="outlined"
                density="comfortable"
                @input="generateSlug"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.slug"
                label="URL Slug"
                :rules="[rules.required, rules.minLength(3), rules.maxLength(100), rules.slug]"
                variant="outlined"
                density="comfortable"
                hint="URL-friendly identifier (lowercase letters, numbers, hyphens)"
                persistent-hint
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.description"
                label="Description (Optional)"
                :rules="[rules.maxLength(2000)]"
                rows="3"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.logo_url"
                label="Logo URL (Optional)"
                :rules="[rules.url]"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-image"
              />
            </v-col>

            <v-col cols="12">
              <v-select
                v-model="form.access_type"
                :items="accessTypes"
                item-title="label"
                item-value="value"
                label="Access Type"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
              >
                <template v-slot:item="{ item, props }">
                  <v-list-item v-bind="props">
                    <v-list-item-subtitle>{{ item.raw.description }}</v-list-item-subtitle>
                  </v-list-item>
                </template>
              </v-select>
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
          Create League
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useLeaguesStore } from '@/stores/leagues'
import type { GameSummary } from '@/stores/games'

// Store for creating leagues
const leaguesStore = useLeaguesStore()

const props = defineProps<{
  modelValue: boolean
  games: GameSummary[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: []
}>()

const formRef = ref()
const formValid = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const form = ref({
  game_id: '',
  name: '',
  slug: '',
  description: '',
  logo_url: '',
  access_type: 'open',
})

const accessTypes = [
  { value: 'open', label: 'Open', description: 'Anyone can join immediately' },
  { value: 'invite_only', label: 'Invite Only', description: 'Members can only join via invitation' },
  { value: 'application', label: 'Application', description: 'Users apply, admins approve/reject' },
]

// Filter to active games only
const activeGames = computed(() => {
  return props.games.filter(g => g.status === 'active')
})

const rules = {
  required: (v: string) => !!v || 'Required',
  minLength: (min: number) => (v: string) => !v || v.length >= min || `Minimum ${min} characters`,
  maxLength: (max: number) => (v: string) => !v || v.length <= max || `Maximum ${max} characters`,
  slug: (v: string) => {
    if (!v) return true
    // Must be lowercase letters, numbers, and hyphens
    // Must start and end with alphanumeric
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(v)) {
      return 'Must be lowercase letters, numbers, and hyphens. Must start and end with letter or number.'
    }
    return true
  },
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

// Auto-generate slug from name
function generateSlug() {
  if (form.value.name) {
    form.value.slug = form.value.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }
}

// Reset form when dialog opens
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    form.value = {
      game_id: '',
      name: '',
      slug: '',
      description: '',
      logo_url: '',
      access_type: 'open',
    }
    error.value = null
  }
})

function close() {
  error.value = null
  emit('update:modelValue', false)
}

async function save() {
  if (!formValid.value) return

  saving.value = true
  error.value = null

  try {
    await leaguesStore.createLeague({
      game_id: form.value.game_id,
      name: form.value.name,
      slug: form.value.slug,
      access_type: form.value.access_type as 'open' | 'invite_only' | 'application',
      description: form.value.description || undefined,
      logo_url: form.value.logo_url || undefined,
    })

    emit('created')
    close()
  } catch {
    error.value = leaguesStore.error || 'Failed to create league'
  } finally {
    saving.value = false
  }
}
</script>
