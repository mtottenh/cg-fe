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

    <ErrorAlert :error="error" retryable @clear="rbacStore.clearError()" @retry="loadData" />

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
      <!--
        P-70: this page could author a role and hang permissions off it, but
        never attach one to a PERSON — so admins, organisers and moderators
        could only be minted by seed or hand-written SQL, and on day one nobody
        could onboard a moderator. The three store actions this tab drives
        (getUserRoles / assignRoleToUser / revokeRoleFromUser) already existed
        with zero consumers.
      -->
      <v-tab value="users">
        <v-icon start>mdi-account-key-outline</v-icon>
        Users
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

          <div class="table-scroll">
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
                <div class="text-caption text-medium-emphasis">{{ item.name }}</div>
              </template>

              <template v-slot:item.category="{ item }">
                <v-chip
                  :color="getCategoryColor(item.category)"
                  size="small"
                  variant="tonal"
                >
                  {{ getStatusLabel(permissionCategoryMap, item.category) }}
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

              <!--
                The three aria-labels here used to be rotated one position out
                of step with the handlers they sit on: the button announced as
                "Manage permissions" was the one wired to `confirmDeleteRole`.
                A screen-reader user asking to manage permissions would have
                been given the destructive action instead. Each label now names
                what its own @click does, matching the visible `title`.
              -->
              <template v-slot:item.actions="{ item }">
                <v-btn aria-label="Manage permissions"
                  icon
                  size="small"
                  variant="text"
                  title="Manage Permissions"
                  @click="openRolePermissionsModal(item)"
                >
                  <v-icon>mdi-shield-key</v-icon>
                </v-btn>
                <v-btn aria-label="Edit role"
                  icon
                  size="small"
                  variant="text"
                  title="Edit Role"
                  @click="openEditRoleModal(item)"
                >
                  <v-icon>mdi-pencil</v-icon>
                </v-btn>
                <v-btn aria-label="Delete role"
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
                  <p class="text-medium-emphasis">No roles found</p>
                </div>
              </template>
            </v-data-table>
          </div>
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
                  <span class="text-body-2 text-medium-emphasis">{{ perms.length }} permissions</span>
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
            <p class="text-medium-emphasis">No permissions found</p>
          </div>
        </v-card>
      </v-window-item>

      <!-- Users Tab (P-70) -->
      <v-window-item value="users">
        <v-card>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis mb-4">
              Platform roles are what make someone an administrator, organiser or
              moderator. Find a person to see the roles they hold and change them.
            </p>

            <!--
              P-95's lesson, applied: search by name. Asking an operator for a
              user UUID makes the feature unusable, because no surface in the
              product displays one.
            -->
            <v-row align="start">
              <v-col cols="12" md="5">
                <UserSearchAutocomplete
                  v-model="selectedPlayer"
                  label="Find a user"
                  placeholder="Search by player name..."
                  @select="onUserSelected"
                />
              </v-col>
            </v-row>

            <ErrorAlert
              :error="userLookupError"
              @clear="clearUserLookupError"
            />

            <template v-if="selectedUserId">
              <v-divider class="my-4" />

              <div class="d-flex align-center mb-4">
                <v-icon class="mr-2">mdi-account</v-icon>
                <span class="text-subtitle-1 font-weight-medium" data-testid="role-subject">
                  {{ selectedUserLabel }}
                </span>
              </div>

              <!-- Assign -->
              <v-row align="center" class="mb-2">
                <v-col cols="12" md="5">
                  <v-select
                    aria-label="Role to assign"
                    v-model="roleToAssign"
                    :items="grantableRoleOptions"
                    label="Role to assign"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    data-testid="role-to-assign"
                    :disabled="grantableRoleOptions.length === 0"
                    :messages="grantableRoleOptions.length === 0 ? noGrantableRolesMessage : undefined"
                  />
                </v-col>
                <v-col cols="12" md="3">
                  <v-btn
                    color="primary"
                    prepend-icon="mdi-account-plus"
                    :loading="rbacStore.assignRoleState.loading"
                    :disabled="!roleToAssign"
                    data-testid="assign-role"
                    @click="assignRole"
                  >
                    Assign Role
                  </v-btn>
                </v-col>
              </v-row>

              <ErrorAlert
                :error="rbacStore.assignRoleState.error"
                @clear="rbacStore.assignRoleState.error = null"
              />

              <!-- Current assignments -->
              <div class="table-scroll">
                <v-data-table
                  :headers="userRoleHeaders"
                  :items="userRoles"
                  :items-per-page="20"
                  class="elevation-0"
                  data-testid="user-roles-table"
                >
                  <template v-slot:item.role="{ item }">
                    <div class="d-flex align-center" data-testid="user-role-row">
                      <v-chip
                        v-if="item.role.color"
                        :color="item.role.color"
                        size="x-small"
                        class="mr-2"
                        variant="flat"
                      />
                      <div>
                        <div class="font-weight-medium">{{ item.role.display_name }}</div>
                        <div class="text-caption text-medium-emphasis">{{ item.role.name }}</div>
                      </div>
                    </div>
                  </template>

                  <template v-slot:item.scope="{ item }">
                    <span v-if="item.scope_type" class="text-caption">
                      {{ item.scope_type }}
                    </span>
                    <span v-else class="text-caption text-medium-emphasis">Platform-wide</span>
                  </template>

                  <template v-slot:item.granted_at="{ item }">
                    <span class="text-caption">{{ formatDate(item.granted_at) }}</span>
                  </template>

                  <template v-slot:item.expires_at="{ item }">
                    <span class="text-caption">
                      {{ item.expires_at ? formatDate(item.expires_at) : 'Never' }}
                    </span>
                  </template>

                  <!--
                    Revoke is confirm-gated: taking a role away is a privilege
                    change, and the operator has to be told WHOSE and WHICH.
                    The button is only offered for roles this admin could also
                    grant — see `canRevoke` for why that is a guard-rail and
                    not a security boundary.
                  -->
                  <template v-slot:item.actions="{ item }">
                    <v-btn
                      v-if="canRevoke(item.role.priority)"
                      aria-label="Revoke role"
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      title="Revoke Role"
                      :data-testid="`revoke-role-${item.role.name}`"
                      @click="confirmRevokeRole(item)"
                    >
                      <v-icon>mdi-account-remove</v-icon>
                    </v-btn>
                    <span v-else class="text-caption text-medium-emphasis">
                      Outranks you
                    </span>
                  </template>

                  <template v-slot:no-data>
                    <div class="text-center pa-8">
                      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-account-off</v-icon>
                      <p class="text-medium-emphasis" data-testid="no-user-roles">
                        This user holds no platform roles
                      </p>
                    </div>
                  </template>
                </v-data-table>
              </div>

              <ErrorAlert
                :error="rbacStore.revokeRoleState.error"
                @clear="rbacStore.revokeRoleState.error = null"
              />
            </template>
          </v-card-text>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Delete Confirmation Dialog -->
    <ConfirmDialogHost :dialog="confirmDialog" />

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
import {
  useRbacStore,
  type RoleResponse,
  type PermissionResponse,
  type UserRoleAssignmentResponse,
} from '@/stores/rbac'
import { useAuthStore } from '@/stores/auth'
import { usePlayersStore } from '@/stores/players'
import RoleCreateEditModal from '@/components/admin/RoleCreateEditModal.vue'
import RolePermissionsModal from '@/components/admin/RolePermissionsModal.vue'
import UserSearchAutocomplete from '@/components/admin/UserSearchAutocomplete.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import { formatDate } from '@/utils/formatters'
import { permissionCategoryMap, getStatusColor, getStatusLabel } from '@/utils/statusMaps'
import type { components } from '@/api/types'

