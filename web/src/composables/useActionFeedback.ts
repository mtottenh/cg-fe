import { ApiError, friendlyErrorMessage } from '@/api'
import { useSnackbar } from '@/composables/useSnackbar'

export interface FeedbackOptions {
  /** Shown on successful completion. Supports a template function of the result. */
  success?: string | (() => string)
  /** Shown verbatim on failure, overriding everything else. */
  failure?: string
  /**
   * Curated failure message shown first; any backend detail is appended as a
   * secondary clause ("<fallback>: <detail>", capped at ~140 chars).
   */
  failureFallback?: string
  /** Optional side-effect to run after success (e.g. `fetchData`). */
  after?: () => void | Promise<void>
  /** Optional store with an `error` field to read a detail message from on failure. */
  errorSource?: { error: string | null }
  /** Whether to rethrow the error after reporting. Default false. */
  rethrow?: boolean
}

/** Max snackbar message length when combining fallback + backend detail. */
const MAX_FAILURE_LENGTH = 140

/**
 * Failure copy precedence:
 * 1. `failure` - explicit override, shown verbatim
 * 2. `failureFallback` - curated message first, backend detail (from
 *    `errorSource.error` or `ApiError.detail`) appended when present and
 *    different, capped at {@link MAX_FAILURE_LENGTH} chars
 * 3. backend detail alone (`errorSource.error`, then `ApiError.detail`)
 * 4. status-based friendly message for ApiErrors without detail
 * 5. generic "Action failed"
 */
function buildFailureMessage(e: unknown, opts: FeedbackOptions): string {
  if (opts.failure) return opts.failure

  const detail =
    opts.errorSource?.error
    ?? (e instanceof ApiError && e.detail ? e.detail : null)

  if (opts.failureFallback) {
    if (detail && detail !== opts.failureFallback) {
      const combined = `${opts.failureFallback}: ${detail}`
      return combined.length > MAX_FAILURE_LENGTH
        ? `${combined.slice(0, MAX_FAILURE_LENGTH - 3)}...`
        : combined
    }
    return opts.failureFallback
  }

  if (detail) return detail
  if (e instanceof ApiError) return friendlyErrorMessage(e)
  return 'Action failed'
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
      snackbar.show(buildFailureMessage(e, opts), 'error')
      if (opts.rethrow) throw e
      return null
    }
  }

  return { run }
}
