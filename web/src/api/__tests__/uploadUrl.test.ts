import { describe, it, expect } from 'vitest'
import { buildUploadUrl } from '@/api/uploadUrl'

describe('buildUploadUrl', () => {
  it('returns a fully-qualified URL for a parameter-less path', () => {
    const url = buildUploadUrl('/v1/players/me/avatar')
    expect(url).toMatch(/^http:\/\/localhost:3000\/v1\/players\/me\/avatar$/)
  })

  it('interpolates path parameters', () => {
    const url = buildUploadUrl('/v1/league-teams/{team_id}/logo', {
      team_id: 'abc-123',
    })
    expect(url).toBe('http://localhost:3000/v1/league-teams/abc-123/logo')
  })

  it('URL-encodes parameter values', () => {
    const url = buildUploadUrl('/v1/league-teams/{team_id}/banner', {
      team_id: 'some id/with weird chars',
    })
    expect(url).toContain('/league-teams/some%20id%2Fwith%20weird%20chars/banner')
  })

  it('throws when a required path param is missing', () => {
    expect(() =>
      buildUploadUrl('/v1/league-teams/{team_id}/logo', {} as { team_id: string }),
    ).toThrow(/missing path param "team_id"/)
  })
})
