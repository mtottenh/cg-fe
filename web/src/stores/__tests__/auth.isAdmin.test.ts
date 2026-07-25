import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const apiGet = vi.fn()

vi.mock('@/api', () => ({
  api: { GET: (...args: unknown[]) => apiGet(...args), POST: vi.fn() },
  setAuthToken: vi.fn(),
  getAuthToken: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    detail: string
    constructor(status: number, detail: string) {
      super(detail)
      this.status = status
      this.detail = detail
    }
  },
}))

import { useAuthStore } from '../auth'

/**
 * The roles the RBAC seed migration actually creates.
 *
 * `api/migrations/0014_seed_rbac.sql` seeds exactly these four. The list is
 * repeated here because it is the whole point of the test: P-152 was a frontend
 * set that gated the admin UI on a role name — `'admin'` — that **no migration
 * has ever created**. Nothing compared the two sides, so the mismatch was
 * invisible for the life of the guard.
 */
const SEEDED_ROLES = ['super_admin', 'platform_admin', 'moderator', 'user'] as const

function roleAssignment(name: (typeof SEEDED_ROLES)[number]) {
  return {
    id: `assignment-${name}`,
    user_id: 'user-1',
    role: { id: `role-${name}`, name, display_name: name, priority: 0 },
    scope_type: 'platform',
    scope_id: null,
    granted_at: new Date(0).toISOString(),
  }
}

/** Drive `isAdmin` by loading a single role assignment through the store. */
async function isAdminWithRole(name: (typeof SEEDED_ROLES)[number]): Promise<boolean> {
  const store = useAuthStore()
  apiGet.mockResolvedValueOnce({ data: { data: [roleAssignment(name)] }, error: undefined })
  await store.fetchMyRoles()
  return store.isAdmin
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

/**
 * P-152 — the admin route guard named a role that does not exist.
 *
 * `SYSTEM_ADMIN_ROLES` was `{'super_admin', 'admin'}`. Since no seeded role is
 * called `admin`, the set was effectively `{super_admin}` and a freshly-granted
 * `platform_admin` was redirected home by `router/index.ts:254` on every admin
 * route, and never shown the sidebar.
 *
 * That silently halved P-70, whose whole deploy-gate rationale was "no
 * moderator can be onboarded on day one": granting a platform role stopped
 * needing SQL, but the grantee still could not use the admin area.
 */
describe('auth store — isAdmin matches the seeded role catalogue (P-152)', () => {
  it('admits super_admin', async () => {
    expect(await isAdminWithRole('super_admin')).toBe(true)
  })

  it('admits platform_admin — the assertion that fails on the original set', async () => {
    expect(await isAdminWithRole('platform_admin')).toBe(true)
  })

  it('does NOT admit moderator', async () => {
    // The comment on SYSTEM_ADMIN_ROLES says "system-wide admin only, not
    // league/tournament moderators". Asserted so a later widening has to be a
    // deliberate change to this test rather than a quiet edit to the set.
    expect(await isAdminWithRole('moderator')).toBe(false)
  })

  it('does NOT admit a plain user', async () => {
    expect(await isAdminWithRole('user')).toBe(false)
  })

  it('does not admit a role name absent from the seed catalogue', async () => {
    const store = useAuthStore()
    // This is the shape of the original bug: a name that reads like an admin
    // role and matches nothing. Whichever direction the mismatch runs — a set
    // entry with no seeded role, or a seeded role with no set entry — the
    // symptom is a silent denial, so the guard must not treat an unknown name
    // as privileged.
    apiGet.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'assignment-x',
            user_id: 'user-1',
            role: { id: 'role-x', name: 'admin', display_name: 'admin', priority: 0 },
            scope_type: 'platform',
            scope_id: null,
            granted_at: new Date(0).toISOString(),
          },
        ],
      },
      error: undefined,
    })
    await store.fetchMyRoles()
    expect(store.isAdmin).toBe(false)
  })
})
