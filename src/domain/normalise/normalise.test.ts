import { describe, expect, it } from 'vitest'
import { CJK_NAMES, COUNTRIES, countryByCode, normaliseCountry } from './country.js'
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

// AI-01: origin is normalised to ISO 3166-1 whatever the label language; CAP-04:
// an origin the model returned as printed is not flagged as unmatched.
describe('normaliseCountry with Chinese and Japanese label text (AI-01, CAP-04)', () => {
  it.each([
    ['哥倫比亞', 'CO'],
    ['哥伦比亚', 'CO'],
    ['コロンビア', 'CO'],
    ['衣索比亞', 'ET'],
    ['埃塞俄比亚', 'ET'],
    ['エチオピア', 'ET'],
    ['肯亞', 'KE'],
    ['肯雅', 'KE'],
    ['肯尼亚', 'KE'],
    ['ケニア', 'KE'],
    ['巴拿馬', 'PA'],
    ['巴拿马', 'PA'],
    ['パナマ', 'PA'],
    ['瓜地馬拉', 'GT'],
    ['危地马拉', 'GT'],
    ['グアテマラ', 'GT'],
    ['巴西', 'BR'],
    ['ブラジル', 'BR'],
  ])('%s → %s', (raw, code) => {
    expect(normaliseCountry(raw)?.code).toBe(code)
  })

  it.each([
    ['哥倫比亞 薇拉', 'CO'],
    ['埃塞俄比亞 耶加雪啡', 'ET'],
    ['耶加雪菲', 'ET'],
    ['エチオピア・イルガチェフェ', 'ET'],
    ['コロンビア Huila', 'CO'],
    ['肯亞 AA', 'KE'],
    ['タンザニア キリマンジャロ', 'TZ'],
    ['印度尼西亞 蘇門答臘', 'ID'],
    ['ハワイ・コナ', 'US'],
    ['中国台湾', 'TW'],
    ['中國雲南', 'CN'],
    ['タイ・チェンライ', 'TH'],
    ['タイ産', 'TH'],
  ])('reads a country or region in label text: %s → %s', (raw, code) => {
    expect(normaliseCountry(raw)?.code).toBe(code)
  })

  it('reads half-width katakana and full-width Latin letters', () => {
    expect(normaliseCountry('ｺﾛﾝﾋﾞｱ')?.code).toBe('CO')
    expect(normaliseCountry('ＣＯＬＯＭＢＩＡ')?.code).toBe('CO')
  })

  it('prefers the longer name when one contains another', () => {
    expect(normaliseCountry('印度')?.code).toBe('IN')
    expect(normaliseCountry('印度尼西亚')?.code).toBe('ID')
    expect(normaliseCountry('インド')?.code).toBe('IN')
    expect(normaliseCountry('インドネシア')?.code).toBe('ID')
  })

  it('does not match a short katakana name inside a longer word', () => {
    expect(normaliseCountry('スタイル')).toBeNull() // contains タイ
    expect(normaliseCountry('ココナッツ')).toBeNull() // contains コナ
  })

  it('returns null for Chinese or Japanese text that names no coffee country', () => {
    expect(normaliseCountry('咖啡豆')).toBeNull()
    expect(normaliseCountry('ブレンド')).toBeNull()
    expect(normaliseCountry('藍山風味')).toBeNull() // Blue Mountain style blend, not an origin
  })

  it('has Chinese and Japanese names for every supported country, each meaning one country', () => {
    const codes = new Set(COUNTRIES.map((c) => c.code))
    expect(new Set(Object.keys(CJK_NAMES))).toEqual(codes)
    const kanjiInJapanese = new Set(['CN', 'TW']) // 中国 and 台湾, shared with Chinese
    const seen = new Map<string, string>()
    for (const [code, names] of Object.entries(CJK_NAMES)) {
      expect(
        names.some((n) => /\p{Script=Han}/u.test(n)),
        `${code} has a Chinese name`,
      ).toBe(true)
      expect(kanjiInJapanese.has(code) || names.some((n) => /\p{Script=Katakana}/u.test(n)), `${code} has a Japanese name`).toBe(true)
      for (const n of names) {
        expect(seen.get(n) ?? code, `${n} is listed once`).toBe(code)
        seen.set(n, code)
        expect(normaliseCountry(n)?.code, `${n} → ${code}`).toBe(code)
      }
    }
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

  // AI-01: process and roast are mapped to the enumerations whatever the label language.
  it.each([
    ['水洗', 'washed'],
    ['水洗式', 'washed'],
    ['全水洗', 'washed'],
    ['ウォッシュト', 'washed'],
    ['日曬', 'natural'],
    ['日晒', 'natural'],
    ['非水洗式', 'natural'],
    ['ナチュラル', 'natural'],
    ['ﾅﾁｭﾗﾙ', 'natural'],
    ['蜜處理', 'honey'],
    ['蜜处理', 'honey'],
    ['紅蜜', 'honey'],
    ['半水洗', 'honey'],
    ['ハニープロセス', 'honey'],
    ['パルプドナチュラル', 'honey'],
    ['厭氧日曬', 'anaerobic'],
    ['厌氧发酵', 'anaerobic'],
    ['嫌気性発酵', 'anaerobic'],
    ['濕剝法', 'wet-hulled'],
    ['スマトラ式', 'wet-hulled'],
  ])('process %s → %s (AI-01)', (raw, value) => expect(normaliseProcess(raw)).toBe(value))

  it.each([
    ['淺焙', 'light'],
    ['浅焙', 'light'],
    ['淺度烘焙', 'light'],
    ['浅煎り', 'light'],
    ['シナモンロースト', 'light'],
    ['淺中焙', 'medium-light'],
    ['中淺焙', 'medium-light'],
    ['中浅煎り', 'medium-light'],
    ['シティロースト', 'medium-light'],
    ['中焙', 'medium'],
    ['中度烘焙', 'medium'],
    ['中煎り', 'medium'],
    ['ミディアムロースト', 'medium'],
    ['中深焙', 'medium-dark'],
    ['中深煎り', 'medium-dark'],
    ['フルシティロースト', 'medium-dark'],
    ['深焙', 'dark'],
    ['深煎り', 'dark'],
    ['極深焙', 'dark'],
    ['フレンチロースト', 'dark'],
  ])('roast %s → %s (AI-01)', (raw, value) => expect(normaliseRoast(raw)).toBe(value))

  it('does not read sun-drying or fermentation alone as a process', () => {
    expect(normaliseProcess('天日乾燥')).toBeNull() // also used for washed coffee
    expect(normaliseProcess('發酵')).toBeNull()
    expect(normaliseProcess('水洗式・天日乾燥')).toBe('washed')
  })

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

  // AI-01: the roast date is read as printed; CAP-04: 年 月 日 dates are unambiguous, so not flagged day-first.
  describe('Chinese and Japanese dates (AI-01, CAP-04)', () => {
    const nov = new Date('2026-11-23T08:00:00+08:00')

    it('reads 年 月 日 dates as unambiguous', () => {
      expect(parseRoastDate('2026年11月10日', nov)).toEqual({ iso: '2026-11-10', reading: 'cjk', ambiguous: false })
      expect(parseRoastDate('2026年01月05日', nov)?.iso).toBe('2026-01-05')
      expect(parseRoastDate('2026年1月5日', nov)?.iso).toBe('2026-01-05')
      expect(parseRoastDate('焙煎日：2026 年 11 月 10 日', nov)?.iso).toBe('2026-11-10')
      expect(parseRoastDate('烘焙日期 2026年11月10号', nov)?.iso).toBe('2026-11-10')
      expect(parseRoastDate('26年11月10日', nov)?.iso).toBe('2026-11-10')
    })

    it('reads full-width digits', () => {
      expect(parseRoastDate('２０２６年１１月１０日', nov)?.iso).toBe('2026-11-10')
    })

    it('reads Japanese era dates, including the first year (元年)', () => {
      expect(parseRoastDate('令和8年11月10日', nov)).toEqual({ iso: '2026-11-10', reading: 'era', ambiguous: false })
      expect(parseRoastDate('令和８年１１月１０日', nov)?.iso).toBe('2026-11-10')
      const reiwa1 = new Date('2019-06-01T00:00:00Z')
      expect(parseRoastDate('令和元年5月1日', reiwa1)?.iso).toBe('2019-05-01')
      expect(parseRoastDate('令和元年4月30日', reiwa1)).toBeNull() // still Heisei 31
    })

    it('never guesses a missing year or day', () => {
      expect(parseRoastDate('11月10日', nov)).toBeNull()
      expect(parseRoastDate('2026年11月', nov)).toBeNull()
    })

    it('rejects impossible, future and very old dates', () => {
      expect(parseRoastDate('2026年2月30日', nov)).toBeNull()
      expect(parseRoastDate('2026年12月1日', nov)).toBeNull()
      expect(parseRoastDate('2024年11月10日', nov)).toBeNull()
      expect(parseRoastDate('令和9年1月1日', nov)).toBeNull()
    })
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
