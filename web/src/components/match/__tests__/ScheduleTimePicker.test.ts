import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import ScheduleTimePicker from '@/components/match/ScheduleTimePicker.vue'
import { MIN_PROPOSAL_LEAD_MINUTES } from '@/utils/schedulingLead'

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

function mountPicker() {
  wrapper = mount(ScheduleTimePicker, {
    props: { modelValue: [''] },
    global: { plugins: [vuetify] },
  })
  return wrapper
}

const chipLabels = (w: VueWrapper) => w.findAll('.v-chip').map((c) => c.text())

describe('ScheduleTimePicker — minimum notice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  it('offers Today 8PM while it still gives enough notice', () => {
    vi.setSystemTime(new Date(2026, 10, 27, 19, 0, 0)) // 19:00 local
    expect(chipLabels(mountPicker())).toContain('Today 8PM')
  })

  it('drops Today 8PM once it is inside the minimum notice', () => {
    vi.setSystemTime(new Date(2026, 10, 27, 19, 45, 0)) // 15 minutes before
    expect(chipLabels(mountPicker())).not.toContain('Today 8PM')
  })

  it('drops Today 8PM once it has passed', () => {
    vi.setSystemTime(new Date(2026, 10, 27, 21, 0, 0))
    const labels = chipLabels(mountPicker())
    expect(labels).not.toContain('Today 8PM')
    expect(labels).toContain('Tomorrow 8PM')
  })

  it('hints the date widget at the earliest proposable time', () => {
    const now = new Date(2026, 10, 27, 12, 0, 0)
    vi.setSystemTime(now)
    const min = mountPicker().find('input[type="datetime-local"]').attributes('min')
    const earliest = new Date(now.getTime() + MIN_PROPOSAL_LEAD_MINUTES * 60_000)
    expect(new Date(min!).getTime()).toBe(earliest.getTime())
  })
})
