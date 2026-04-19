import { ApiError } from '@/api'
import { useSnackbar } from '@/composables/useSnackbar'

export interface FeedbackOptions {
  /** Shown on successful completion. Supports a template function of the result. */
  success?: string | (() => string)
  /** Shown on failure. Defaults to the store's ApiError detail or `failureFallback`. */
  failure?: string
  /** Final fallback if neither `failure` nor an ApiError message is available. */
  failureFallback?: string
  /** Optional side-effect to run after success (e.g. `fetchData`). */
  after?: () => void | Promise<void>
  /** Optional store with an `error` field to read a detail message from on failure. */
  errorSource?: { error: string | null }
  /** Whether to rethrow the error after reporting. Default false. */
  rethrow?: boolean
}

/**
 * Wraps a store action with snackbar feedback + optional refetch.
 *
 * Replaces the repeated pattern across admin pages:
 *
 *   try {
 *     await store.doThing(id)
 *     snackbar.show('Thing done', 'success')
 *     await fetchData()
 *   } catch {
 *     snackbar.show(store.error || 'Failed', 'error')
 *   }
 *
 * Usage:
 *
 *   const feedback = useActionFeedback()
 *   await feedback.run(
 *     () => store.publishTournament(id),
 *     { success: 'Tournament published', after: fetchData, errorSource: store }
 *   )
 *
 * Returns the action's result on success, or `null` on failure (unless `rethrow: true`).
 */
export function useActionFeedback() {
  const snackbar = useSnackbar()

  async function run<R>(
    action: () => Promise<R>,
    opts: FeedbackOptions = {},
  ): Promise<R | null> {
    try {
      const result = await action()
      if (opts.success) {
        const msg = typeof opts.success === 'function' ? opts.success() : opts.success
        snackbar.show(msg, 'success')
      }
      if (opts.after) await opts.after()
      return result
    } catch (e: unknown) {
      const msg =
        opts.failure
        ?? opts.errorSource?.error
        ?? (e instanceof ApiError ? e.detail : null)
        ?? opts.failureFallback
        ?? 'Action failed'
      snackbar.show(msg, 'error')
      if (opts.rethrow) throw e
      return null
    }
  }

  return { run }
}
