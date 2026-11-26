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
