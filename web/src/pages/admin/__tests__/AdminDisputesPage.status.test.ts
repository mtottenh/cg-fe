import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

// Mock only the `api` client; keep ApiError & friends real so the store
// helpers (unwrapApi/withActionState) behave exactly as in production.
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      GET: vi.fn(),
      POST: vi.fn(),
      PUT: vi.fn(),
      DELETE: vi.fn(),
      PATCH: vi.fn(),
    },
  }
})

import { api } from '@/api'
import AdminDisputesPage from '@/pages/admin/AdminDisputesPage.vue'

const mockGet = api.GET as unknown as Mock

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('AdminDisputesPage status filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // onMounted → store.fetchDisputes → GET /v1/admin/disputes
    mockGet.mockResolvedValue({
      data: { data: { disputes: [], total: 0, page: 1, page_size: 20 } },
    })
  })

  async function mountPage() {
    wrapper = mount(AdminDisputesPage, {
      global: {
        plugins: [createPinia(), vuetify],
        // The detail modal pulls in the whole dispute-resolution tree; the
        // status filter under test lives on the page itself.
        stubs: { DisputeDetailModal: true },
      },
    })
    await flushPromises()
    return wrapper
  }

  it('offers exactly the backend DisputeStatus enum values: pending/under_review/resolved/cancelled', async () => {
    // The backend rejects unknown status filters with 400 (it used to silently
    // ignore them), so these options must match the DisputeStatus enum exactly.
    // This regressed once — lock it in.
    const w = await mountPage()

    const statusSelect = w
      .findAllComponents({ name: 'VSelect' })
      .find((s) => s.props('label') === 'Status')
    expect(statusSelect, 'Status v-select rendered').toBeTruthy()

    const items = statusSelect!.props('items') as Array<{ title: string; value: string }>
    expect(items.map((i) => i.value)).toEqual([
      'pending',
      'under_review',
      'resolved',
      'cancelled',
    ])
    expect(items.map((i) => i.title)).toEqual([
      'Pending',
      'Under Review',
      'Resolved',
      'Cancelled',
    ])
  })

  it('offers exactly the backend DisputePriority enum values in the priority filter', async () => {
    const w = await mountPage()

    const prioritySelect = w
      .findAllComponents({ name: 'VSelect' })
      .find((s) => s.props('label') === 'Priority')
    expect(prioritySelect, 'Priority v-select rendered').toBeTruthy()

    const items = prioritySelect!.props('items') as Array<{ title: string; value: string }>
    expect(items.map((i) => i.value)).toEqual(['low', 'normal', 'high', 'critical'])
  })
})
