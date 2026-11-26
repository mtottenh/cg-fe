import { describe, it, expect } from 'vitest'
import { describeServerQueue } from '@/utils/serverQueue'

describe('describeServerQueue', () => {
  it('says the team is next at the head of the queue', () => {
    expect(describeServerQueue(1)).toBe('Waiting for the game server — you are next.')
  })

  it('counts the matches ahead, not the position', () => {
    expect(describeServerQueue(2)).toContain('1 match ahead of you')
    expect(describeServerQueue(3)).toContain('2 matches ahead of you')
  })

  it('falls back to a plain wait when the position is unknown', () => {
    expect(describeServerQueue(null)).toBe('Waiting for a free game server…')
    expect(describeServerQueue(undefined)).toBe('Waiting for a free game server…')
    expect(describeServerQueue(0)).toBe('Waiting for a free game server…')
  })
})
