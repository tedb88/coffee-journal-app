// Read models for the Journal and Map screens.

import { label } from '../domain/enums.js'
import { countryByCode, normaliseCountry, type Country } from '../domain/normalise/country.js'
import { formatRecipe, type RecipeDisplay } from '../domain/recipe/format.js'
import type { JournalEntry } from '../data/repositories.js'

export interface EntryView {
  id: string
  name: string
  origin: string
  roastLevel: string
  process: string
  tastingNotes: string[]
  savedAt: string
  photoId: string | null
  guide: RecipeDisplay
  aiRecipe: boolean
}

export function originText(bean: JournalEntry['bean']): string {
  const country = countryByCode(bean.originCountry)
  if (!country) return bean.originRaw ?? bean.region ?? ''
  return bean.region ? `${country.name} · ${bean.region}` : country.name
}

export function entryView({ brew, bean }: JournalEntry): EntryView {
  return {
    id: brew.id,
    name: bean.name || 'Unnamed coffee',
    origin: originText(bean),
    roastLevel: label(bean.roastLevel),
    process: label(bean.process),
    tastingNotes: bean.labelNotes,
    savedAt: brew.createdAt,
    photoId: bean.photoIds[0] ?? null,
    guide: formatRecipe(brew.recipe),
    aiRecipe: brew.recipe.source === 'ai',
  }
}

export function matchesSearch(v: EntryView, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [v.name, v.origin, v.process, v.roastLevel, ...v.tastingNotes].some((s) => s.toLowerCase().includes(q))
}

export interface CountryPin {
  country: Country
  coffees: Array<{ name: string; roastLevel: string; notes: string[] }>
}

/** One pin per origin country, one line per bag (MAP-01). */
export function pinsByCountry(entries: JournalEntry[]): { pins: CountryPin[]; unmapped: string[] } {
  const pins = new Map<string, CountryPin>()
  const seenBeans = new Set<string>()
  const unmapped = new Set<string>()
  for (const { bean } of entries) {
    if (seenBeans.has(bean.id)) continue
    seenBeans.add(bean.id)
    const country = countryByCode(bean.originCountry) ?? normaliseCountry(bean.originRaw)
    if (!country) {
      if (bean.originRaw) unmapped.add(bean.originRaw)
      continue
    }
    const pin = pins.get(country.code) ?? { country, coffees: [] }
    pin.coffees.push({ name: bean.name || 'Unnamed coffee', roastLevel: label(bean.roastLevel), notes: bean.labelNotes })
    pins.set(country.code, pin)
  }
  return { pins: [...pins.values()], unmapped: [...unmapped] }
}