type PlayerSummary = components['schemas']['PlayerSearchResponse']

const rbacStore = useRbacStore()
const authStore = useAuthStore()
const playersStore = usePlayersStore()
const { roles, permissions, userRoles, loading, error } = storeToRefs(rbacStore)

// State
const activeTab = ref('roles')

// ── Users tab (P-70) ────────────────────────────────────────────────────────
const selectedPlayer = ref<PlayerSummary | null>(null)
/** The *user* id — `UserSearchAutocomplete` yields a PLAYER id, see below. */
const selectedUserId = ref<string | null>(null)
const selectedUserLabel = ref('')
const roleToAssign = ref<string | null>(null)
const userLookupError = ref<string | null>(null)

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

const userRoleHeaders = [
  { title: 'Role', key: 'role', sortable: false },
  { title: 'Scope', key: 'scope', width: '140px', sortable: false },
  { title: 'Granted', key: 'granted_at', width: '130px' },
  { title: 'Expires', key: 'expires_at', width: '130px' },
  { title: 'Actions', key: 'actions', width: '120px', sortable: false, align: 'center' as const },
]

/** Exempt from the priority ceiling, matching `handlers/roles.rs:30`. */
const SUPER_ADMIN_ROLE = 'super_admin'

/**
 * The acting admin's own ceiling.
 *
 * This mirrors the backend rule at `handlers/roles.rs:575-603` exactly: a
 * caller may only grant roles *strictly below* their own highest-priority
 * role, and a caller holding `super_admin` is exempt (otherwise `>=` would
 * stop super_admin granting super_admin). Mirroring rather than inventing
 * matters — a UI that offered a role the API refuses would put a 403 in front
 * of the operator with no way to tell which roles are actually available.
 */
