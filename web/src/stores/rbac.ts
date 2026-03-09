import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

// Export types from generated API
export type RoleResponse = components['schemas']['RoleResponse']
export type RoleWithPermissionsResponse = components['schemas']['RoleWithPermissionsResponse']
export type PermissionResponse = components['schemas']['PermissionResponse']
export type UserRoleAssignmentResponse = components['schemas']['UserRoleAssignmentResponse']
export type CreateRoleRequest = components['schemas']['CreateRoleRequest']
export type UpdateRoleRequest = components['schemas']['UpdateRoleRequest']
export type AssignRoleRequest = components['schemas']['AssignRoleRequest']
export type AddPermissionToRoleRequest = components['schemas']['AddPermissionToRoleRequest']

export const useRbacStore = defineStore('rbac', () => {
  // State
  const roles = ref<RoleResponse[]>([])
  const permissions = ref<PermissionResponse[]>([])
  const currentRole = ref<RoleWithPermissionsResponse | null>(null)
  const userRoles = ref<UserRoleAssignmentResponse[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Per-action states
  const fetchRolesState = createActionState()
  const getRoleState = createActionState()
  const createRoleState = createActionState()
  const updateRoleState = createActionState()
  const deleteRoleState = createActionState()
  const addPermissionState = createActionState()
  const removePermissionState = createActionState()
  const fetchPermissionsState = createActionState()
  const getUserRolesState = createActionState()
  const assignRoleState = createActionState()
  const revokeRoleState = createActionState()

  // ============== Role Management ==============

  async function fetchRoles(): Promise<RoleResponse[]> {
    return withActionState(fetchRolesState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/roles'))
      roles.value = result.data
      return roles.value
    }, 'Failed to load roles')
  }

  async function getRole(roleId: string): Promise<RoleWithPermissionsResponse> {
    return withActionState(getRoleState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/roles/{role_id}', {
        params: { path: { role_id: roleId } },
      }))
      currentRole.value = result.data
      return result.data
    }, 'Failed to get role')
  }

  async function createRole(request: CreateRoleRequest): Promise<RoleResponse> {
    return withActionState(createRoleState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/roles', {
        body: request,
      }))
      await fetchRoles()
      return result.data
    }, 'Failed to create role')
  }

  async function updateRole(roleId: string, request: UpdateRoleRequest): Promise<RoleResponse> {
    return withActionState(updateRoleState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/admin/roles/{role_id}', {
        params: { path: { role_id: roleId } },
        body: request,
      }))
      await fetchRoles()
      return result.data
    }, 'Failed to update role')
  }

  async function deleteRole(roleId: string): Promise<void> {
    return withActionState(deleteRoleState, async () => {
      await unwrapApi(api.DELETE('/v1/admin/roles/{role_id}', {
        params: { path: { role_id: roleId } },
      }))
      await fetchRoles()
    }, 'Failed to delete role')
  }

  // ============== Role Permissions ==============

  async function addPermissionToRole(roleId: string, permissionId: string): Promise<RoleWithPermissionsResponse> {
    return withActionState(addPermissionState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/roles/{role_id}/permissions', {
        params: { path: { role_id: roleId } },
        body: { permission_id: permissionId },
      }))
      currentRole.value = result.data
      return result.data
    }, 'Failed to add permission to role')
  }

  async function removePermissionFromRole(roleId: string, permissionId: string): Promise<RoleWithPermissionsResponse> {
    return withActionState(removePermissionState, async () => {
      const result = await unwrapApi(api.DELETE('/v1/admin/roles/{role_id}/permissions/{permission_id}', {
        params: { path: { role_id: roleId, permission_id: permissionId } },
      }))
      currentRole.value = result.data
      return result.data
    }, 'Failed to remove permission from role')
  }

  // ============== Permissions ==============

  async function fetchPermissions(): Promise<PermissionResponse[]> {
    return withActionState(fetchPermissionsState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/permissions'))
      permissions.value = result.data
      return permissions.value
    }, 'Failed to load permissions')
  }

  // ============== User Role Assignments ==============

  async function getUserRoles(userId: string): Promise<UserRoleAssignmentResponse[]> {
    return withActionState(getUserRolesState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/users/{user_id}/roles', {
        params: { path: { user_id: userId } },
      }))
      userRoles.value = result.data
      return result.data
    }, 'Failed to get user roles')
  }

  async function assignRoleToUser(
    userId: string,
    roleId: string,
    scopeType?: string,
    scopeId?: string,
    expiresAt?: string
  ): Promise<UserRoleAssignmentResponse> {
    return withActionState(assignRoleState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/users/{user_id}/roles', {
        params: { path: { user_id: userId } },
        body: {
          role_id: roleId,
          scope_type: scopeType ?? null,
          scope_id: scopeId ?? null,
          expires_at: expiresAt ?? null,
        },
      }))
      await getUserRoles(userId)
      return result.data
    }, 'Failed to assign role')
  }

  async function revokeRoleFromUser(
    userId: string,
    roleId: string,
    scopeType?: string,
    scopeId?: string
  ): Promise<void> {
    return withActionState(revokeRoleState, async () => {
      await unwrapApi(api.DELETE('/v1/admin/users/{user_id}/roles/{role_id}', {
        params: {
          path: { user_id: userId, role_id: roleId },
          query: { scope_type: scopeType, scope_id: scopeId },
        },
      }))
      await getUserRoles(userId)
    }, 'Failed to revoke role')
  }

  // ============== Utilities ==============

  function clearError() {
    error.value = null
  }

  function clearCurrentRole() {
    currentRole.value = null
  }

  function clearUserRoles() {
    userRoles.value = []
  }

  function getRolesByCategory() {
    const grouped: Record<string, RoleResponse[]> = {}
    for (const role of roles.value) {
      if (!grouped[role.category]) {
        grouped[role.category] = []
      }
      grouped[role.category]!.push(role)
    }
    return grouped
  }

  function getPermissionsByCategory() {
    const grouped: Record<string, PermissionResponse[]> = {}
    for (const permission of permissions.value) {
      if (!grouped[permission.category]) {
        grouped[permission.category] = []
      }
      grouped[permission.category]!.push(permission)
    }
    return grouped
  }

  return {
    // State
    roles,
    permissions,
    currentRole,
    userRoles,
    loading,
    error,

    // Role management
    fetchRoles,
    getRole,
    createRole,
    updateRole,
    deleteRole,

    // Role permissions
    addPermissionToRole,
    removePermissionFromRole,

    // Permissions
    fetchPermissions,

    // User roles
    getUserRoles,
    assignRoleToUser,
    revokeRoleFromUser,

    // Utilities
    clearError,
    clearCurrentRole,
    clearUserRoles,
    getRolesByCategory,
    getPermissionsByCategory,

    // Per-action states
    fetchRolesState,
    getRoleState,
    createRoleState,
    updateRoleState,
    deleteRoleState,
    addPermissionState,
    removePermissionState,
    fetchPermissionsState,
    getUserRolesState,
    assignRoleState,
    revokeRoleState,
  }
})
