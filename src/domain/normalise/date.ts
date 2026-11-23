// Roast dates as printed on bags. Hong Kong reads ambiguous dates day-first
// (NFR-13); a reading must also be plausible: not in the future and at most a
// year old. Chinese and Japanese dates mark the year, month and day
// (2026年11月10日, 令和8年11月10日), so they are never ambiguous.

export interface DateReading {
  iso: string
  /** "cjk" is 年 月 日 with a Gregorian year; "era" is a Japanese era year (令和). */
  reading: 'iso' | 'day-first' | 'month-first' | 'words' | 'cjk' | 'era'
  /** True when the numbers could also be read the other way round. */
  ambiguous: boolean
}

/** 令和 (Reiwa) began on 1 May 2019; 令和元年 is its first year. Earlier eras are too old for a roast date. */
const REIWA_START = '2019-05-01'

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y
}

function dayIndex(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000)
}

export function isPlausibleRoastDate(iso: string, today: Date): boolean {
  const t = Math.floor(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / 86400000)
  const d = dayIndex(iso)
  return d <= t + 1 && d >= t - 365
}

export function parseRoastDate(text: string | null | undefined, today: Date = new Date()): DateReading | null {
  if (!text) return null
  const s = text.normalize('NFKC').toLowerCase() // full-width ２０２６年１１月 → 2026年11月

  // A date without a year (11月10日) is not completed: the year would be a guess (AI-01).
  const era = s.match(/令和\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/)
  if (era) {
    const v = toIso(2018 + (era[1] === '元' ? 1 : +era[1]), +era[2], +era[3])
    return v && v >= REIWA_START && isPlausibleRoastDate(v, today) ? { iso: v, reading: 'era', ambiguous: false } : null
  }

  // (?:^|\D) rather than a lookbehind, which iOS Safari before 16.4 cannot parse.
  const cjk = s.match(/(?:^|\D)(\d{4}|\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/)
  if (cjk) {
    const v = toIso(fullYear(+cjk[1]), +cjk[2], +cjk[3])
    return v && isPlausibleRoastDate(v, today) ? { iso: v, reading: 'cjk', ambiguous: false } : null
  }

  const iso = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (iso) {
    const v = toIso(+iso[1], +iso[2], +iso[3])
    return v && isPlausibleRoastDate(v, today) ? { iso: v, reading: 'iso', ambiguous: false } : null
  }

  const words = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{2,4})/) ?? null
  const wordsUs = s.match(/([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})/) ?? null
  for (const [d, mon, y] of [words ? [words[1], words[2], words[3]] : null, wordsUs ? [wordsUs[2], wordsUs[1], wordsUs[3]] : null].filter(
    Boolean,
  ) as string[][]) {
    const m = MONTHS[mon.slice(0, 4)] ?? MONTHS[mon.slice(0, 3)]
    if (!m) continue
    const v = toIso(fullYear(+y), m, +d)
    if (v && isPlausibleRoastDate(v, today)) return { iso: v, reading: 'words', ambiguous: false }
  }

  const num = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (num) {
    const a = +num[1]
    const b = +num[2]
    const y = fullYear(+num[3])
    const dayFirst = toIso(y, b, a)
    const monthFirst = toIso(y, a, b)
    const dfOk = dayFirst !== null && isPlausibleRoastDate(dayFirst, today)
    const mfOk = monthFirst !== null && isPlausibleRoastDate(monthFirst, today)
    const ambiguous = a <= 12 && b <= 12 && a !== b
    if (dfOk) return { iso: dayFirst!, reading: 'day-first', ambiguous: ambiguous && mfOk }
    if (mfOk) return { iso: monthFirst!, reading: 'month-first', ambiguous: false }
  }
  return null
}

export function daysSince(iso: string | null | undefined, today: Date = new Date()): number | null {
  if (!iso) return null
  const t = Math.floor(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / 86400000)
  const d = dayIndex(iso)
  return Number.isFinite(d) ? t - d : null
}
