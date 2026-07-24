/**
 * P-86: the generated status unions, re-exported for the e2e fixtures.
 *
 * P-31 made every status a compile-checked union in `src/`, and COVERAGE-PLAN §2
 * states the rule as "if a status literal doesn't typecheck, the literal is
 * wrong". That rule was quietly false for tests: the fixtures declared their
 * status fields and parameters as bare `string`, so a typo in a spec compiled
 * clean — even after P-81 turned the typechecker on over `e2e/`. Turning the
 * compiler on was necessary but not sufficient; this file is the other half.
 *
 * These are **type-only** re-exports of the generated client, so they are erased
 * at compile time and never reach Playwright's runtime module resolution.
 *
 * When a DTO's enum changes, `npx openapi-typescript` regenerates `types.ts` and
 * every fixture and spec that names one of these follows automatically — which
 * is the point. Do not hand-write a status union here.
 */
import type { components } from '@/api/types'

type S = components['schemas']

export type TournamentStatus = S['TournamentStatus']
export type TournamentMatchStatus = S['TournamentMatchStatus']
export type TournamentRegistrationStatus = S['TournamentRegistrationStatus']
export type TournamentInvitationStatus = S['TournamentInvitationStatus']
export type ClaimStatus = S['ClaimStatus']
export type ProposalStatus = S['ProposalStatus']
export type DisputeStatus = S['DisputeStatus']
export type DemoStatus = S['DemoStatus']
export type SeasonStatus = S['SeasonStatus']
export type BracketStatus = S['BracketStatus']
export type StageStatus = S['StageStatus']
export type LineupStatus = S['LineupStatus']
export type ResultReviewStatus = S['ResultReviewStatus']
export type RosterLockStatus = S['RosterLockStatus']
export type ParticipationStatus = S['ParticipationStatus']
export type EvidenceStatus = S['EvidenceStatus']
export type LeagueTeamStatus = S['LeagueTeamStatus']
export type LeagueTeamMemberStatus = S['LeagueTeamMemberStatus']
export type LeagueTeamSeasonStatus = S['LeagueTeamSeasonStatus']
export type LeagueTeamInvitationStatus = S['LeagueTeamInvitationStatus']
