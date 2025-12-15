import { api, handleApiError } from '@/api'

export function useApi() {
  return { api, handleApiError }
}
