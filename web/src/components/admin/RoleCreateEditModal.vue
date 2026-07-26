<template>
  <v-dialog v-model="dialogOpen" max-width="600" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">{{ isEditMode ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
        {{ isEditMode ? 'Edit Role' : 'Create Role' }}
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" @submit.prevent="submitForm">
          <v-row>
            <!-- Name (only for create) -->
            <v-col v-if="!isEditMode" cols="12" md="6">
              <v-text-field
                v-model="form.name"
                label="Machine Name"
                placeholder="e.g., league_moderator"
                variant="outlined"
                density="compact"
                :rules="[rules.required, rules.machineName]"
                hint="Lowercase letters, numbers, underscores only"
                persistent-hint
              />
            </v-col>

            <!-- Display Name -->
            <v-col cols="12" :md="isEditMode ? 12 : 6">
              <v-text-field
                v-model="form.display_name"
                label="Display Name"
                placeholder="e.g., League Moderator"
                variant="outlined"
                density="compact"
                :rules="[rules.required, rules.minLength(2)]"
              />
            </v-col>

            <!-- Category (only for create) -->
            <v-col v-if="!isEditMode" cols="12" md="6">
              <v-select
          aria-label="Category"
                v-model="form.category"
                label="Category"
                :items="categoryOptions"
                variant="outlined"
                density="compact"
                :rules="[rules.required]"
              />
            </v-col>

            <!-- Priority -->
            <v-col cols="12" :md="isEditMode ? 6 : 6">
              <v-text-field
                v-model.number="form.priority"
                label="Priority"
                type="number"
                variant="outlined"
                density="compact"
                hint="Higher = more prominent"
                persistent-hint
              />
            </v-col>

            <!-- Color -->
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.color"
                label="Color"
                placeholder="#4CAF50"
                variant="outlined"
                density="compact"
                hint="Hex color for UI display"
                persistent-hint
                :rules="[rules.hexColor]"
              >
                <template v-slot:prepend-inner>
                  <div
                    v-if="form.color"
                    class="color-preview"
                    :style="{ backgroundColor: form.color }"
                  />
                </template>
              </v-text-field>
            </v-col>

            <!-- Description -->
            <v-col cols="12">
              <v-textarea
                v-model="form.description"
                label="Description"
                placeholder="Describe what this role is for..."
                variant="outlined"
                density="compact"
                rows="3"
                :rules="[rules.maxLength(500)]"
                counter="500"
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="closeDialog">
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          @click="submitForm"
        >
          {{ isEditMode ? 'Save Changes' : 'Create Role' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRbacStore, type RoleResponse, type CreateRoleRequest, type UpdateRoleRequest } from '@/stores/rbac'
import { useFormRules } from '@/composables/useFormRules'

const props = defineProps<{  role: RoleResponse | null
}>()

const emit = defineEmits<{  saved: []
}>()

const open = defineModel<boolean>({ required: true })

const rbacStore = useRbacStore()
const formRef = ref()
const saving = ref(false)

const form = ref<{
  name: string
  display_name: string
  description: string
  category: string
  priority: number
  color: string
}>({
  name: '',
  display_name: '',
  description: '',
  category: 'team',
  priority: 0,
  color: '',
})

const dialogOpen = computed({
  get: () => open.value,
  set: (value) => open.value = value,
})

const isEditMode = computed(() => !!props.role)

const categoryOptions = [
  { title: 'Platform', value: 'platform' },
  { title: 'Team', value: 'team' },
  { title: 'League', value: 'league' },
  { title: 'Tournament', value: 'tournament' },
]

const rules = {
  ...useFormRules(),
  machineName: (v: string) => /^[a-z][a-z0-9_]*$/.test(v) || 'Must start with letter, use only lowercase letters, numbers, underscores',
  hexColor: (v: string) => !v || /^#[0-9A-Fa-f]{6}$/.test(v) || 'Must be a valid hex color (e.g., #4CAF50)',
}

// Watch for role changes to populate form
watch(
  () => props.role,
  (role) => {
    if (role) {
      form.value = {
        name: role.name,
        display_name: role.display_name,
        description: role.description || '',
        category: role.category,
        priority: role.priority,
        color: role.color || '',
      }
    } else {
      resetForm()
    }
  },
  { immediate: true }
)

function resetForm() {
  form.value = {
    name: '',
    display_name: '',
    description: '',
    category: 'team',
    priority: 0,
    color: '',
  }
}

function closeDialog() {
  dialogOpen.value = false
  resetForm()
}

async function submitForm() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  saving.value = true
  try {
    if (isEditMode.value && props.role) {
      const request: UpdateRoleRequest = {
        display_name: form.value.display_name,
        description: form.value.description || null,
        priority: form.value.priority,
        color: form.value.color || null,
      }
      await rbacStore.updateRole(props.role.id, request)
    } else {
      const request: CreateRoleRequest = {
        name: form.value.name,
        display_name: form.value.display_name,
        description: form.value.description || null,
        category: form.value.category,
        priority: form.value.priority,
        color: form.value.color || null,
      }
      await rbacStore.createRole(request)
    }
    emit('saved')
    closeDialog()
  } catch {
    // Error handled in store
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.color-preview {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}
</style>
