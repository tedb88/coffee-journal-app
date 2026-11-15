// Shared data contracts for the client, the API and storage (NFR-11).
// Units are canonical (DR-02): grams, °C, seconds, metres.

import { z } from 'zod'
import { BEAN_STATUSES, GRIND_SCALE, METHODS, PROCESSES, RECIPE_SOURCES, ROAST_LEVELS } from './enums.js'

export const ProcessSchema = z.enum(PROCESSES)
export const RoastLevelSchema = z.enum(ROAST_LEVELS)
export const GrindSchema = z.enum(GRIND_SCALE)
export const MethodSchema = z.enum(METHODS)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
const isoDateTime = z.string().datetime({ offset: true })

export const AltitudeSchema = z.object({ minM: z.number().int().positive(), maxM: z.number().int().positive() })
export type Altitude = z.infer<typeof AltitudeSchema>

/** The coffee attributes a recipe is built from. */
export const BeanAttributesSchema = z.object({
  name: z.string().max(120).default(''),
  originCountry: z.string().length(2).nullable().default(null),
  region: z.string().max(120).nullable().default(null),
  process: ProcessSchema.nullable().default(null),
  roastLevel: RoastLevelSchema.nullable().default(null),
  roastDate: isoDate.nullable().default(null),
  varieties: z.array(z.string().max(60)).max(10).default([]),
  altitude: AltitudeSchema.nullable().default(null),
  labelNotes: z.array(z.string().max(40)).max(12).default([]),
})
export type BeanAttributes = z.infer<typeof BeanAttributesSchema>

export const ExtractionMetaSchema = z.object({
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  labelLanguage: z.string().nullable(),
  confidence: z.record(z.string(), z.enum(['high', 'medium', 'low'])).default({}),
  userCorrected: z.array(z.string()).default([]),
})
export type ExtractionMeta = z.infer<typeof ExtractionMetaSchema>

export const BeanSchema = BeanAttributesSchema.extend({
  id: z.string().min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  roaster: z.string().max(120).nullable().default(null),
  producer: z.string().max(120).nullable().default(null),
  originRaw: z.string().max(120).nullable().default(null),
  netWeightG: z.number().positive().nullable().default(null),
  remainingG: z.number().min(0).nullable().default(null),
  status: z.enum(BEAN_STATUSES).default('active'),
  photoIds: z.array(z.string()).default([]),
  source: z.enum(['scan', 'manual', 'legacy']),
  legacyId: z.string().nullable().default(null),
  extraction: ExtractionMetaSchema.nullable().default(null),
})
export type Bean = z.infer<typeof BeanSchema>

export const StepSchema = z.object({
  kind: z.enum(['bloom', 'pour', 'drawdown']),
  label: z.string(),
  startS: z.number().int().min(0),
  /** When the pour in this step should be finished. Equals startS for the drawdown. */
  pourEndS: z.number().int().min(0),
  /** When the next step starts (or, for the last step, when the brew is done). */
  endS: z.number().int().min(0),
  /** Water added in this step, in grams. */
  amountG: z.number().int().min(0),
  /** Total water on the scale at the end of this step. */
  targetG: z.number().int().min(0),
  note: z.string().default(''),
})
export type Step = z.infer<typeof StepSchema>

export const RecipeSchema = z.object({
  method: MethodSchema,
  doseG: z.number().int(),
  waterG: z.number().int(),
  ratio: z.number().int(),
  tempC: z.number().int(),
  grind: GrindSchema,
  bloomS: z.number().int(),
  totalTimeS: z.number().int(),
  steps: z.array(StepSchema),
  rationale: z.string().nullable().default(null),
  expectedCup: z.string().nullable().default(null),
  source: z.enum(RECIPE_SOURCES),
  engineVersion: z.string(),
  rulesVersion: z.string(),
  promptVersion: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  /** Legacy journal entries keep their original display strings. */
  legacyGuide: z.record(z.string(), z.unknown()).nullable().default(null),
})
export type Recipe = z.infer<typeof RecipeSchema>

export const BalanceSchema = z.object({
  /** −2 very sour … 0 balanced … +2 very bitter */
  sourBitter: z.number().int().min(-2).max(2),
  /** −2 very weak … 0 just right … +2 very strong */
  strength: z.number().int().min(-2).max(2),
})
export type Balance = z.infer<typeof BalanceSchema>

export const BrewSchema = z.object({
  id: z.string().min(1),
  beanId: z.string().min(1),
  createdAt: isoDateTime,
  method: MethodSchema,
  recipe: RecipeSchema,
  guided: z.boolean().default(false),
  rating: z.number().int().min(1).max(5).nullable().default(null),
  balance: BalanceSchema.nullable().default(null),
  descriptors: z.array(z.string()).default([]),
  notes: z.string().default(''),
  grindSetting: z.string().max(40).nullable().default(null),
  legacyId: z.string().nullable().default(null),
})
export type Brew = z.infer<typeof BrewSchema>

/** Taste preferences chosen before a recipe (the Customize step). */
export const PreferencesSchema = z.object({
  taste: z.enum(['fruity', 'floral', 'chocolatey', 'balanced']).nullable().default(null),
  body: z.enum(['light', 'medium', 'strong', 'concentrated']).nullable().default(null),
  acidity: z.enum(['bright', 'smooth', 'lowacid']).nullable().default(null),
})
export type Preferences = z.infer<typeof PreferencesSchema>
