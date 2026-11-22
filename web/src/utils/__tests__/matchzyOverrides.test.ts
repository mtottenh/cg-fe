import { describe, expect, it } from 'vitest'
import {
  MAX_OVERRIDES,
  overrideNameError,
  overrideValueError,
  overridesToRows,
  rowsToOverrides,
  validateOverrideRows,
} from '@/utils/matchzyOverrides'

describe('overrideNameError', () => {
  it.each([
    'matchzy_kick_when_no_match_loaded',
    'matchzy_max_tech_pauses',
    'matchzy_2',
  ])('accepts %s', (name) => {
    expect(overrideNameError(name)).toBeNull()
  })

  it.each([
    ['', 'required'],
    ['matchzy_', 'must start with matchzy_'],
    ['sv_cheats', 'must start with matchzy_'],
    ['matchzy_Upper', 'must start with matchzy_'],
    ['matchzy_bad-dash', 'must start with matchzy_'],
    ['matchzy_' + 'a'.repeat(121), 'longer than 128'],
  ])('refuses %j (%s)', (name, why) => {
    expect(overrideNameError(name)).toContain(why)
  })

  it('accepts a name of exactly 128 characters', () => {
    expect(overrideNameError('matchzy_' + 'a'.repeat(120))).toBeNull()
  })

  it.each([
    'matchzy_demo_upload_url',
    'matchzy_remote_log_url',
    'matchzy_loadmatch',
    'matchzy_loadmatch_url',
    'matchzy_loadbackup_url',
  ])('refuses portal-owned %s', (name) => {
    expect(overrideNameError(name)).toBe('This setting is managed by the portal')
  })

  it('allows matchzy_loadbackup (only the _url form is portal-owned)', () => {
    expect(overrideNameError('matchzy_loadbackup')).toBeNull()
  })
})

describe('overrideValueError', () => {
  it.each(['true', '0', '', 'Welcome to [CS2] 10mans!', 'a'.repeat(256), '  padded  '])(
    'accepts %j',
    (value) => {
      expect(overrideValueError(value)).toBeNull()
    },
  )

  it('accepts numbers and booleans', () => {
    expect(overrideValueError(3)).toBeNull()
    expect(overrideValueError(false)).toBeNull()
  })

  it('measures the length after trimming spaces', () => {
    expect(overrideValueError(' ' + 'a'.repeat(256) + ' ')).toBeNull()
    expect(overrideValueError('a'.repeat(257))).toContain('longer than 256')
  })

  it.each(['say "hi"', 'a;quit', 'C:\\path', 'tab\there', 'line\nbreak', 'café'])(
    'refuses %j',
    (value) => {
      expect(overrideValueError(value)).toContain('printable ASCII')
    },
  )
})

describe('validateOverrideRows', () => {
  it('flags duplicates against the first occurrence', () => {
    const v = validateOverrideRows([
      { name: 'matchzy_a', value: '1' },
      { name: 'matchzy_a', value: '2' },
    ])
    expect(v.valid).toBe(false)
    expect(v.rows[0]).toEqual({ name: null, value: null })
    expect(v.rows[1]?.name).toBe('Duplicate of row 1')
  })

  it('refuses more than 64 entries as a whole-set error', () => {
    const rows = Array.from({ length: MAX_OVERRIDES + 1 }, (_, i) => ({
      name: `matchzy_x${i}`,
      value: '1',
    }))
    const v = validateOverrideRows(rows)
    expect(v.valid).toBe(false)
    expect(v.set).toContain('At most 64')
    expect(v.rows.every((r) => r.name === null && r.value === null)).toBe(true)
  })

  it('is valid for an empty set (clears the overrides)', () => {
    expect(validateOverrideRows([]).valid).toBe(true)
  })
})

describe('row conversion', () => {
  it('renders stored values as text, sorted by name', () => {
    expect(
      overridesToRows({ matchzy_b: true, matchzy_a: 3, matchzy_c: ' x ' }),
    ).toEqual([
      { name: 'matchzy_a', value: '3' },
      { name: 'matchzy_b', value: 'true' },
      { name: 'matchzy_c', value: 'x' },
    ])
  })

  it('sends trimmed names and values as strings', () => {
    expect(rowsToOverrides([{ name: ' matchzy_a ', value: ' 0.50 ' }])).toEqual({
      matchzy_a: '0.50',
    })
  })
})
