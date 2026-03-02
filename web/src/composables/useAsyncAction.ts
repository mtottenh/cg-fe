import { ref, type Ref } from 'vue'
import { ApiError } from '@/api'

interface AsyncActionOptions {
  fallbackMessage?: string
}

export function useAsyncAction(options: AsyncActionOptions = {}) {
  const loading = ref(false)
  const error: Ref<string | null> = ref(null)

  async function execute<R>(action: () => Promise<R>): Promise<R | null> {
    loading.value = true
    error.value = null
    try {
      return await action()
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = e instanceof Error
          ? e.message
          : (options.fallbackMessage ?? 'An unexpected error occurred')
      }
      return null
    } finally {
      loading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  return { loading, error, execute, clearError }
}
