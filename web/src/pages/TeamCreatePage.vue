<template>
  <v-container class="py-8">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6">
        <v-btn variant="text" to="/teams" class="mb-4">
          <v-icon start>mdi-arrow-left</v-icon>
          Back to Teams
        </v-btn>

        <v-card class="pa-6">
          <v-card-title class="text-h4 mb-4">Create Team</v-card-title>

          <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = null">
            {{ error }}
          </v-alert>

          <v-form @submit.prevent="handleSubmit">
            <v-text-field
              v-model="form.name"
              label="Team Name"
              prepend-inner-icon="mdi-account-group"
              :rules="[rules.required, rules.minLength(2), rules.maxLength(64)]"
              hint="The full name of your team"
              class="mb-2"
            />

            <v-text-field
              v-model="form.tag"
              label="Team Tag"
              prepend-inner-icon="mdi-tag"
              :rules="[rules.required, rules.minLength(2), rules.maxLength(8)]"
              hint="Short tag like [TSM] or [C9]"
              class="mb-2"
              @input="form.tag = form.tag.toUpperCase()"
            />

            <v-textarea
              v-model="form.description"
              label="Description (optional)"
              prepend-inner-icon="mdi-text"
              rows="3"
              class="mb-4"
              hint="Tell others about your team"
            />

            <v-btn
              type="submit"
              color="primary"
              size="large"
              block
              :loading="loading"
            >
              Create Team
            </v-btn>
          </v-form>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useTeamsStore } from '@/stores/teams'

const router = useRouter()
const teamsStore = useTeamsStore()

const form = reactive({
  name: '',
  tag: '',
  description: '',
})

const loading = ref(false)
const error = ref<string | null>(null)

const rules = {
  required: (v: string) => !!v || 'Required',
  minLength: (min: number) => (v: string) => v.length >= min || `Minimum ${min} characters`,
  maxLength: (max: number) => (v: string) => v.length <= max || `Maximum ${max} characters`,
}

async function handleSubmit() {
  loading.value = true
  error.value = null
  try {
    const team = await teamsStore.createTeam({
      name: form.name,
      tag: form.tag,
      description: form.description || undefined,
    })
    if (!team) {
      error.value = teamsStore.error || 'Failed to create team'
      return
    }
    // Redirect to edit page for logo/banner uploads
    router.push(`/teams/${team.id}/edit?newTeam=true`)
  } catch (e) {
    error.value = teamsStore.error || 'Failed to create team'
  } finally {
    loading.value = false
  }
}
</script>
