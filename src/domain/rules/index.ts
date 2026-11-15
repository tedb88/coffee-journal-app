// The single source of brewing rules (RCP-05). The recipe engine, the
// validator, the offline fallback and the AI prompt all read from here.
// Values carried over from the prototype's rule tables; expert review of the
// ranges is pending (BRD D9).

import type { Grind, Process, RoastLevel } from '../enums.js'

export const RULES_VERSION = 'rules-2026.10.1'

export interface OriginProfile {
  ratio: number
  tempC: number
  grind: Grind
  bloomS: number
  totalS: number
  defaultDoseG: number
  note: string
}

/** Keyed by ISO 3166-1 alpha-2 country code. */
export const ORIGIN_PROFILES: Record<string, OriginProfile> = {
  ET: {
    ratio: 17,
    tempC: 94,
    grind: 'medium-fine',
    bloomS: 40,
    totalS: 210,
    defaultDoseG: 15,
    note: 'Ethiopian coffees grow high and dense, so a longer bloom and finer grind bring out floral and fruit notes.',
  },
  KE: {
    ratio: 16,
    tempC: 95,
    grind: 'medium-fine',
    bloomS: 35,
    totalS: 200,
    defaultDoseG: 15,
    note: 'Kenyan coffees are bright and juicy. Hotter water lifts the acidity and blackcurrant.',
  },
  CO: {
    ratio: 16,
    tempC: 93,
    grind: 'medium',
    bloomS: 30,
    totalS: 190,
    defaultDoseG: 15,
    note: 'Colombian coffees are balanced and forgiving, so a classic medium extraction works well.',
  },
  BR: {
    ratio: 15,
    tempC: 91,
    grind: 'medium-coarse',
    bloomS: 35,
    totalS: 180,
    defaultDoseG: 16,
    note: 'Brazilian coffees are low in acid and full-bodied. A coarser grind and cooler water bring out chocolate and nuts.',
  },
  GT: {
    ratio: 16,
    tempC: 93,
    grind: 'medium',
    bloomS: 30,
    totalS: 190,
    defaultDoseG: 15,
    note: 'Guatemalan coffees suit a balanced extraction: cocoa, spice and mild fruit.',
  },
  HN: {
    ratio: 16,
    tempC: 92,
    grind: 'medium',
    bloomS: 30,
    totalS: 185,
    defaultDoseG: 15,
    note: 'Honduran coffees are caramel-sweet. A moderate brew lets the sugars show.',
  },
  MX: {
    ratio: 16,
    tempC: 92,
    grind: 'medium',
    bloomS: 30,
    totalS: 185,
    defaultDoseG: 15,
    note: 'Mexican coffees tend to be mild and nutty. Keep the extraction even for a clean, sweet cup.',
  },
  CR: {
    ratio: 16,
    tempC: 93,
    grind: 'medium-fine',
    bloomS: 30,
    totalS: 195,
    defaultDoseG: 15,
    note: 'Costa Rican coffees take a slightly finer grind to draw out honey and stone fruit.',
  },
  PA: {
    ratio: 17,
    tempC: 94,
    grind: 'medium-fine',
    bloomS: 40,
    totalS: 210,
    defaultDoseG: 14,
    note: 'Panamanian Geshas are delicate. More water and a longer bloom keep the jasmine and bergamot.',
  },
  ID: {
    ratio: 14,
    tempC: 90,
    grind: 'medium-coarse',
    bloomS: 35,
    totalS: 170,
    defaultDoseG: 16,
    note: 'Indonesian coffees are earthy and heavy. A shorter, coarser brew keeps them from turning muddy.',
  },
  YE: {
    ratio: 16,
    tempC: 94,
    grind: 'medium-fine',
    bloomS: 40,
    totalS: 205,
    defaultDoseG: 15,
    note: 'Yemeni coffees are wild and complex. A longer bloom and hotter water open up dried fruit and spice.',
  },
  RW: {
    ratio: 16,
    tempC: 94,
    grind: 'medium-fine',
    bloomS: 35,
    totalS: 200,
    defaultDoseG: 15,
    note: 'Rwandan coffees are bright and tea-like. A finer grind brings out red fruit and florals.',
  },
}

export const DEFAULT_PROFILE: OriginProfile = {
  ratio: 16,
  tempC: 93,
  grind: 'medium',
  bloomS: 30,
  totalS: 190,
  defaultDoseG: 15,
  note: 'Rinse the paper filter with hot water and use filtered water for the cleanest cup.',
}

export interface Modifier {
  tempC: number
  grindSteps: number
  bloomS: number
  ratio: number
  totalS: number
  note?: string
}

const ZERO: Modifier = { tempC: 0, grindSteps: 0, bloomS: 0, ratio: 0, totalS: 0 }

