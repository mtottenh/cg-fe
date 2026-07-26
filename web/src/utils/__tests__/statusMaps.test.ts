import { describe, it, expect } from 'vitest'
import * as statusMaps from '@/utils/statusMaps'
import {
  disputeReasonMap,
  leagueRoleMap,
  teamRoleMap,
  teamStatusMap,
  getStatusLabel,
  type StatusMap,
} from '@/utils/statusMaps'
import type { components } from '@/api/types'

type S = components['schemas']

/**
 * The compile lock (`StatusMap<Union>`) proves a map's KEYS match its enum. It
 * cannot prove the map is pointed at the right enum, and it cannot prove the
 * LABELS were ever written — `{ pending: { label: 'pending' } }` compiles. These
 * are the two failures that survived every previous sweep of this defect class,
 * so they get runtime gates.
 */

/** Every exported `*Map`, discovered rather than listed — a new map is covered
 * the moment it is added, which is the property that stopped the raw-render
 * ratchet going stale. */
const allMaps = Object.entries(statusMaps).filter(
  (entry): entry is [string, StatusMap] =>
    entry[0].endsWith('Map') && typeof entry[1] === 'object' && entry[1] !== null,
)

describe('statusMaps labels are written for humans, never the wire value', () => {
  it('discovers every exported map', () => {
    // A guard over an empty set passes vacuously. If the export naming changes,
    // this fails rather than silently checking nothing.
    expect(allMaps.length).toBeGreaterThanOrEqual(26)
  })

  for (const [name, map] of allMaps) {
    it(`${name} humanises every key it defines`, () => {
      const keys = Object.keys(map)
      expect(keys.length, `${name} is empty`).toBeGreaterThan(0)
      for (const key of keys) {
        const { label } = map[key]!
        // Echoing the key back is the exact defect: `getStatusLabel` already
        // falls back to the raw value, so a map entry that repeats it is
        // indistinguishable from having no entry at all.
        expect(label, `${name}.${key} echoes the wire value`).not.toBe(key)
        expect(label, `${name}.${key} leaks snake_case`).not.toMatch(/_/)
        expect(label.length, `${name}.${key} has no label`).toBeGreaterThan(0)
      }
    })
  }
})

describe('P-131 — every DisputeReason resolves to a label', () => {
  // Listed rather than derived from the map, so the map cannot satisfy the test
  // by simply not having the value. `satisfies` makes this list itself
  // exhaustive against the generated union at compile time.
  const ALL: S['DisputeReason'][] = [
    'wrong_score',
    'wrong_winner',
    'cheating',
    'rule_violation',
    'technical_issue',
    'player_misconduct',
    'other',
  ]

  it('resolves all seven, none of them to the wire value', () => {
    for (const reason of ALL) {
      expect(getStatusLabel(disputeReasonMap, reason), reason).not.toBe(reason)
    }
    expect(getStatusLabel(disputeReasonMap, 'player_misconduct')).toBe('Player Misconduct')
    // The value the claim-dispute path always writes — the one the admin queue
    // shows most often, and the one it used to print raw.
    expect(getStatusLabel(disputeReasonMap, 'other')).toBe('Other')
  })
})

describe('P-133 — league membership and team roles are disjoint enums', () => {
  const MEMBERSHIP_TYPES = ['admin', 'moderator', 'member']
  const TEAM_ROLES: S['LeagueTeamRole'][] = ['captain', 'player', 'substitute']

  it('teamRoleMap answers for no membership_type, leagueRoleMap answers for all', () => {
    // This is the shape of the bug: `MyLeagueTeamsPage` fed `membership_type`
    // to `teamRoleMap`, every lookup missed, and the call site looked correct.
    // Adding these keys to `teamRoleMap` would "fix" the page and be wrong, so
    // the disjointness is asserted rather than assumed.
    for (const type of MEMBERSHIP_TYPES) {
      expect(teamRoleMap[type as S['LeagueTeamRole']], type).toBeUndefined()
      expect(leagueRoleMap[type], type).toBeDefined()
      expect(getStatusLabel(leagueRoleMap, type), type).not.toBe(type)
    }
    for (const role of TEAM_ROLES) {
      expect(leagueRoleMap[role], role).toBeUndefined()
      expect(getStatusLabel(teamRoleMap, role), role).not.toBe(role)
    }
  })
})

describe('teamStatusMap serves all three status enums pointed at it', () => {
  // `MyLeagueTeamsPage` renders a MEMBER status through this map. `left` and
  // `removed` had been deleted from it as "belonging to neither enum" — they
  // belong to this one, and the view behind /my-teams filters on none of them,
  // so both were reachable and both rendered raw.
  const MEMBER: S['LeagueTeamMemberStatus'][] = ['active', 'inactive', 'left', 'removed']
  const TEAM: S['LeagueTeamStatus'][] = ['active', 'inactive', 'disbanded']
  const SEASON: S['LeagueTeamSeasonStatus'][] = [
    'forming',
    'pending',
    'registered',
    'active',
    'eliminated',
    'disqualified',
    'withdrawn',
  ]

  it.each([
    ['LeagueTeamMemberStatus', MEMBER],
    ['LeagueTeamStatus', TEAM],
    ['LeagueTeamSeasonStatus', SEASON],
  ] as const)('%s resolves entirely', (_enumName, values) => {
    for (const value of values) {
      expect(getStatusLabel(teamStatusMap, value), value).not.toBe(value)
    }
  })
})
