<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="600"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Create New Team</span>
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
                v-model="form.name"
                label="Team Name"
                :rules="[rules.required, rules.minLength(2), rules.maxLength(100)]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.tag"
                label="Team Tag"
                :rules="[rules.required, rules.minLength(2), rules.maxLength(8), rules.tag]"
                variant="outlined"
                density="comfortable"
                hint="2-8 character tag (e.g., AST, NAV, G2)"
                persistent-hint
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.description"
                label="Description (Optional)"
                :rules="[rules.maxLength(2000)]"
                rows="2"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="6">
              <v-text-field
                v-model="form.primary_color"
                label="Primary Color"
                variant="outlined"
                density="comfortable"
                hint="Hex code, e.g., #FF5500"
                persistent-hint
              >
                <template v-slot:prepend-inner>
                  <div
                    v-if="form.primary_color"
                    :style="{ backgroundColor: form.primary_color, width: '20px', height: '20px', borderRadius: '4px' }"
                  />
                </template>
              </v-text-field>
            </v-col>

            <v-col cols="6">
              <v-text-field
                v-model="form.secondary_color"
                label="Secondary Color"
                variant="outlined"
                density="comfortable"
                hint="Hex code, e.g., #000000"
                persistent-hint
              >
                <template v-slot:prepend-inner>
                  <div
                    v-if="form.secondary_color"
                    :style="{ backgroundColor: form.secondary_color, width: '20px', height: '20px', borderRadius: '4px' }"
                  />
                </template>
              </v-text-field>
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
          Create Team
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

const props = defineProps<{
  modelValue: boolean
  seasonId: string
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
  name: '',
  tag: '',
  description: '',
  primary_color: '',
  secondary_color: '',
  logo_url: '',
})

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const rules = {
  required: (v: string) => !!v || 'Required',
  minLength: (min: number) => (v: string) => !v || v.length >= min || `Minimum ${min} characters`,
  maxLength: (max: number) => (v: string) => !v || v.length <= max || `Maximum ${max} characters`,
  tag: (v: string) => {
    if (!v) return true
    if (!/^[A-Z0-9]{2,8}$/.test(v.toUpperCase())) {
      return 'Must be 2-8 alphanumeric characters'
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

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    form.value = {
      name: '',
      tag: '',
      description: '',
      primary_color: '',
      secondary_color: '',
      logo_url: '',
    }
    error.value = null
  }
})

function close() {
  error.value = null
  emit('update:modelValue', false)
}

async function save() {
  if (!formValid.value || !props.seasonId) return

  saving.value = true
  error.value = null

  try {
    const body: Record<string, unknown> = {
      name: form.value.name,
      tag: form.value.tag.toUpperCase(),
    }

    if (form.value.description) {
      body.description = form.value.description
    }
    if (form.value.primary_color) {
      body.primary_color = form.value.primary_color
    }
    if (form.value.secondary_color) {
      body.secondary_color = form.value.secondary_color
    }
    if (form.value.logo_url) {
      body.logo_url = form.value.logo_url
    }

    const response = await fetch(`${API_URL}/v1/league-seasons/${props.seasonId}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new ApiError(response.status, errorData.detail || 'Failed to create team')
    }

    emit('created')
    close()
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to create team'
    }
  } finally {
    saving.value = false
  }
}
</script>
