// Plain-words display helpers shared by the screens (design system: Numbers, data and states).

import { label } from '../domain/enums.js'
import { countryByCode } from '../domain/normalise/country.js'
import { freshness, freshnessText, type Freshness } from '../domain/beans/freshness.js'
import { formatTime } from '../domain/recipe/format.js'
import type { Bean, Recipe } from '../domain/schemas.js'

export function countryName(bean: Pick<Bean, 'originCountry' | 'originRaw'>): string | null {
  return countryByCode(bean.originCountry)?.name ?? bean.originRaw ?? null
}

/** "Ethiopia · Washed · Light" */
export function beanMeta(bean: Pick<Bean, 'originCountry' | 'originRaw' | 'process' | 'roastLevel'>): string {
  return [countryName(bean), label(bean.process), label(bean.roastLevel)].filter(Boolean).join(' · ')
}

/** "Fernleaf Roasters · Ethiopia, Guji" */
export function beanByline(bean: Pick<Bean, 'roaster' | 'originCountry' | 'originRaw' | 'region'>): string {
  const origin = [countryName(bean), bean.region].filter(Boolean).join(', ')
  return [bean.roaster, origin].filter(Boolean).join(' · ')
}

export function freshnessStatus(
  bean: Pick<Bean, 'roastDate' | 'roastLevel'>,
  today: Date,
): { tone: 'positive' | 'notice' | 'neutral'; text: string; f: Freshness } | null {
  const f = freshness(bean, today)
  if (!f) return null
  return { tone: f.state === 'peak' ? 'positive' : f.state === 'resting' ? 'notice' : 'neutral', text: freshnessText(f), f }
}

/** Right-hand amount on a bean row: "65 g" and "about 4 brews" or "new". */
export function remaining(bean: Pick<Bean, 'remainingG' | 'netWeightG'>, doseG: number, brewCount: number): { amount: string; note: string } {
  if (bean.remainingG === null) return { amount: '—', note: brewCount ? `${brewCount} ${brewCount === 1 ? 'brew' : 'brews'}` : 'new' }
  const doses = Math.floor(bean.remainingG / Math.max(1, doseG))
  const note = brewCount === 0 ? 'new' : doses === 0 ? 'nearly empty' : `about ${doses} ${doses === 1 ? 'brew' : 'brews'}`
  return { amount: `${Math.round(bean.remainingG)} g`, note }
}

/** "15 g · 240 g · 94 °C · 22 clicks · 3:10" */
export function recipeLine(recipe: Recipe, clicks: number | null = null, timeS: number | null = null): string {
  const legacy = recipe.source === 'legacy' && recipe.legacyGuide
  if (legacy) {
    const g = recipe.legacyGuide as Record<string, string>
    return [g.coffeeAmount, g.waterAmount, g.waterTemp, g.totalTime].filter(Boolean).join(' · ')
  }
  return [
    `${recipe.doseG} g`,
    `${recipe.waterG} g`,
    `${recipe.tempC} °C`,
    clicks !== null ? `${clicks} clicks` : label(recipe.grind),
    formatTime(timeS ?? recipe.totalTimeS),
  ].join(' · ')
}

/** "Today, 07:58", "Yesterday, 18:02", "Tue 21 Oct, 07:40" in local time. */
export function whenText(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86_400_000)
  if (diff === 0) return `Today, ${time}`
  if (diff === 1) return `Yesterday, ${time}`
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
}

/** "Thursday 23 October" */
export function longDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** "14 Oct 2026" (NFR-13: day first). */
export function fullDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** "3:10" → 190; null when unreadable. */
export function parseMinutes(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):([0-5]\d)$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  const n = Number(text)
  return Number.isFinite(n) && n > 0 && n < 3600 ? Math.round(n) : null
}
