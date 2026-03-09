<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="500">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-account-plus-outline</v-icon>
        Register for Tournament
      </v-card-title>

      <v-divider />

      <v-card-text>
        <p class="text-body-2 text-grey mb-4">
          You're registering for <strong>{{ tournament.name }}</strong>
        </p>

        <v-text-field
          v-model="participantName"
          label="Display Name"
          hint="Name shown in the bracket"
          persistent-hint
          variant="outlined"
          density="comfortable"
          :rules="[rules.required, rules.maxLength]"
          autofocus
        />

        <v-alert
          v-if="tournament.registration_type === 'approval'"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          This tournament requires approval. Your registration will be reviewed by an admin.
        </v-alert>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          :disabled="!canRegister"
          @click="handleRegister"
        >
          Register
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { TournamentResponse } from '@/stores/tournaments'
import { useFormRules } from '@/composables/useFormRules'

const props = defineProps<{
  modelValue: boolean
  tournament: TournamentResponse
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  register: [participantName: string]
}>()

const authStore = useAuthStore()

// State
const loading = ref(false)
const participantName = ref('')

// Validation rules
const { maxLength: _maxLength, ...baseRules } = useFormRules()
const rules = {
  ...baseRules,
  required: (v: string) => !!v?.trim() || 'Required',
  maxLength: (v: string) => !v || v.length <= 100 || 'Max 100 characters',
}

const canRegister = computed(() => {
  return participantName.value.trim().length > 0
})

// Methods
function close() {
  emit('update:modelValue', false)
}

async function handleRegister() {
  if (!canRegister.value) return

  loading.value = true
  try {
    emit('register', participantName.value.trim())
  } finally {
    loading.value = false
  }
}

// Watch for dialog open
watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      // Pre-fill with player's display name
      participantName.value = authStore.player?.display_name || ''
    }
  }
)
</script>