const actingPriorityCeiling = computed(() => {
  const mine = authStore.roles
  if (mine.some((r) => r.role.name === SUPER_ADMIN_ROLE)) return Number.POSITIVE_INFINITY
  return mine.reduce((max, r) => Math.max(max, r.role.priority), Number.NEGATIVE_INFINITY)
})

const grantableRoleOptions = computed(() =>
  roles.value
    .filter((r) => r.priority < actingPriorityCeiling.value)
    .map((r) => ({ value: r.id, title: `${r.display_name} (${r.name})` })),
)

const noGrantableRolesMessage =
  'Your own role does not outrank any assignable role, so you cannot grant one.'

/**
 * Whether the acting admin may revoke a role of this priority.
 *
 * **The backend does not enforce this.** `assign_role_to_user` applies the
 * priority ceiling; `revoke_role_from_user` (`handlers/roles.rs:646`) checks
 * only `admin.users.manage`, so an API caller holding that permission can
 * strip a role from someone who outranks them — including a super_admin. This
 * check is therefore a guard-rail against an accidental click, not a security
 * boundary, and the honest fix belongs in the handler.
 */
function canRevoke(rolePriority: number): boolean {
  return rolePriority < actingPriorityCeiling.value
}

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

const getCategoryColor = (category: string) => getStatusColor(permissionCategoryMap, category)

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

// ── Users tab (P-70) ────────────────────────────────────────────────────────

function clearUserLookupError() {
  userLookupError.value = null
}

/**
 * `UserSearchAutocomplete` is backed by `GET /v1/players`, whose `id` is a
 * PLAYER id — and `players.id` is not `users.id` (`migrations/0002`: players
 * has its own PK plus a `user_id` FK). The RBAC endpoints are user-scoped, so
 * the player id has to be resolved before anything else. Getting this wrong is
 * silent: `/v1/admin/users/{player_id}/roles` returns an empty list rather
 * than a 404, so the tab would just say "no roles" for everybody.
 */
async function onUserSelected(player: PlayerSummary | null) {
  roleToAssign.value = null
  rbacStore.clearUserRoles()
  userLookupError.value = null

  if (!player) {
    selectedUserId.value = null
    selectedUserLabel.value = ''
    return
  }

  selectedUserLabel.value = player.display_name

  try {
    const full = await playersStore.fetchPlayer(player.id)
    if (!full?.user_id) {
      userLookupError.value = `Could not resolve a user account for ${player.display_name}.`
      selectedUserId.value = null
      return
    }
    selectedUserId.value = full.user_id
    await rbacStore.getUserRoles(full.user_id)
  } catch (e) {
    selectedUserId.value = null
    userLookupError.value = e instanceof Error ? e.message : 'Failed to load this user'
  }
}

async function assignRole() {
  if (!selectedUserId.value || !roleToAssign.value) return
  const role = roles.value.find((r) => r.id === roleToAssign.value)
  try {
    await rbacStore.assignRoleToUser(selectedUserId.value, roleToAssign.value)
    snackbar.show(
      `Granted ${role?.display_name ?? 'role'} to ${selectedUserLabel.value}`,
      'success',
    )
    roleToAssign.value = null
  } catch {
    // Surfaced by the assign-action ErrorAlert; the store keeps the real
    // reason (e.g. the backend's priority-ceiling 403) rather than a generic
    // page-wide message — P-116/P-124.
  }
}

function confirmRevokeRole(assignment: UserRoleAssignmentResponse) {
  const userId = selectedUserId.value
  if (!userId) return
  confirmDialog.confirm({
    title: 'Revoke Role',
    // Names the role AND the person: revoking a platform role is a privilege
    // change, and a dialog that says "this role" is the P-123 mistake in a
    // different table.
    message: `Remove the ${assignment.role.display_name} role from ${selectedUserLabel.value}? They lose every permission it grants immediately.`,
    action: 'Revoke',
    color: 'error',
    handler: async () => {
      await rbacStore.revokeRoleFromUser(
        userId,
        assignment.role.id,
        assignment.scope_type ?? undefined,
        assignment.scope_id ?? undefined,
      )
      snackbar.show(
        `Revoked ${assignment.role.display_name} from ${selectedUserLabel.value}`,
        'success',
      )
    },
  })
}


onMounted(() => {
  loadData()
})
</script>

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
