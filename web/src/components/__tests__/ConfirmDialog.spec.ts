import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null

function mountDialog(props: Record<string, unknown> = {}) {
  wrapper = mount(ConfirmDialog, {
    props: {
      open: true,
      title: 'Confirm it',
      message: 'Are you sure?',
      ...props,
    },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
  return wrapper
}

afterEach(() => {
  // v-dialog teleports content outside the wrapper's subtree; unmounting
  // alone doesn't always clean those nodes up. Reset body to avoid
  // cross-test contamination (one test's dialog leaking into another's DOM).
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

/** Find a button in document.body whose trimmed text matches `label`. */
function findButton(label: string): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('.v-btn'))
  return buttons.find((b) => b.textContent?.trim() === label) ?? null
}

describe('ConfirmDialog', () => {
  it('emits confirm when the confirm button is clicked', async () => {
    const w = mountDialog({ actionLabel: 'Yes' })
    await flushPromises()

    const btn = findButton('Yes')
    expect(btn, 'confirm button rendered').toBeTruthy()
    btn!.click()
    await flushPromises()

    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('emits cancel when cancel is clicked', async () => {
    const w = mountDialog({ cancelLabel: 'No thanks' })
    await flushPromises()

    const btn = findButton('No thanks')
    expect(btn).toBeTruthy()
    btn!.click()
    await flushPromises()

    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('supports actionLabel + color', async () => {
    mountDialog({ actionLabel: 'Delete', color: 'error' })
    await flushPromises()

    expect(findButton('Delete')).toBeTruthy()
  })

  it('renders inline error and emits clear-error when dismissed', async () => {
    const w = mountDialog({ error: 'Something went wrong' })
    await flushPromises()

    const alert = document.querySelector('.v-alert')
    expect(alert).toBeTruthy()
    expect(alert!.textContent).toContain('Something went wrong')

    const closeBtn = document.querySelector<HTMLElement>('.v-alert__close button')
      ?? document.querySelector<HTMLElement>('.v-alert__close .v-btn')
    expect(closeBtn, 'alert close button rendered').toBeTruthy()
    closeBtn!.click()
    await flushPromises()

    expect(w.emitted('clear-error')).toHaveLength(1)
  })

  it('does not render the dialog when open is false', async () => {
    mountDialog({ open: false })
    await flushPromises()
    // v-dialog only creates its content when the model is true.
    expect(document.querySelector('.v-card')).toBeNull()
  })

  it('onDialogUpdate(false) triggers cancel (outside click / esc)', async () => {
    const w = mountDialog()
    await flushPromises()

    const dialog = w.findComponent({ name: 'VDialog' })
    expect(dialog.exists()).toBe(true)
    dialog.vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(w.emitted('cancel')).toHaveLength(1)
  })
})
