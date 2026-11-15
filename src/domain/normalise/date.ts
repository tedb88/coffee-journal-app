// Roast dates as printed on bags. Hong Kong reads ambiguous dates day-first
// (NFR-13); a reading must also be plausible: not in the future and at most a
// year old.

export interface DateReading {
  iso: string
  reading: 'iso' | 'day-first' | 'month-first' | 'words'
  /** True when the numbers could also be read the other way round. */
  ambiguous: boolean
}

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
  const s = text.toLowerCase()

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
