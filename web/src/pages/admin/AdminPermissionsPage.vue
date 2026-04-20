<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Roles & Permissions</h1>
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        @click="openCreateRoleModal"
      >
        Create Role
      </v-btn>
    </div>

    <!-- Tabs -->
    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="roles">
        <v-icon start>mdi-account-key</v-icon>
        Roles
      </v-tab>
      <v-tab value="permissions">
        <v-icon start>mdi-shield-lock</v-icon>
        Permissions
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <!-- Roles Tab -->
      <v-window-item value="roles">
        <v-card>
          <v-overlay
            :model-value="loading"
            contained
            class="align-center justify-center"
            scrim="rgba(0,0,0,0.3)"
          >
            <v-progress-circular indeterminate color="primary" />
          </v-overlay>

          <v-data-table
            :headers="roleHeaders"
            :items="roles"
            :items-per-page="20"
            class="elevation-0"
          >
            <template v-slot:item.name="{ item }">
              <div class="d-flex align-center">
                <v-chip
                  v-if="item.color"
                  :color="item.color"
                  size="x-small"
                  class="mr-2"
                  variant="flat"
                />
                <span class="font-weight-medium">{{ item.display_name }}</span>
                <v-chip
                  v-if="item.is_system"
                  size="x-small"
                  color="grey"
                  variant="tonal"
                  class="ml-2"
                >
                  System
                </v-chip>
                <v-chip
                  v-if="item.is_default"
                  size="x-small"
                  color="info"
                  variant="tonal"
                  class="ml-2"
                >
                  Default
                </v-chip>
              </div>
              <div class="text-caption text-grey">{{ item.name }}</div>
            </template>

            <template v-slot:item.category="{ item }">
              <v-chip
                :color="getCategoryColor(item.category)"
                size="small"
                variant="tonal"
              >
                {{ item.category }}
              </v-chip>
            </template>

            <template v-slot:item.priority="{ item }">
              <span class="text-caption">{{ item.priority }}</span>
            </template>

            <template v-slot:item.description="{ item }">
              <div class="text-truncate" style="max-width: 300px" :title="item.description ?? undefined">
                {{ item.description || '-' }}
              </div>
            </template>

            <template v-slot:item.actions="{ item }">
              <v-btn
                icon
                size="small"
                variant="text"
                title="Manage Permissions"
                @click="openRolePermissionsModal(item)"
              >
                <v-icon>mdi-shield-key</v-icon>
              </v-btn>
              <v-btn
                icon
                size="small"
                variant="text"
                title="Edit Role"
                @click="openEditRoleModal(item)"
              >
                <v-icon>mdi-pencil</v-icon>
              </v-btn>
              <v-btn
                v-if="!item.is_system"
                icon
                size="small"
                variant="text"
                color="error"
                title="Delete Role"
                @click="confirmDeleteRole(item)"
              >
                <v-icon>mdi-delete</v-icon>
              </v-btn>
            </template>

            <template v-slot:no-data>
              <div class="text-center pa-8">
                <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-account-key</v-icon>
                <p class="text-grey">No roles found</p>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-window-item>

      <!-- Permissions Tab -->
      <v-window-item value="permissions">
        <v-card>
          <v-overlay
            :model-value="loading"
            contained
            class="align-center justify-center"
            scrim="rgba(0,0,0,0.3)"
          >
            <v-progress-circular indeterminate color="primary" />
          </v-overlay>

          <!-- Group by category -->
          <v-expansion-panels variant="accordion" class="pa-4">
            <v-expansion-panel
              v-for="(perms, category) in permissionsByCategory"
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
                  <span class="text-body-2 text-grey">{{ perms.length }} permissions</span>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-list density="compact" class="bg-transparent">
                  <v-list-item
                    v-for="perm in perms"
                    :key="perm.id"
                    class="px-0"
                  >
                    <template v-slot:prepend>
                      <v-icon
                        :color="perm.is_dangerous ? 'error' : 'primary'"
                        size="small"
                      >
                        {{ perm.is_dangerous ? 'mdi-alert-circle' : 'mdi-check-circle' }}
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
                      <span v-if="perm.description" class="ml-2">- {{ perm.description }}</span>
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <div v-if="permissions.length === 0" class="text-center pa-8">
            <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-shield-lock</v-icon>
            <p class="text-grey">No permissions found</p>
          </div>
        </v-card>
      </v-window-item>
    </v-window>

    <v-alert v-if="error" type="error" class="mt-4" closable @click:close="rbacStore.clearError()">
      {{ error }}
    </v-alert>

    <!-- Delete Confirmation Dialog -->
    <ConfirmDialog
      :open="confirmDialog.state.open"
      :title="confirmDialog.state.title"
      :message="confirmDialog.state.message"
      :action-label="confirmDialog.state.actionLabel"
      :color="confirmDialog.state.color"
      :loading="confirmDialog.state.loading"
      @confirm="confirmDialog.execute"
      @cancel="confirmDialog.cancel"
    />

    <!-- Modals -->
    <RoleCreateEditModal
      v-model="roleModalOpen"
      :role="selectedRole"
      @saved="onRoleSaved"
    />

    <RolePermissionsModal
      v-model="rolePermissionsModalOpen"
      :role="selectedRoleForPermissions"
      @updated="onRolePermissionsUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRbacStore, type RoleResponse, type PermissionResponse } from '@/stores/rbac'
