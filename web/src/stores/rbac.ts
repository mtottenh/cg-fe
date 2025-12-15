import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

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

  // ============== Role Management ==============

  async function fetchRoles(): Promise<RoleResponse[]> {
    loading.value = true
    error.value = null

    try {
      const { data, error: apiError } = await api.GET('/v1/admin/roles')

      if (apiError) {
        throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to fetch roles')
      }

      if (data) {
        roles.value = data.data
      }
      return data?.data ?? []
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to load roles'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function getRole(roleId: string): Promise<RoleWithPermissionsResponse> {
    const { data, error: apiError } = await api.GET('/v1/admin/roles/{role_id}', {
      params: {
        path: { role_id: roleId },
      },
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to get role')
    }

    if (!data) {
      throw new ApiError(404, 'Role not found')
    }

    currentRole.value = data.data
    return data.data
  }

  async function createRole(request: CreateRoleRequest): Promise<RoleResponse> {
    const { data, error: apiError } = await api.POST('/v1/admin/roles', {
      body: request,
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to create role')
    }

    if (!data) {
      throw new ApiError(500, 'No data returned')
    }

    // Refresh roles list
    await fetchRoles()
    return data.data
  }

  async function updateRole(roleId: string, request: UpdateRoleRequest): Promise<RoleResponse> {
    const { data, error: apiError } = await api.PATCH('/v1/admin/roles/{role_id}', {
      params: {
        path: { role_id: roleId },
      },
      body: request,
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to update role')
    }

    if (!data) {
      throw new ApiError(500, 'No data returned')
    }

    // Refresh roles list
    await fetchRoles()
    return data.data
  }

  async function deleteRole(roleId: string): Promise<void> {
    const { error: apiError } = await api.DELETE('/v1/admin/roles/{role_id}', {
      params: {
        path: { role_id: roleId },
      },
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to delete role')
    }

    // Refresh roles list
    await fetchRoles()
  }

  // ============== Role Permissions ==============

  async function addPermissionToRole(roleId: string, permissionId: string): Promise<RoleWithPermissionsResponse> {
    const { data, error: apiError } = await api.POST('/v1/admin/roles/{role_id}/permissions', {
      params: {
        path: { role_id: roleId },
      },
      body: { permission_id: permissionId },
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to add permission to role')
    }

    if (!data) {
      throw new ApiError(500, 'No data returned')
    }

    currentRole.value = data.data
    return data.data
  }

  async function removePermissionFromRole(roleId: string, permissionId: string): Promise<RoleWithPermissionsResponse> {
    const { data, error: apiError } = await api.DELETE('/v1/admin/roles/{role_id}/permissions/{permission_id}', {
      params: {
        path: { role_id: roleId, permission_id: permissionId },
      },
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to remove permission from role')
    }

    if (!data) {
      throw new ApiError(500, 'No data returned')
    }

    currentRole.value = data.data
    return data.data
  }

  // ============== Permissions ==============

  async function fetchPermissions(): Promise<PermissionResponse[]> {
    loading.value = true
    error.value = null

    try {
      const { data, error: apiError } = await api.GET('/v1/admin/permissions')

      if (apiError) {
        throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to fetch permissions')
      }

      if (data) {
        permissions.value = data.data
      }
      return data?.data ?? []
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to load permissions'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // ============== User Role Assignments ==============

  async function getUserRoles(userId: string): Promise<UserRoleAssignmentResponse[]> {
    const { data, error: apiError } = await api.GET('/v1/admin/users/{user_id}/roles', {
      params: {
        path: { user_id: userId },
      },
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to get user roles')
    }

    if (!data) {
      throw new ApiError(500, 'No data returned')
    }

    userRoles.value = data.data
    return data.data
  }

  async function assignRoleToUser(
    userId: string,
    roleId: string,
    scopeType?: string,
    scopeId?: string,
    expiresAt?: string
  ): Promise<UserRoleAssignmentResponse> {
    const { data, error: apiError } = await api.POST('/v1/admin/users/{user_id}/roles', {
      params: {
        path: { user_id: userId },
      },
      body: {
        role_id: roleId,
        scope_type: scopeType ?? null,
        scope_id: scopeId ?? null,
        expires_at: expiresAt ?? null,
      },
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to assign role')
    }

    if (!data) {
      throw new ApiError(500, 'No data returned')
    }

    // Refresh user roles
    await getUserRoles(userId)
    return data.data
  }

  async function revokeRoleFromUser(
    userId: string,
    roleId: string,
    scopeType?: string,
    scopeId?: string
  ): Promise<void> {
    const { error: apiError } = await api.DELETE('/v1/admin/users/{user_id}/roles/{role_id}', {
      params: {
        path: { user_id: userId, role_id: roleId },
        query: {
          scope_type: scopeType,
          scope_id: scopeId,
        },
      },
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to revoke role')
    }

    // Refresh user roles
    await getUserRoles(userId)
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

  // Group roles by category
  function getRolesByCategory() {
    const grouped: Record<string, RoleResponse[]> = {}
    for (const role of roles.value) {
      if (!grouped[role.category]) {
        grouped[role.category] = []
      }
      grouped[role.category].push(role)
    }
    return grouped
  }

  // Group permissions by category
  function getPermissionsByCategory() {
    const grouped: Record<string, PermissionResponse[]> = {}
    for (const permission of permissions.value) {
      if (!grouped[permission.category]) {
        grouped[permission.category] = []
      }
      grouped[permission.category].push(permission)
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
  }
})
