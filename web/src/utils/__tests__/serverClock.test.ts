import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  noteServerDateHeader,
  noteServerTime,
  resetServerClock,
  serverClockOffsetMs,
  serverNow,
} from '@/utils/serverClock'

describe('serverClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-27T20:00:00Z'))
    resetServerClock()
  })

  afterEach(() => {
    resetServerClock()
    vi.useRealTimers()
  })

  it('uses the local clock until told otherwise', () => {
    expect(serverNow()).toBe(Date.now())
  })

  it('corrects for a client clock that runs fast', () => {
    // The server says 19:58:00 while this PC says 20:00:00.
    noteServerDateHeader('Fri, 27 Nov 2026 19:58:00 GMT')
    expect(serverClockOffsetMs()).toBe(-120_000 + 500)
    expect(serverNow()).toBe(Date.now() - 120_000 + 500)
  })

  it('ignores a difference smaller than the header can resolve', () => {
    noteServerDateHeader('Fri, 27 Nov 2026 20:00:01 GMT')
    expect(serverClockOffsetMs()).toBe(0)
  })

  it('drops a correction once the clocks agree again', () => {
    noteServerTime(Date.now() + 60_000)
    expect(serverClockOffsetMs()).toBe(60_000)
    noteServerTime(Date.now() + 300)
    expect(serverClockOffsetMs()).toBe(0)
  })

  it('ignores a missing or unparseable header', () => {
    noteServerTime(Date.now() + 60_000)
    noteServerDateHeader(null)
    noteServerDateHeader('not a date')
    expect(serverClockOffsetMs()).toBe(60_000)
  })
})

describe('serverClock — precise samples', () => {
  it('prefers a session server_time over the Date header', async () => {
    const mod = await import('@/utils/serverClock')
    mod.resetServerClock()
    const clientAt = 1_000_000_000_000
    // Session says the server is 10.25 s ahead.
    mod.noteServerTimestamp(new Date(clientAt + 10_250).toISOString(), clientAt)
    expect(mod.serverClockOffsetMs()).toBe(10_250)
    // A coarse header a moment later, rounded differently, is ignored.
    mod.noteServerDateHeader(new Date(clientAt + 1_000 + 9_000).toUTCString(), clientAt + 1_000)
    expect(mod.serverClockOffsetMs()).toBe(10_250)
    // A newer session sample replaces it.
    mod.noteServerTimestamp(new Date(clientAt + 2_000 + 3_000).toISOString(), clientAt + 2_000)
    expect(mod.serverClockOffsetMs()).toBe(3_000)
    mod.resetServerClock()
  })

  it('falls back to the Date header once the precise sample is old', async () => {
    const mod = await import('@/utils/serverClock')
    mod.resetServerClock()
    const clientAt = 1_000_000_000_000
    mod.noteServerTimestamp(new Date(clientAt + 10_000).toISOString(), clientAt)
    const later = clientAt + 10 * 60_000
    mod.noteServerDateHeader(new Date(later + 5_000).toUTCString(), later)
    expect(mod.serverClockOffsetMs()).toBe(5_500)
    mod.resetServerClock()
  })

  it('ignores a missing or unparsable server_time', async () => {
    const mod = await import('@/utils/serverClock')
    mod.resetServerClock()
    mod.noteServerTimestamp(undefined)
    mod.noteServerTimestamp('not a date')
    expect(mod.serverClockOffsetMs()).toBe(0)
  })
})
