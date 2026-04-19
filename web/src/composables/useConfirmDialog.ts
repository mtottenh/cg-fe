import { reactive } from 'vue'

export interface ConfirmDialogOptions {
  title: string
  message: string
  action?: string
  color?: string
  handler: () => Promise<void>
}

export interface ConfirmDialogState {
  open: boolean
  title: string
  message: string
  actionLabel: string
  color: string
  loading: boolean
  dialogError: string | null
}

/**
 * Imperative confirm-dialog composable.
 *
 * Usage:
 *
 *   const confirmDialog = useConfirmDialog()
 *   confirmDialog.confirm({
 *     title: 'Delete team',
 *     message: 'Are you sure?',
 *     color: 'error',
 *     handler: async () => { await store.deleteTeam(id) },
 *   })
 *
 * Render with:
 *
 *   <ConfirmDialog
 *     :open="confirmDialog.state.open"
 *     :title="confirmDialog.state.title"
 *     ...
 *     @confirm="confirmDialog.execute"
 *     @cancel="confirmDialog.cancel"
 *   />
 *
 * The returned `state` is a reactive object, so templates access fields
 * without `.value`. Handlers that throw will keep the dialog open and
 * surface the error through `state.dialogError`.
 */
export function useConfirmDialog() {
  const state = reactive<ConfirmDialogState>({
    open: false,
    title: '',
    message: '',
    actionLabel: 'Confirm',
    color: 'primary',
    loading: false,
    dialogError: null,
  })

  let onConfirm: (() => Promise<void>) | null = null

  function confirm(opts: ConfirmDialogOptions) {
    state.title = opts.title
    state.message = opts.message
    state.actionLabel = opts.action ?? 'Confirm'
    state.color = opts.color ?? 'primary'
    state.dialogError = null
    onConfirm = opts.handler
    state.open = true
  }

  async function execute() {
    if (!onConfirm) return
    state.loading = true
    state.dialogError = null
    try {
      await onConfirm()
      // Only close on success
      state.open = false
      onConfirm = null
    } catch (e: unknown) {
      state.dialogError = e instanceof Error ? e.message : 'Operation failed'
    } finally {
      state.loading = false
    }
  }

  function cancel() {
    state.open = false
    onConfirm = null
    state.dialogError = null
  }

  function clearError() {
    state.dialogError = null
  }

  return { state, confirm, execute, cancel, clearError }
}
