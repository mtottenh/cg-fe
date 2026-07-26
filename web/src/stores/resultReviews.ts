import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, aggregateActionStates } from '@/stores/helpers'
import {
  resultReviewStatusMap,
  getStatusColor as getMapColor,
  getStatusLabel as getMapLabel,
} from '@/utils/statusMaps'

type ResultReviewSummaryResponse = components['schemas']['ResultReviewSummaryResponse']
type ResultReviewResponse = components['schemas']['ResultReviewResponse']

/**
 * The admin queue is paginated and ordered SERVER-side — **newest first** since
 * P-55 (`portal-db/src/adapters/result_review.rs`, `find_pending_admin_reviews`).
 * Nothing here re-sorts: page 1 is the head of the queue, and the order the API
 * returned is the order the page renders.
 *
 * It used to be `created_at ASC`, and this store used to send no pagination
 * parameters at all — so it got the API default, the twenty OLDEST pending
 * reviews, with no pager. Past twenty, a newly raised review was permanently
 * unreachable in the UI (P-43).
 *
 * `perPage` is explicit here rather than inherited from the API default so that
 * changing it is a visible edit, and so `totalPages` below is computed from the
 * same number the request used.
 */
const DEFAULT_PER_PAGE = 20

export const useResultReviewsStore = defineStore('resultReviews', () => {
  // State
  const reviews = ref<ResultReviewSummaryResponse[]>([])
  const currentReview = ref<ResultReviewResponse | null>(null)
  const total = ref(0)
  const matchResultReview = ref<ResultReviewResponse | null>(null)

  /** Which page of the admin queue `reviews` currently holds. */
  const page = ref(1)
  const perPage = ref(DEFAULT_PER_PAGE)
  /**
   * Server-side sort of the queue (P-129): 'newest' (default) or 'oldest'.
   * The server sorts because the queue is paginated — a local table sort
   * would only reorder the visible page while claiming to order the queue,
   * which is why the table's own sorting stays disabled.
   */
  const sort = ref<'newest' | 'oldest'>('newest')
  /**
   * `ResultReviewListResponse` carries `total` but no `PaginationMeta`
   * (portal-api/src/dto/result_review.rs), so the page count is derived.
   */
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))

  // Per-action states
  const fetchReviewsState = createActionState()
  const fetchReviewState = createActionState()
  const approveReviewState = createActionState()
  const rejectReviewState = createActionState()
  const fetchMatchResultReviewState = createActionState()
  const acknowledgeResultReviewState = createActionState()

  const { loading, error } = aggregateActionStates([
    fetchReviewsState, fetchReviewState, approveReviewState, rejectReviewState,
    fetchMatchResultReviewState, acknowledgeResultReviewState,
  ])

  async function fetchReviews(
    params: { page?: number; per_page?: number; sort?: 'newest' | 'oldest' } = {},
  ): Promise<ResultReviewSummaryResponse[]> {
    const requestedPage = params.page ?? page.value
    const requestedPerPage = params.per_page ?? perPage.value
    const requestedSort = params.sort ?? sort.value
    return withActionState(fetchReviewsState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/result-reviews', {
        params: {
          query: { page: requestedPage, per_page: requestedPerPage, sort: requestedSort },
        },
      }))
      reviews.value = result.data.reviews
      total.value = result.data.total
      page.value = requestedPage
      perPage.value = requestedPerPage
      sort.value = requestedSort
      return reviews.value
    }, 'Failed to fetch result reviews')
  }

  async function fetchReview(reviewId: string): Promise<ResultReviewResponse> {
    return withActionState(fetchReviewState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/result-reviews/{review_id}', {
        params: { path: { review_id: reviewId } },
      }))
      currentReview.value = result.data
      return currentReview.value
    }, 'Failed to fetch result review')
  }

  async function approveReview(reviewId: string, notes?: string): Promise<ResultReviewResponse> {
    return withActionState(approveReviewState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/result-reviews/{review_id}/approve', {
        params: { path: { review_id: reviewId } },
        body: { notes: notes ?? null },
      }))
      currentReview.value = result.data
      // Remove from pending list
      reviews.value = reviews.value.filter(r => r.id !== reviewId)
      total.value = Math.max(0, total.value - 1)
      return currentReview.value
    }, 'Failed to approve result review')
  }

  async function rejectReview(reviewId: string, notes?: string): Promise<ResultReviewResponse> {
    return withActionState(rejectReviewState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/result-reviews/{review_id}/reject', {
        params: { path: { review_id: reviewId } },
        body: { notes: notes ?? null },
      }))
      currentReview.value = result.data
      // Remove from pending list
      reviews.value = reviews.value.filter(r => r.id !== reviewId)
      total.value = Math.max(0, total.value - 1)
      return currentReview.value
    }, 'Failed to reject result review')
  }

  // ==================== Player-Facing Actions ====================

  async function fetchMatchResultReview(matchId: string): Promise<ResultReviewResponse | null> {
    return withActionState(fetchMatchResultReviewState, async () => {
      const result = await unwrapApi(api.GET('/v1/matches/{match_id}/result-review', {
        params: { path: { match_id: matchId } },
      }))
      matchResultReview.value = result.data
      return matchResultReview.value
    }, 'Failed to fetch result review')
  }

  /**
   * Acknowledge a result review. Takes `registrationId` (which captain is
   * acknowledging) as a required `?registration_id=` query parameter. When
   * both captains acknowledge, the review transitions to acknowledged.
   */
  async function acknowledgeResultReview(
    matchId: string,
    registrationId: string,
  ): Promise<void> {
    return withActionState(acknowledgeResultReviewState, async () => {
      await unwrapApi(api.POST('/v1/matches/{match_id}/result-review/acknowledge', {
        params: {
          path: { match_id: matchId },
          query: { registration_id: registrationId },
        },
      }))
      // Re-fetch to get updated acknowledgment status
      await fetchMatchResultReview(matchId)
    }, 'Failed to acknowledge result review')
  }

  function clear() {
    matchResultReview.value = null
    reviews.value = []
    currentReview.value = null
    total.value = 0
    page.value = 1
    perPage.value = DEFAULT_PER_PAGE
    error.value = null
  }

  function $reset() {
    clear()
  }

  return {
    // State
    reviews,
    currentReview,
    total,
    page,
    sort,
    perPage,
    totalPages,
    loading,
    error,

    // Per-action states
    fetchReviewsState,
    fetchReviewState,
    approveReviewState,
    rejectReviewState,

    // Actions
    fetchReviews,
    fetchReview,
    approveReview,
    rejectReview,

    // Player-Facing
    matchResultReview,
    fetchMatchResultReview,
    acknowledgeResultReview,
    fetchMatchResultReviewState,
    acknowledgeResultReviewState,

    // Utility
    clear,
    $reset,
  }
})

export type { ResultReviewSummaryResponse, ResultReviewResponse }

export function getReviewStatusColor(status: string): string {
  return getMapColor(resultReviewStatusMap, status)
}

export function getReviewStatusLabel(status: string): string {
  return getMapLabel(resultReviewStatusMap, status)
}
