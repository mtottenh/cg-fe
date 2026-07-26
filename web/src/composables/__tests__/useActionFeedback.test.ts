import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createSnackbar, SnackbarKey, type SnackbarInstance } from '@/composables/useSnackbar'
import { useActionFeedback, type FeedbackOptions } from '@/composables/useActionFeedback'
import { ApiError } from '@/api'

/**
 * Runs a failing action through useActionFeedback inside a throwaway app
 * (real component instance + snackbar provider) and returns the snackbar
 * so tests can assert on the message shown.
 */
async function runFailing(
  error: unknown,
  opts: FeedbackOptions = {},
): Promise<{ snackbar: SnackbarInstance; result: unknown }> {
  let feedback!: ReturnType<typeof useActionFeedback>
  const snackbar = createSnackbar()
  const Host = defineComponent({
    setup() {
      feedback = useActionFeedback()
      return () => h('div')
    },
  })
  const app = createApp(Host)
  app.provide(SnackbarKey, snackbar)
  app.mount(document.createElement('div'))
  const result = await feedback.run(() => Promise.reject(error), opts)
  app.unmount()
  return { snackbar, result }
}

describe('useActionFeedback failure copy precedence', () => {
  it('shows explicit `failure` verbatim, overriding everything else', async () => {
    const { snackbar } = await runFailing(new ApiError(400, 'backend detail'), {
      failure: 'Exact message',
      failureFallback: 'Curated fallback',
      errorSource: { error: 'store detail' },
    })
    expect(snackbar.text).toBe('Exact message')
    expect(snackbar.color).toBe('error')
  })

  it('prefers curated failureFallback with backend detail appended', async () => {
    const { snackbar } = await runFailing(new Error('boom'), {
      failureFallback: 'Failed to register team',
      errorSource: { error: 'Registration is closed' },
    })
    expect(snackbar.text).toBe('Failed to register team: Registration is closed')
  })

  it('appends ApiError.detail when no errorSource is given', async () => {
    const { snackbar } = await runFailing(new ApiError(409, 'Already checked in'), {
      failureFallback: 'Failed to check in',
    })
    expect(snackbar.text).toBe('Failed to check in: Already checked in')
  })

  it('does not duplicate detail identical to the fallback', async () => {
    const { snackbar } = await runFailing(new Error('boom'), {
      failureFallback: 'Something broke',
      errorSource: { error: 'Something broke' },
    })
    expect(snackbar.text).toBe('Something broke')
  })

  it('shows failureFallback alone when there is no detail', async () => {
    const { snackbar } = await runFailing(new Error('boom'), {
      failureFallback: 'Failed to withdraw',
      errorSource: { error: null },
    })
    expect(snackbar.text).toBe('Failed to withdraw')
  })

  it('caps combined fallback + detail messages at 140 chars', async () => {
    const { snackbar } = await runFailing(new Error('boom'), {
      failureFallback: 'Failed to save',
      errorSource: { error: 'x'.repeat(200) },
    })
    expect(snackbar.text.length).toBe(140)
    expect(snackbar.text.startsWith('Failed to save: ')).toBe(true)
    expect(snackbar.text.endsWith('...')).toBe(true)
  })

  it('falls back to backend detail alone without a curated message', async () => {
    const { snackbar } = await runFailing(new ApiError(422, 'Name already taken'))
    expect(snackbar.text).toBe('Name already taken')
  })

  it('maps status codes to friendly copy when ApiError has no detail', async () => {
    const cases: Array<[number, string]> = [
      [401, 'You need to sign in'],
      [403, "You don't have permission to do that"],
      [404, 'Not found'],
      [500, 'Server error - try again shortly'],
      [503, 'Server error - try again shortly'],
    ]
    for (const [status, expected] of cases) {
      const { snackbar } = await runFailing(new ApiError(status, ''))
      expect(snackbar.text).toBe(expected)
    }
  })

  it('shows generic copy for non-ApiError failures without options', async () => {
    const { snackbar, result } = await runFailing(new Error('boom'))
    expect(snackbar.text).toBe('Action failed')
    expect(result).toBeNull()
  })
})
