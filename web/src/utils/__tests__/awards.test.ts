import { describe, it, expect } from 'vitest'
import {
  weaponStatKey,
  buildCustomAwardPayload,
  buildTemplateAwardPayload,
  groupCatalogByCategory,
  sharedRanks,
  formatAwardValue,
  medalColor,
} from '@/utils/awards'

describe('weaponStatKey', () => {
  it('lowercases and strips spaces/hyphens', () => {
    expect(weaponStatKey('MAG 7')).toBe('kills.weapon.mag7')
    expect(weaponStatKey('ak-47')).toBe('kills.weapon.ak47')
    expect(weaponStatKey('  awp  ')).toBe('kills.weapon.awp')
  })

  it('drops characters outside [a-z0-9_]', () => {
    expect(weaponStatKey('USP-S!')).toBe('kills.weapon.usps')
  })
})

describe('buildCustomAwardPayload', () => {
  it('builds a payload from a catalog stat selection', () => {
    const payload = buildCustomAwardPayload({
      name: '  Headshot Hero  ',
      description: 'Most headshots',
      icon: 'mdi-head-flash',
      color: '#E53935',
      statKey: 'headshot_kills',
      weaponName: '',
      aggregation: 'sum',
      direction: 'desc',
      minMatches: null,
    })
    expect(payload).toEqual({
      name: 'Headshot Hero',
      description: 'Most headshots',
      icon: 'mdi-head-flash',
      color: '#E53935',
      stat_key: 'headshot_kills',
      aggregation: 'sum',
      direction: 'desc',
      min_qualifier_type: null,
      min_qualifier_value: null,
    })
  })

  it('free-text weapon entry wins over the catalog stat and produces kills.weapon.{name}', () => {
    const payload = buildCustomAwardPayload({
      name: 'Swaggy',
      statKey: 'headshot_kills',
      weaponName: 'MAG 7',
    })
    expect(payload.stat_key).toBe('kills.weapon.mag7')
  })

  it('maps minMatches to the matches qualifier tuple', () => {
    const payload = buildCustomAwardPayload({
      name: 'Consistent',
      statKey: 'kills',
      minMatches: 3,
    })
    expect(payload.min_qualifier_type).toBe('matches')
    expect(payload.min_qualifier_value).toBe(3)
  })

  it('omits the qualifier when minMatches is 0 or null', () => {
    const payload = buildCustomAwardPayload({
      name: 'Anyone',
      statKey: 'kills',
      minMatches: 0,
    })
    expect(payload.min_qualifier_type).toBeNull()
    expect(payload.min_qualifier_value).toBeNull()
  })

  it('normalizes empty optional fields to null', () => {
    const payload = buildCustomAwardPayload({ name: 'Bare', statKey: 'kills' })
    expect(payload.description).toBeNull()
    expect(payload.icon).toBeNull()
    expect(payload.color).toBeNull()
    expect(payload.aggregation).toBeNull()
    expect(payload.direction).toBeNull()
  })
})

describe('buildTemplateAwardPayload', () => {
  it('sends only the template key', () => {
    expect(buildTemplateAwardPayload('swag7')).toEqual({ template_key: 'swag7' })
  })
})

describe('groupCatalogByCategory', () => {
  it('groups and sorts entries by category then label', () => {
    const grouped = groupCatalogByCategory([
      { key: 'utility_damage', label: 'Utility Damage', category: 'Utility', value_type: 'count', description: '' },
      { key: 'kills', label: 'Kills', category: 'Combat', value_type: 'count', description: '' },
      { key: 'adr', label: 'ADR', category: 'Combat', value_type: 'ratio', description: '' },
    ])
    expect(grouped.map((g) => g.category)).toEqual(['Combat', 'Utility'])
    expect(grouped[0]!.entries.map((e) => e.key)).toEqual(['adr', 'kills'])
  })
})

describe('sharedRanks', () => {
  it('flags only ranks appearing more than once', () => {
    const set = sharedRanks([{ rank: 1 }, { rank: 1 }, { rank: 3 }])
    expect(set.has(1)).toBe(true)
    expect(set.has(3)).toBe(false)
  })

  it('is empty for an empty field', () => {
    expect(sharedRanks([]).size).toBe(0)
  })
})

describe('formatAwardValue', () => {
  it('renders integers plainly and ratios to 2 decimals', () => {
    expect(formatAwardValue(12)).toBe('12')
    expect(formatAwardValue(1.5)).toBe('1.50')
  })
})

describe('medalColor', () => {
  it('colors the podium and nothing else', () => {
    expect(medalColor(1)).toBe('#FFC107')
    expect(medalColor(2)).toBe('#9E9E9E')
    expect(medalColor(3)).toBe('#CD7F32')
    expect(medalColor(4)).toBeNull()
  })
})
