<template>
  <v-container class="py-8">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="4">
        <v-card class="pa-6">
          <v-card-title class="text-h4 text-center mb-4">Login</v-card-title>

          <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = null">
            {{ error }}
          </v-alert>

          <v-form @submit.prevent="handleSubmit">
            <v-text-field
              v-model="form.username_or_email"
              label="Username or Email"
              prepend-inner-icon="mdi-account"
              :rules="[rules.required]"
              class="mb-2"
              autofocus
            />

            <v-text-field
              v-model="form.password"
              label="Password"
              :type="showPassword ? 'text' : 'password'"
              prepend-inner-icon="mdi-lock"
              :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
              @click:append-inner="showPassword = !showPassword"
              :rules="[rules.required]"
              class="mb-4"
            />

            <v-btn
              type="submit"
              color="primary"
              size="large"
              block
              :loading="loading"
            >
              Login
            </v-btn>
          </v-form>

          <v-divider class="my-4" />

          <div class="text-center">
            <span class="text-body-2 text-grey">Don't have an account?</span>
            <router-link to="/register" class="ml-1 text-primary">Register</router-link>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFormRules } from '@/composables/useFormRules'

const authStore = useAuthStore()
const router = useRouter()

const form = reactive({
  username_or_email: '',
  password: '',
})

const showPassword = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

const rules = useFormRules()

async function handleSubmit() {
  loading.value = true
  error.value = null
  try {
    await authStore.login({
      username_or_email: form.username_or_email,
      password: form.password,
    })
    // Redirect to home or intended destination after login
    const redirect = router.currentRoute.value.query.redirect as string
    router.push(redirect || '/')
  } catch (e) {
    error.value = authStore.error || 'Login failed. Please check your credentials.'
  } finally {
    loading.value = false
  }
}
</script>
