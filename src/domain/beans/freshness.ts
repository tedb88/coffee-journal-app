// BEAN-04: where a bag sits in its freshness window. Hidden without a roast date.

import type { FreshnessState, RoastLevel } from '../enums.js'
import { daysSince } from '../normalise/date.js'
import { FRESHNESS_WINDOWS } from '../rules/index.js'

export interface Freshness {
  /** Days since roasting; 0 on the roast day. */
  day: number
  state: FreshnessState
  restDays: number
  bestDays: number
  /** First day inside the best window, and the last (YYYY-MM-DD). */
  readyOn: string
  bestUntil: string
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function freshness(bean: { roastDate: string | null; roastLevel: RoastLevel | null }, today: Date = new Date()): Freshness | null {
  const day = daysSince(bean.roastDate, today)
  if (day === null || !bean.roastDate) return null
  const w = FRESHNESS_WINDOWS[bean.roastLevel ?? 'unknown']
  const d = Math.max(0, day)
  return {
    day: d,
    state: d < w.restDays ? 'resting' : d <= w.bestDays ? 'peak' : 'fading',
    restDays: w.restDays,
    bestDays: w.bestDays,
    readyOn: addDays(bean.roastDate, w.restDays),
    bestUntil: addDays(bean.roastDate, w.bestDays),
  }
}

/** "14 Oct" in Hong Kong order (NFR-13). */
export function dayMonth(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Plain words for the status line: "At its best · day 9", "Resting · ready 27 Oct". */
export function freshnessText(f: Freshness): string {
  if (f.state === 'resting') return `Resting · ready ${dayMonth(f.readyOn)}`
  if (f.state === 'peak') return `At its best · day ${f.day}`
  return `Past its best · day ${f.day}`
}
