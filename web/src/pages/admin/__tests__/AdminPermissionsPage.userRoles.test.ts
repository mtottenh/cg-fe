import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api } from '@/api'
import { createSnackbar, SnackbarKey } from '@/composables/useSnackbar'
import { useAuthStore } from '@/stores/auth'
import AdminPermissionsPage from '@/pages/admin/AdminPermissionsPage.vue'
import UserSearchAutocomplete from '@/components/admin/UserSearchAutocomplete.vue'

/**
 * P-70's second requirement: **the UI must not offer a role the acting admin
 * cannot grant.**
 *
 * The backend does enforce a priority ceiling on assignment
 * (`handlers/roles.rs:575-603`): a caller may grant only roles strictly below
 * their own highest-priority role, with `super_admin` exempt. Seeded
 * priorities (migration 0014) are super_admin=1000, platform_admin=900,
 * moderator=500, user=100.
 *
 * This cannot be driven through e2e: the seeded e2e admin IS a super_admin, so
 * every role is grantable and the filter is invisible. And the frontend's admin
 * route guard only recognises the role names `super_admin` and `admin`
 * (`stores/auth.ts:30`), so a platform_admin cannot even reach `/admin` to be
 * observed. A mounted unit test is the only instrument that can see this rule,
 * so it is the one used — `e2e/platform-role-assignment.spec.ts` covers the
 * grant/revoke round trip that e2e CAN see.
 *
 * Why these assertions can fail: they read the real `items` off the real
 * `v-select` after mounting the real page. Dropping the filter (offering
 * `roles` unfiltered) makes the platform_admin cases fail on `super_admin`
 * being offered; tightening it to `<=` makes the super_admin case fail.
 */

const vuetify = createVuetify({ components, directives })

