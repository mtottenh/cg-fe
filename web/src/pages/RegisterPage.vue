<template>
  <v-container class="py-8">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="4">
        <v-card class="pa-6">
          <v-card-title class="text-h4 text-center mb-4">Register</v-card-title>

          <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = null">
            {{ error }}
          </v-alert>

          <v-alert v-if="success" type="success" class="mb-4">
            Registration successful! You can now use your account.
          </v-alert>

          <v-form v-if="!success" @submit.prevent="handleSubmit">
            <v-text-field
              v-model="form.username"
              label="Username"
              prepend-inner-icon="mdi-account"
              :rules="[rules.required, rules.minLength(3)]"
              class="mb-2"
            />

            <v-text-field
              v-model="form.email"
              label="Email"
              type="email"
              prepend-inner-icon="mdi-email"
              :rules="[rules.required, rules.email]"
              class="mb-2"
            />

            <v-text-field
              v-model="form.password"
              label="Password"
              :type="showPassword ? 'text' : 'password'"
              prepend-inner-icon="mdi-lock"
              :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
              @click:append-inner="showPassword = !showPassword"
              :rules="[rules.required, rules.minLength(8)]"
              class="mb-2"
            />

            <v-text-field
              v-model="form.display_name"
              label="Display Name (optional)"
              prepend-inner-icon="mdi-badge-account"
              hint="Your in-game name shown to others"
              class="mb-4"
            />

            <v-btn
              type="submit"
              color="primary"
              size="large"
              block
              :loading="loading"
            >
              Create Account
            </v-btn>
          </v-form>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFormRules } from '@/composables/useFormRules'

const authStore = useAuthStore()

const form = reactive({
  username: '',
  email: '',
  password: '',
  display_name: '',
})

const showPassword = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

const rules = useFormRules()

async function handleSubmit() {
  loading.value = true
  error.value = null
  try {
    await authStore.register({
      username: form.username,
      email: form.email,
      password: form.password,
      display_name: form.display_name || form.username,
    })
    success.value = true
  } catch (e) {
    error.value = authStore.error || 'Registration failed'
  } finally {
    loading.value = false
  }
}
</script>