import RoleCreateEditModal from '@/components/admin/RoleCreateEditModal.vue'
import RolePermissionsModal from '@/components/admin/RolePermissionsModal.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const rbacStore = useRbacStore()
const { roles, permissions, loading, error } = storeToRefs(rbacStore)

// State
const activeTab = ref('roles')

// Modal state
const roleModalOpen = ref(false)
const selectedRole = ref<RoleResponse | null>(null)
const rolePermissionsModalOpen = ref(false)
const selectedRoleForPermissions = ref<RoleResponse | null>(null)

// Snackbar
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

const permissionsByCategory = computed(() => {
  const grouped: Record<string, PermissionResponse[]> = {}
  for (const perm of permissions.value) {
    if (!grouped[perm.category]) {
      grouped[perm.category] = []
    }
    grouped[perm.category]!.push(perm)
  }
  return grouped
})

// Table headers
const roleHeaders = [
  { title: 'Role', key: 'name' },
  { title: 'Category', key: 'category', width: '120px' },
  { title: 'Priority', key: 'priority', width: '80px' },
  { title: 'Description', key: 'description' },
  { title: 'Actions', key: 'actions', width: '130px', sortable: false, align: 'center' as const },
]

// Methods
async function loadData() {
  try {
    await Promise.all([
      rbacStore.fetchRoles(),
      rbacStore.fetchPermissions(),
    ])
  } catch {
    // Error handled in store
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
  return colors[category] ?? 'grey'
}

function openCreateRoleModal() {
  selectedRole.value = null
  roleModalOpen.value = true
}

function openEditRoleModal(role: RoleResponse) {
  selectedRole.value = role
  roleModalOpen.value = true
}

function openRolePermissionsModal(role: RoleResponse) {
  selectedRoleForPermissions.value = role
  rolePermissionsModalOpen.value = true
}

function confirmDeleteRole(role: RoleResponse) {
  confirmDialog.confirm({
    title: 'Delete Role',
    message: `Are you sure you want to delete the role ${role.display_name}? This action cannot be undone.`,
    action: 'Delete',
    color: 'error',
    handler: async () => {
      await rbacStore.deleteRole(role.id)
      snackbar.show('Role deleted successfully', 'success')
    },
  })
}

function onRoleSaved() {
  snackbar.show('Role saved successfully', 'success')
}

function onRolePermissionsUpdated() {
  snackbar.show('Role permissions updated', 'success')
}


onMounted(() => {
  loadData()
})
</script>
