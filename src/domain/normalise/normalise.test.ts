import { describe, expect, it } from 'vitest'
import { countryByCode, normaliseCountry } from './country.js'
import { daysSince, isPlausibleRoastDate, parseRoastDate } from './date.js'
import { normaliseProcess, normaliseRoast } from './enums.js'
import { parseAltitude, splitNotes, splitVarieties } from './text.js'

const today = new Date('2026-10-27T08:00:00+08:00')

describe('normaliseCountry', () => {
  it.each([
    ['Ethiopia', 'ET'],
    ['Ethiopia Yirgacheffe', 'ET'],
    ['ethiopian', 'ET'],
    ['Kenya AA', 'KE'],
    ['Sumatra', 'ID'],
    ['Democratic Republic of the Congo', 'CD'],
    ['Côte d’Ivoire', 'CI'],
    ['Costa Rica, Tarrazú', 'CR'],
    ['co', 'CO'],
    ['Hawaii Kona', 'US'],
  ])('%s → %s', (raw, code) => {
    expect(normaliseCountry(raw)?.code).toBe(code)
  })

  it('returns null for unknown or empty text', () => {
    expect(normaliseCountry('Atlantis')).toBeNull()
    expect(normaliseCountry('')).toBeNull()
    expect(normaliseCountry('   ')).toBeNull()
    expect(normaliseCountry(null)).toBeNull()
    expect(normaliseCountry('ZZ')).toBeNull()
  })

  it('looks countries up by code', () => {
    expect(countryByCode('et')?.name).toBe('Ethiopia')
    expect(countryByCode(undefined)).toBeNull()
  })
})

describe('normaliseProcess and normaliseRoast', () => {
  it.each([
    ['Washed', 'washed'],
    ['Fully washed', 'washed'],
    ['W', 'washed'],
    ['Natural', 'natural'],
    ['Unwashed', 'natural'],
    ['Sun-dried', 'natural'],
    ['Anaerobic natural', 'anaerobic'],
    ['Carbonic maceration', 'anaerobic'],
    ['Pulped natural', 'honey'],
    ['Red honey', 'honey'],
    ['Wet-hulled (Giling Basah)', 'wet-hulled'],
  ])('process %s → %s', (raw, value) => expect(normaliseProcess(raw)).toBe(value))

  it.each([
    ['Light roast', 'light'],
    ['Nordic', 'light'],
    ['Medium-Light', 'medium-light'],
    ['Light medium', 'medium-light'],
    ['Medium', 'medium'],
    ['City+', 'medium'],
    ['Full City', 'medium-dark'],
    ['Medium Dark', 'medium-dark'],
    ['French roast', 'dark'],
    ['Espresso roast', 'dark'],
  ])('roast %s → %s', (raw, value) => expect(normaliseRoast(raw)).toBe(value))

  it('returns null when nothing matches', () => {
    expect(normaliseProcess('mystery')).toBeNull()
    expect(normaliseProcess(null)).toBeNull()
    expect(normaliseRoast('unknown')).toBeNull()
    expect(normaliseRoast(undefined)).toBeNull()
  })
})

describe('parseRoastDate', () => {
  it('reads ambiguous numeric dates day-first, as in Hong Kong', () => {
    expect(parseRoastDate('Roasted 14.10.26', today)).toEqual({ iso: '2026-10-14', reading: 'day-first', ambiguous: false })
    expect(parseRoastDate('03/10/2026', today)).toEqual({ iso: '2026-10-03', reading: 'day-first', ambiguous: true })
  })

  it('falls back to month-first only when day-first is impossible or implausible', () => {
    expect(parseRoastDate('10/14/26', today)).toEqual({ iso: '2026-10-14', reading: 'month-first', ambiguous: false })
    // 10 December 2026 would be in the future; 12 October is plausible
    expect(parseRoastDate('12/10/26', new Date('2026-10-20T00:00:00Z'))?.iso).toBe('2026-10-12')
    expect(parseRoastDate('10/12/26', new Date('2026-10-20T00:00:00Z'))).toEqual({ iso: '2026-10-12', reading: 'month-first', ambiguous: false })
  })

  it('reads ISO dates and dates in words', () => {
    expect(parseRoastDate('2026-10-14', today)?.reading).toBe('iso')
    expect(parseRoastDate('14 October 2026', today)?.iso).toBe('2026-10-14')
    expect(parseRoastDate('Oct 14, 2026', today)?.iso).toBe('2026-10-14')
    expect(parseRoastDate('roasted on 1st Sept 2026', today)?.iso).toBe('2026-09-01')
  })

  it('rejects impossible, future and very old dates', () => {
    expect(parseRoastDate('31/02/2026', today)).toBeNull()
    expect(parseRoastDate('2027-01-01', today)).toBeNull()
    expect(parseRoastDate('2024-01-01', today)).toBeNull()
    expect(parseRoastDate('no date here', today)).toBeNull()
    expect(parseRoastDate(null, today)).toBeNull()
  })

  it('counts days since roast', () => {
    expect(daysSince('2026-10-14', today)).toBe(13)
    expect(daysSince(null, today)).toBeNull()
    expect(isPlausibleRoastDate('2026-10-28', today)).toBe(true) // one day of clock tolerance
  })
})

describe('text helpers', () => {
  it('parses altitudes in metres and feet', () => {
    expect(parseAltitude('1,950–2,200 m')).toEqual({ minM: 1950, maxM: 2200 })
    expect(parseAltitude('1800 masl')).toEqual({ minM: 1800, maxM: 1800 })
    expect(parseAltitude('5,000 ft')).toEqual({ minM: 1524, maxM: 1524 })
    expect(parseAltitude(2100)).toEqual({ minM: 2100, maxM: 2100 })
    expect(parseAltitude('99999 m')).toBeNull()
    expect(parseAltitude('high')).toBeNull()
    expect(parseAltitude('')).toBeNull()
  })

  it('splits tasting notes and varieties', () => {
    expect(splitNotes('Jasmine / Bergamot, white peach and honey')).toEqual(['jasmine', 'bergamot', 'white peach', 'honey'])
    expect(splitNotes(['Lemon', 'lemon', ' Tea. '])).toEqual(['lemon', 'tea'])
    expect(splitNotes(null)).toEqual([])
    expect(splitVarieties('74110, 74112 & Kurume')).toEqual(['74110', '74112', 'Kurume'])
    expect(splitVarieties(undefined)).toEqual([])
  })
})