const ROLES = [
  {
    id: 'role-super',
    name: 'super_admin',
    display_name: 'Super Admin',
    description: null,
    category: 'system',
    priority: 1000,
    color: '#FF0000',
    is_system: true,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-platform',
    name: 'platform_admin',
    display_name: 'Platform Admin',
    description: null,
    category: 'platform',
    priority: 900,
    color: '#FF6B00',
    is_system: true,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-mod',
    name: 'moderator',
    display_name: 'Moderator',
    description: null,
    category: 'platform',
    priority: 500,
    color: '#9B59B6',
    is_system: true,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-user',
    name: 'user',
    display_name: 'User',
    description: null,
    category: 'platform',
    priority: 100,
    color: '#3498DB',
    is_system: true,
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

function assignment(role: (typeof ROLES)[number]) {
  return {
    id: `assignment-${role.name}`,
    role,
    scope_type: null,
    scope_id: null,
    granted_by: null,
    granted_at: '2026-01-01T00:00:00Z',
    expires_at: null,
  }
}

/** The roles the SUBJECT of the tab already holds. Reassigned per test. */
let subjectAssignments: ReturnType<typeof assignment>[] = []

const mockGet = api.GET as unknown as Mock

let wrapper: VueWrapper | null = null

beforeEach(() => {
  subjectAssignments = [assignment(ROLES[3]!)]
  mockGet.mockImplementation((path: string) => {
    switch (path) {
      case '/v1/admin/roles':
        return Promise.resolve({ data: { data: ROLES } })
      case '/v1/admin/permissions':
        return Promise.resolve({ data: { data: [] } })
      case '/v1/players/{player_id}':
        return Promise.resolve({
          data: { data: { id: 'player-1', user_id: 'user-1', display_name: 'Target Person' } },
        })
      case '/v1/admin/users/{user_id}/roles':
        return Promise.resolve({ data: { data: subjectAssignments } })
      default:
        return Promise.resolve({ data: { data: [] } })
    }
  })
})

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

/**
 * Mount the page as `actingRoles` describes the signed-in admin, open the
 * Users tab, and select a person — the assign form only exists once a subject
 * is chosen, which is itself part of the design (there is nothing to assign
 * a role *to* before then).
 */
async function mountUsersTab(actingRoles: (typeof ROLES)[number][]) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const auth = useAuthStore()
  auth.roles = actingRoles.map(assignment)

  wrapper = mount(AdminPermissionsPage, {
    global: {
      plugins: [pinia, vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
  })
  await flushPromises()

  const usersTab = wrapper
    .findAllComponents({ name: 'VTab' })
    .find((t) => t.text().trim() === 'Users')
  expect(usersTab, 'a Users tab is rendered (P-70)').toBeTruthy()
  await usersTab!.trigger('click')
  await flushPromises()

  wrapper
    .findComponent(UserSearchAutocomplete)
    .vm.$emit('select', { id: 'player-1', display_name: 'Target Person', looking_for_team: false })
  await flushPromises()

  return wrapper
}

function roleSelect(w: VueWrapper) {
  const select = w
    .findAllComponents({ name: 'VSelect' })
    .find((s) => s.props('label') === 'Role to assign')
  expect(select, 'a v-select labelled "Role to assign" is rendered').toBeTruthy()
  return select!
}

function offeredRoleIds(w: VueWrapper): string[] {
  const items = roleSelect(w).props('items') as { value: string }[]
  return items.map((i) => i.value)
}

describe('AdminPermissionsPage — Users tab exists at all (P-70)', () => {
  it('renders a Users tab and loads the subject’s current role assignments', async () => {
    const w = await mountUsersTab([ROLES[0]!])
    expect(w.find('[data-testid="role-subject"]').text()).toBe('Target Person')
    // The tab reads the USER id, not the player id it was handed. Today those
    // UUIDs are equal by a documented, deliberate 1:1 invariant
    // (`make_shared_account_ids`, api portal-domain/src/services/user.rs:145-171)
    // — which is exactly why this needs pinning: nothing would visibly break if
    // the resolution step were dropped, right up until that invariant is
    // migrated away (its own doc reserves the right), and then the failure is
    // silent, because `/v1/admin/users/{unknown}/roles` answers 200 with an
    // empty list rather than 404. Hence the mock returns a user_id that differs
    // from the player id: a page relying on the invariant fails here today.
    expect(mockGet).toHaveBeenCalledWith('/v1/admin/users/{user_id}/roles', {
      params: { path: { user_id: 'user-1' } },
    })
    expect(w.findAll('[data-testid="user-role-row"]')).toHaveLength(1)
  })
})

describe('AdminPermissionsPage — grantable roles respect the backend ceiling', () => {
  it('a super_admin may grant every role, including super_admin', async () => {
    // The backend exempts super_admin explicitly, because the `>=` ceiling
    // would otherwise stop 1000 granting 1000.
    const w = await mountUsersTab([ROLES[0]!])
    expect(offeredRoleIds(w)).toEqual([
      'role-super',
      'role-platform',
      'role-mod',
      'role-user',
    ])
  })

  it('a platform_admin is not offered super_admin, nor their own role', async () => {
    // The escalation this rule exists to prevent: priority 900 must not be
    // able to mint a 1000, nor another 900.
    const w = await mountUsersTab([ROLES[1]!])
    expect(offeredRoleIds(w)).toEqual(['role-mod', 'role-user'])
    expect(offeredRoleIds(w)).not.toContain('role-super')
    expect(offeredRoleIds(w)).not.toContain('role-platform')
  })

  it('an admin whose highest role outranks nothing is offered no roles at all', async () => {
    // Honest rather than convenient: a caller at priority 100 can grant
    // nothing, and the select says so instead of offering options the API
    // will 403.
    const w = await mountUsersTab([ROLES[3]!])
    expect(offeredRoleIds(w)).toEqual([])
    expect(roleSelect(w).props('disabled')).toBe(true)
  })
})

describe('AdminPermissionsPage — revoke is offered only for roles you outrank', () => {
  it('offers revoke for a role below the acting admin', async () => {
    subjectAssignments = [assignment(ROLES[2]!)]
    const w = await mountUsersTab([ROLES[1]!])
    expect(w.find('[data-testid="revoke-role-moderator"]').exists()).toBe(true)
  })

  it('does not offer revoke for a role that outranks the acting admin', async () => {
    // NOTE this is a guard-rail, not a security boundary: `revoke_role_from_user`
    // (api handlers/roles.rs:646) applies NO priority ceiling — it checks only
    // `admin.users.manage` — so an API caller can still strip a super_admin.
    // Pinned here so that the UI half cannot regress silently while the
    // backend half is outstanding.
    subjectAssignments = [assignment(ROLES[0]!)]
    const w = await mountUsersTab([ROLES[1]!])
    expect(w.find('[data-testid="revoke-role-super_admin"]').exists()).toBe(false)
    expect(w.text()).toContain('Outranks you')
  })
})
