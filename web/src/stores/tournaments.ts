import { defineStore } from 'pinia'
import type { components } from '@/api/types'
import { aggregateActionStates, type ActionState } from '@/stores/helpers'
import { tournamentStatusMap, getStatusColor as getMapColor, getStatusLabel as getMapLabel } from '@/utils/statusMaps'

import { createLifecycleSlice } from './tournament/_lifecycle'
import { createRegistrationsSlice } from './tournament/_registrations'
import { createMatchesSlice } from './tournament/_matches'
import { createSeedingSlice } from './tournament/_seeding'
import { createStagesSlice } from './tournament/_stages'

// ==================== Type re-exports ====================

type TournamentResponse = components['schemas']['TournamentResponse']
type TournamentSummaryResponse = components['schemas']['TournamentSummaryResponse']
type TournamentRegistrationResponse = components['schemas']['TournamentRegistrationResponse']
type TournamentMatchResponse = components['schemas']['TournamentMatchResponse']
type TournamentBracketResponse = components['schemas']['TournamentBracketResponse']
type TournamentStageResponse = components['schemas']['TournamentStageResponse']
type CreateTournamentRequest = components['schemas']['CreateTournamentRequest']
type UpdateTournamentRequest = components['schemas']['UpdateTournamentRequest']
type RegisterTeamRequest = components['schemas']['RegisterTeamRequest']
type RegisterPlayerRequest = components['schemas']['RegisterPlayerRequest']
type SeededParticipantResponse = components['schemas']['SeededParticipantResponse']
type CheckInStatusResponse = components['schemas']['CheckInStatusResponse']

// ==================== Enum/constant exports ====================

export const TOURNAMENT_STATUSES = [
  'draft',
  'published',
  'registration',
  'scheduled',
  'in_progress',
  'completed',
  'finalized',
  'cancelled',
] as const

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number]

export const TOURNAMENT_FORMATS = [
  { value: 'single_elimination', label: 'Single Elimination' },
  { value: 'double_elimination', label: 'Double Elimination' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'swiss', label: 'Swiss' },
  { value: 'groups_and_playoffs', label: 'Groups & Playoffs' },
] as const

export const PARTICIPANT_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'team', label: 'Team' },
  { value: 'adhoc', label: 'Ad-hoc Team' },
] as const

export const REGISTRATION_TYPES = [
  { value: 'open', label: 'Open', description: 'Anyone can register' },
  { value: 'approval', label: 'Approval Required', description: 'Registrations require admin approval' },
  { value: 'invite_only', label: 'Invite Only', description: 'Only invited participants can register' },
  { value: 'qualification', label: 'Qualification', description: 'Must meet qualification criteria' },
] as const

export const SCHEDULING_MODES = [
  { value: 'live', label: 'Live', description: 'All matches played in real-time event' },
  { value: 'self_scheduled', label: 'Self-Scheduled', description: 'Participants schedule their own matches' },
  { value: 'hybrid', label: 'Hybrid', description: 'Mix of scheduled and self-scheduled matches' },
] as const

export const MATCH_FORMATS = [
  { value: 'bo1', label: 'Best of 1' },
  { value: 'bo3', label: 'Best of 3' },
  { value: 'bo5', label: 'Best of 5' },
  { value: 'bo7', label: 'Best of 7' },
] as const

export const WITHDRAWAL_POLICIES = [
  { value: 'forfeit', label: 'Forfeit', description: 'Opponent wins by default' },
  { value: 'reseeding', label: 'Reseeding', description: 'Bracket is reseeded' },
  { value: 'waitlist_promotion', label: 'Waitlist Promotion', description: 'Next waitlisted participant joins' },
  { value: 'admin_decision', label: 'Admin Decision', description: 'Admins decide on case-by-case basis' },
] as const

/**
 * Composite tournament store.
 *
 * Internally composed from five domain slices (lifecycle, registrations, matches,
 * seeding, stages) under `stores/tournament/`. The external API is flat — consumers
 * read `store.registrations`, `store.fetchMatches(...)`, etc. unchanged.
 *
 * Why slices instead of separate Pinia stores: existing pages read many of these
 * fields together (a tournament detail page needs registrations + matches + brackets
 * + seeding). Keeping one store keeps the consumer ergonomics simple. The slice
 * files decouple the code so each concern can be reasoned about in isolation.
 */
export const useTournamentsStore = defineStore('tournaments', () => {
  // Matches + brackets need to be refreshable from the lifecycle slice's
  // `generateNextRound`. Build the matches slice first, then inject refreshers.
  const matchesSlice = createMatchesSlice()

  const lifecycle = createLifecycleSlice({
    refreshBrackets: matchesSlice.fetchBrackets,
    refreshMatches: matchesSlice.fetchMatches,
  })

  const registrationsSlice = createRegistrationsSlice()
  const seedingSlice = createSeedingSlice()
  const stagesSlice = createStagesSlice()

  // Aggregate loading/error across every per-action state in every slice.
  // Collect them dynamically from slice exports so new actions auto-participate.
  const isActionState = (v: unknown): v is ActionState =>
    !!v && typeof v === 'object' && 'loading' in v && 'error' in v

  const actionStates: ActionState[] = [
    ...Object.values(lifecycle),
    ...Object.values(registrationsSlice),
    ...Object.values(matchesSlice),
    ...Object.values(seedingSlice),
    ...Object.values(stagesSlice),
  ].filter(isActionState)

  const { loading, error } = aggregateActionStates(actionStates)

  function clearCurrent() {
    lifecycle.clearCurrent()
    registrationsSlice.clear()
    matchesSlice.clear()
    seedingSlice.clear()
    stagesSlice.clear()
  }

  function $reset() {
    lifecycle.clearTournaments()
    clearCurrent()
    error.value = null
  }

  return {
    // Lifecycle (tournaments list + current + CRUD + status transitions)
    ...lifecycle,
    // Registrations
    ...registrationsSlice,
    // Matches + brackets + admin match actions
    ...matchesSlice,
    // Seeding + map pool
    ...seedingSlice,
    // Stages
    ...stagesSlice,
    // Aggregate loading/error
    loading,
    error,
    // Cross-slice utilities
    clearCurrent,
    $reset,
  }
})

// ==================== Type re-exports for consumers ====================

export type {
  TournamentResponse,
  TournamentSummaryResponse,
  TournamentRegistrationResponse,
  TournamentMatchResponse,
  TournamentBracketResponse,
  TournamentStageResponse,
  CreateTournamentRequest,
  UpdateTournamentRequest,
  RegisterTeamRequest,
  RegisterPlayerRequest,
  SeededParticipantResponse,
  CheckInStatusResponse,
}

// ==================== Helper functions ====================

export function getStatusColor(status: string): string {
  return getMapColor(tournamentStatusMap, status)
}

export function getStatusLabel(status: string): string {
  return getMapLabel(tournamentStatusMap, status)
}

export function formatTournamentFormat(format: string): string {
  const found = TOURNAMENT_FORMATS.find((f) => f.value === format)
  return found?.label || format
}