export const PROCESS_MODIFIERS: Record<Process, Modifier> = {
  washed: { ...ZERO, note: 'Washed coffees give a clean cup, so standard settings let the origin speak.' },
  natural: {
    tempC: -1,
    grindSteps: 1,
    bloomS: 5,
    ratio: -1,
    totalS: 0,
    note: 'Naturals are fruity and sweet. Cooler water and a coarser grind stop them over-extracting.',
  },
  honey: {
    tempC: -1,
    grindSteps: 0,
    bloomS: 5,
    ratio: 0,
    totalS: 0,
    note: 'Honey process keeps the sweetness of the fruit. Slightly cooler water protects the caramel and stone fruit.',
  },
  anaerobic: {
    tempC: -2,
    grindSteps: 1,
    bloomS: 10,
    ratio: -1,
    totalS: 0,
    note: 'Anaerobic fermentation is intense. Go coarser and cooler to keep the fruit in balance.',
  },
  'wet-hulled': { tempC: -1, grindSteps: 1, bloomS: 0, ratio: 1, totalS: 0, note: 'Wet-hulled coffees are earthy. A coarser grind tames the heavy body.' },
}

export const ROAST_MODIFIERS: Record<RoastLevel, Modifier> = {
  light: { tempC: 2, grindSteps: -1, bloomS: 0, ratio: 0, totalS: 15 },
  'medium-light': { tempC: 1, grindSteps: 0, bloomS: 0, ratio: 0, totalS: 5 },
  medium: ZERO,
  'medium-dark': { tempC: -1, grindSteps: 1, bloomS: 0, ratio: 0, totalS: -10 },
  dark: { tempC: -3, grindSteps: 2, bloomS: 0, ratio: 0, totalS: -20 },
}

/** Taste preferences from the Customize step, applied after process and roast. */
export const PREFERENCE_MODIFIERS = {
  body: {
    light: { ...ZERO, ratio: 1, grindSteps: -1 },
    medium: ZERO,
    strong: { ...ZERO, ratio: -1 },
    concentrated: { ...ZERO, ratio: -3, totalS: -15 },
  } as Record<string, Modifier>,
  acidity: {
    bright: { ...ZERO, tempC: 1, ratio: 1 },
    smooth: ZERO,
    lowacid: { ...ZERO, tempC: -2, grindSteps: 1 },
  } as Record<string, Modifier>,
  taste: {
    fruity: { ...ZERO, tempC: 1 },
    floral: ZERO,
    chocolatey: { ...ZERO, tempC: -1, grindSteps: 1 },
    balanced: ZERO,
  } as Record<string, Modifier>,
}

/** Number of pours after the bloom, by taste preference. */
export const POURS_BY_TASTE: Record<string, number> = { fruity: 4, floral: 4, chocolatey: 2, balanced: 3 }
export const DEFAULT_POURS = 3

/** Freshness windows for filter brewing, in days since roast (BEAN-04). Pending expert review (D9). */
export const FRESHNESS = { restDays: 7, bestDays: 30 }

/** Very fresh coffee releases more gas: bloom longer. */
export const FRESH_BLOOM_EXTRA_S = 10

export const V60 = {
  /** Safe ranges every delivered recipe must sit inside (RCP-04). */
  bounds: {
    doseG: { min: 10, max: 30 },
    ratio: { min: 13, max: 18 },
    tempC: { min: 86, max: 96 },
    grind: { min: 'medium-fine' as Grind, max: 'medium-coarse' as Grind },
    bloomS: { min: 30, max: 50 },
    totalS: { min: 135, max: 240 },
    pours: { min: 2, max: 5 },
  },
  bloomWaterPerGram: 2,
  bloomPourS: 10,
  pourWindowS: 20,
  pourGapS: 10,
  minDrawdownS: 40,
  /** Total time grows gently with dose: × sqrt(dose / referenceDoseG). */
  referenceDoseG: 15,
}

/** Bounds on the adjustments an AI model may propose on top of the baseline (AI-02). */
export const AI_ADJUSTMENT_BOUNDS = {
  tempC: 3,
  ratio: 2,
  grindSteps: 2,
}

/** Rules rendered as text for the recipe prompt, so the prompt never restates them by hand. */
export function describeRulesForPrompt(): string {
  const b = V60.bounds
  return [
    `Method: V60 pour-over. Rules version ${RULES_VERSION}.`,
    `Safe ranges: dose ${b.doseG.min}-${b.doseG.max} g; ratio 1:${b.ratio.min} to 1:${b.ratio.max}; water ${b.tempC.min}-${b.tempC.max} °C; grind ${b.grind.min} to ${b.grind.max}; bloom ${b.bloomS.min}-${b.bloomS.max} s; total time ${b.totalS.min}-${b.totalS.max} s; ${b.pours.min}-${b.pours.max} pours after the bloom.`,
    `You may move temperature by at most ±${AI_ADJUSTMENT_BOUNDS.tempC} °C, ratio by at most ±${AI_ADJUSTMENT_BOUNDS.ratio}, and grind by at most ±${AI_ADJUSTMENT_BOUNDS.grindSteps} steps on the scale fine, medium-fine, medium, medium-coarse, coarse.`,
    'Lower extraction (coarser, cooler, shorter) for bitter or harsh cups; raise it (finer, hotter, longer) for sour or thin cups.',
  ].join('\n')
}
