import { describe, it, expect } from 'vitest'
import { parseSteamCallbackFragment, steamLoginUrl } from '../steamAuth'

describe('parseSteamCallbackFragment', () => {
  it('parses access and refresh tokens from a hash with leading #', () => {
    const result = parseSteamCallbackFragment('#access_token=abc.def.ghi&refresh_token=0123abcd')
    expect(result).toEqual({ accessToken: 'abc.def.ghi', refreshToken: '0123abcd' })
  })

  it('parses a fragment without the leading #', () => {
    const result = parseSteamCallbackFragment('access_token=tok&refresh_token=ref')
    expect(result).toEqual({ accessToken: 'tok', refreshToken: 'ref' })
  })

  it('returns null refresh token when only an access token is present', () => {
    const result = parseSteamCallbackFragment('#access_token=tok')
    expect(result).toEqual({ accessToken: 'tok', refreshToken: null })
  })

  it('treats an empty refresh token as null', () => {
    const result = parseSteamCallbackFragment('#access_token=tok&refresh_token=')
    expect(result).toEqual({ accessToken: 'tok', refreshToken: null })
  })

  it('returns null for an empty hash', () => {
    expect(parseSteamCallbackFragment('')).toBeNull()
    expect(parseSteamCallbackFragment('#')).toBeNull()
  })

  it('returns null when no access token is present', () => {
    expect(parseSteamCallbackFragment('#refresh_token=ref')).toBeNull()
    expect(parseSteamCallbackFragment('#foo=bar')).toBeNull()
  })

  it('ignores unrelated fragment parameters', () => {
    const result = parseSteamCallbackFragment('#foo=bar&access_token=tok&refresh_token=ref&baz=1')
    expect(result).toEqual({ accessToken: 'tok', refreshToken: 'ref' })
  })
})

describe('steamLoginUrl', () => {
  it('points at the backend steam login endpoint', () => {
    expect(steamLoginUrl()).toMatch(/\/v1\/auth\/steam\/login$/)
  })
})

describe('post-login redirect stash', () => {
  it('round-trips a same-origin path', async () => {
    const { stashPostLoginRedirect, consumePostLoginRedirect } = await import('../steamAuth')
    stashPostLoginRedirect('/pugs/join/ABC123XYZ0')
    expect(consumePostLoginRedirect()).toBe('/pugs/join/ABC123XYZ0')
    // consumed exactly once
    expect(consumePostLoginRedirect()).toBeNull()
  })

  it('refuses absolute and protocol-relative URLs (open-redirect guard)', async () => {
    const { stashPostLoginRedirect, consumePostLoginRedirect } = await import('../steamAuth')
    stashPostLoginRedirect('https://evil.example/phish')
    expect(consumePostLoginRedirect()).toBeNull()
    stashPostLoginRedirect('//evil.example/phish')
    expect(consumePostLoginRedirect()).toBeNull()
    stashPostLoginRedirect(null)
    expect(consumePostLoginRedirect()).toBeNull()
  })
})
