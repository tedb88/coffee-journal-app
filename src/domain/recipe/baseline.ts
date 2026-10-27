// The rules-only recipe (RCP-06): origin profile, then process, roast,
// taste preferences and freshness, then the dose. Used on its own offline or
// when AI is unavailable, and as the starting point AI adjusts.

import { shiftGrind } from '../enums.js'
import { daysSince } from '../normalise/date.js'
import type { BeanAttributes, Preferences } from '../schemas.js'
import {
  DEFAULT_POURS,
  DEFAULT_PROFILE,
  FRESHNESS,
  FRESH_BLOOM_EXTRA_S,
  ORIGIN_PROFILES,
  POURS_BY_TASTE,
  PREFERENCE_MODIFIERS,
  PROCESS_MODIFIERS,
  ROAST_MODIFIERS,
  V60,
  type Modifier,
} from '../rules/index.js'
import { clampParams, type RecipeParams } from './params.js'

export interface RecipeInput {
  bean: Pick<BeanAttributes, 'originCountry' | 'process' | 'roastLevel' | 'roastDate'>
  doseG?: number | null
  preferences?: Preferences | null
  today?: Date
}

export interface Baseline {
  params: RecipeParams
  /** Plain-language reasons, origin first. */
  notes: string[]
  daysOffRoast: number | null
}

function apply(p: RecipeParams, m: Modifier | undefined): RecipeParams {
  if (!m) return p
  return {
    ...p,
    tempC: p.tempC + m.tempC,
    grind: shiftGrind(p.grind, m.grindSteps),
    bloomS: p.bloomS + m.bloomS,
    ratio: p.ratio + m.ratio,
    totalS: p.totalS + m.totalS,
  }
}

export function defaultDose(bean: Pick<BeanAttributes, 'originCountry'>): number {
  return (bean.originCountry && ORIGIN_PROFILES[bean.originCountry]?.defaultDoseG) || DEFAULT_PROFILE.defaultDoseG
}

export function baselineParams(input: RecipeInput): Baseline {
  const { bean } = input
  const profile = (bean.originCountry && ORIGIN_PROFILES[bean.originCountry]) || DEFAULT_PROFILE
  const prefs = input.preferences ?? null
  const notes = [profile.note]

  let p: RecipeParams = {
    doseG: profile.defaultDoseG,
    ratio: profile.ratio,
    tempC: profile.tempC,
    grind: profile.grind,
    bloomS: profile.bloomS,
    totalS: profile.totalS,
    pours: (prefs?.taste && POURS_BY_TASTE[prefs.taste]) || DEFAULT_POURS,
  }

  if (bean.process) {
    p = apply(p, PROCESS_MODIFIERS[bean.process])
    const n = PROCESS_MODIFIERS[bean.process].note
    if (n && bean.process !== 'washed') notes.push(n)
  }
  if (bean.roastLevel) p = apply(p, ROAST_MODIFIERS[bean.roastLevel])
  if (prefs?.body) p = apply(p, PREFERENCE_MODIFIERS.body[prefs.body])
  if (prefs?.acidity) p = apply(p, PREFERENCE_MODIFIERS.acidity[prefs.acidity])
  if (prefs?.taste) p = apply(p, PREFERENCE_MODIFIERS.taste[prefs.taste])

  const days = daysSince(bean.roastDate, input.today ?? new Date())
  if (days !== null && days >= 0 && days < FRESHNESS.restDays) {
    p = { ...p, bloomS: p.bloomS + FRESH_BLOOM_EXTRA_S }
    notes.push(`Roasted ${days} ${days === 1 ? 'day' : 'days'} ago, so it still holds a lot of gas: the bloom runs longer.`)
  }

  const dose = input.doseG && input.doseG > 0 ? input.doseG : profile.defaultDoseG
  p = { ...p, doseG: dose, totalS: Math.round(p.totalS * Math.sqrt(dose / V60.referenceDoseG)) }

  return { params: clampParams(p).params, notes, daysOffRoast: days }
}
