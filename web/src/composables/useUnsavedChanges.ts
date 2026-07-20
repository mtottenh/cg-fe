import { isRef, onBeforeUnmount, onMounted, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

const CONFIRM_MESSAGE =
  'You have unsaved changes. Leave this page and discard them?'

/**
 * Guards a page with unsaved form state against accidental navigation.
 *
 * While `dirty` evaluates to true:
 * - in-app navigation asks for confirmation via `window.confirm`
 * - closing/refreshing the tab triggers the browser's native
 *   "leave site?" prompt (`beforeunload`)
 *
 * Use on edit pages that load an original entity and let the user mutate a
 * local copy (e.g. ProfileEditPage, TeamEditPage). Derive `dirty` from a
 * comparison of the form state against the loaded original, and make sure it
 * flips back to false after a successful save so post-save navigation is
 * not blocked.
 *
 * Must be called during component `setup()` (it registers route/lifecycle
 * hooks). Handlers are removed automatically on unmount.
 *
 * @param dirty ref or getter that is true when there are unsaved changes
 */
export function useUnsavedChanges(dirty: Ref<boolean> | (() => boolean)): void {
  const isDirty = () => (isRef(dirty) ? dirty.value : dirty())

  onBeforeRouteLeave(() => {
    if (!isDirty()) return true
    return window.confirm(CONFIRM_MESSAGE)
  })

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!isDirty()) return
    e.preventDefault()
    // Required by some browsers for the native prompt to show.
    e.returnValue = ''
  }

  onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
}
