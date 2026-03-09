<template>
  <v-dialog v-model="dialogOpen" max-width="800" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-shield-key</v-icon>
        Manage Permissions for {{ role?.display_name }}
      </v-card-title>

      <v-card-text>
        <v-overlay
          :model-value="loading"
          contained
          class="align-center justify-center"
          scrim="rgba(0,0,0,0.3)"
        >
          <v-progress-circular indeterminate color="primary" />
        </v-overlay>

        <v-alert v-if="roleData?.is_system" type="info" density="compact" class="mb-4">
          This is a system role. Its permissions can still be modified by admins.
        </v-alert>

        <!-- Current Permissions -->
        <div class="mb-4">
          <h3 class="text-subtitle-1 mb-2">Current Permissions ({{ currentPermissions.length }})</h3>
          <div v-if="currentPermissions.length === 0" class="text-grey text-body-2">
            No permissions assigned to this role.
          </div>
          <v-chip
            v-for="perm in currentPermissions"
            :key="perm.id"
            class="ma-1"
            :color="perm.is_dangerous ? 'error' : 'primary'"
            variant="tonal"
            closable
            :disabled="saving"
            @click:close="removePermission(perm.id)"
          >
            <v-icon v-if="perm.is_dangerous" start size="small">mdi-alert</v-icon>
            {{ perm.display_name }}
          </v-chip>
        </div>

        <v-divider class="my-4" />

        <!-- Add Permissions -->
        <h3 class="text-subtitle-1 mb-2">Add Permission</h3>
        <v-text-field
          v-model="searchQuery"
          label="Search permissions..."
          variant="outlined"
          density="compact"
          prepend-inner-icon="mdi-magnify"
          clearable
          class="mb-2"
        />

        <!-- Available Permissions grouped by category -->
        <v-expansion-panels variant="accordion">
          <v-expansion-panel
            v-for="(perms, category) in availablePermissionsByCategory"
            :key="category"
          >
            <v-expansion-panel-title>
              <div class="d-flex align-center">
                <v-chip
                  :color="getCategoryColor(category)"
                  size="small"
                  variant="tonal"
                  class="mr-3"
                >
                  {{ category }}
                </v-chip>
                <span class="text-body-2 text-grey">
                  {{ perms.length }} available
                </span>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-list density="compact" class="bg-transparent">
                <v-list-item
                  v-for="perm in perms"
                  :key="perm.id"
                  class="px-0"
                  :disabled="saving"
                  @click="addPermission(perm.id)"
                >
                  <template v-slot:prepend>
                    <v-icon
                      :color="perm.is_dangerous ? 'error' : 'success'"
                      size="small"
                    >
                      {{ perm.is_dangerous ? 'mdi-alert-circle' : 'mdi-plus-circle' }}
                    </v-icon>
                  </template>
                  <v-list-item-title>
                    {{ perm.display_name }}
                    <v-chip
                      v-if="perm.is_dangerous"
                      size="x-small"
                      color="error"
                      variant="tonal"
                      class="ml-2"
                    >
                      Dangerous
                    </v-chip>
                  </v-list-item-title>
                  <v-list-item-subtitle>
                    <code class="text-caption">{{ perm.name }}</code>
                  </v-list-item-subtitle>
                  <template v-slot:append>
                    <v-btn
                      icon
                      size="small"
                      variant="text"
                      color="primary"
                      :disabled="saving"
                      @click.stop="addPermission(perm.id)"
                    >
                      <v-icon>mdi-plus</v-icon>
                    </v-btn>
                  </template>
                </v-list-item>
                <v-list-item v-if="perms.length === 0" class="px-0">
                  <v-list-item-title class="text-grey text-body-2">
                    All permissions in this category are already assigned
                  </v-list-item-title>
                </v-list-item>
              </v-list>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <div v-if="Object.keys(availablePermissionsByCategory).length === 0" class="text-center pa-4">
          <v-icon size="48" color="grey-lighten-1">mdi-check-all</v-icon>
          <p class="text-grey mt-2">All permissions are already assigned to this role</p>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="closeDialog">
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRbacStore, type RoleResponse, type PermissionResponse, type RoleWithPermissionsResponse } from '@/stores/rbac'

const props = defineProps<{
  modelValue: boolean
  role: RoleResponse | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  updated: []
}>()

const rbacStore = useRbacStore()
const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
const roleData = ref<RoleWithPermissionsResponse | null>(null)

const dialogOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

// Current permissions assigned to role
const currentPermissions = computed(() => roleData.value?.permissions ?? [])

// All permissions not yet assigned, filtered by search
const availablePermissions = computed(() => {
  const currentIds = new Set(currentPermissions.value.map(p => p.id))
  let available = rbacStore.permissions.filter(p => !currentIds.has(p.id))

  // Filter by search
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    available = available.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.display_name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query))
    )
  }

  return available
})

// Group available permissions by category
const availablePermissionsByCategory = computed(() => {
  const grouped: Record<string, PermissionResponse[]> = {}
  for (const perm of availablePermissions.value) {
    if (!grouped[perm.category]) {
      grouped[perm.category] = []
    }
    grouped[perm.category]!.push(perm)
  }
  return grouped
})

// Watch for role changes to load data
watch(
  () => [props.modelValue, props.role],
  async ([open, role]) => {
    if (open && role) {
      await loadRoleData()
    }
  },
  { immediate: true }
)

async function loadRoleData() {
  if (!props.role) return

  loading.value = true
  try {
    roleData.value = await rbacStore.getRole(props.role.id)
    // Ensure we have permissions loaded
    if (rbacStore.permissions.length === 0) {
      await rbacStore.fetchPermissions()
    }
  } catch {
    // Error handled in store
  } finally {
    loading.value = false
  }
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    platform: 'purple',
    team: 'blue',
    league: 'green',
    tournament: 'orange',
    admin: 'error',
  }
  return colors[category] || 'grey'
}

async function addPermission(permissionId: string) {
  if (!props.role || saving.value) return

  saving.value = true
  try {
    roleData.value = await rbacStore.addPermissionToRole(props.role.id, permissionId)
    emit('updated')
  } catch {
    // Error handled in store
  } finally {
    saving.value = false
  }
}

async function removePermission(permissionId: string) {
  if (!props.role || saving.value) return

  saving.value = true
  try {
    roleData.value = await rbacStore.removePermissionFromRole(props.role.id, permissionId)
    emit('updated')
  } catch {
    // Error handled in store
  } finally {
    saving.value = false
  }
}

function closeDialog() {
  dialogOpen.value = false
  roleData.value = null
  searchQuery.value = ''
}
</script>
