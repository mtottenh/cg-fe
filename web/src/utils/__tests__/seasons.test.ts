import { describe, it, expect } from 'vitest'
import { pickCurrentSeason, isSeasonTakingTeams } from '@/utils/seasons'

const s = (id: string, status: string, created_at: string) => ({ id, status, created_at })

describe('pickCurrentSeason', () => {
  it('prefers the season being played over one taking sign-ups', () => {
    const seasons = [s('s1', 'active', '2026-01-01'), s('s2', 'registration', '2026-06-01')]
    expect(pickCurrentSeason(seasons, 's1')?.id).toBe('s1')
    expect(pickCurrentSeason(seasons, 's2')?.id).toBe('s1')
  })

  it('takes the newest of two seasons taking sign-ups, whatever the stale pointer says', () => {
    const seasons = [s('s1', 'registration', '2026-01-01'), s('e2e', 'registration', '2026-06-01')]
    expect(pickCurrentSeason(seasons, 's1')?.id).toBe('e2e')
  })

  it('never opens on a draft while a real season exists', () => {
    const seasons = [s('done', 'completed', '2026-01-01'), s('next', 'draft', '2026-09-01')]
    expect(pickCurrentSeason(seasons, null)?.id).toBe('done')
  })

  it('honours the pointer only when nothing is live', () => {
    const seasons = [s('a', 'completed', '2026-01-01'), s('b', 'completed', '2026-03-01')]
    expect(pickCurrentSeason(seasons, 'a')?.id).toBe('a')
    expect(pickCurrentSeason(seasons, null)?.id).toBe('b')
  })

  it('falls back to a lone draft', () => {
    expect(pickCurrentSeason([s('d', 'draft', '2026-01-01')], null)?.id).toBe('d')
    expect(pickCurrentSeason([], null)).toBeNull()
  })
})

describe('isSeasonTakingTeams', () => {
  const now = new Date('2026-06-15T12:00:00Z')
  it('needs registration status', () => {
    expect(isSeasonTakingTeams({ status: 'registration' }, now)).toBe(true)
    expect(isSeasonTakingTeams({ status: 'active' }, now)).toBe(false)
  })
  it('honours the registration window when set', () => {
    expect(isSeasonTakingTeams({ status: 'registration', registration_start: '2026-07-01T00:00:00Z' }, now)).toBe(false)
    expect(isSeasonTakingTeams({ status: 'registration', registration_end: '2026-06-01T00:00:00Z' }, now)).toBe(false)
    expect(isSeasonTakingTeams({
      status: 'registration', registration_start: '2026-06-01T00:00:00Z', registration_end: '2026-07-01T00:00:00Z',
    }, now)).toBe(true)
  })
})
