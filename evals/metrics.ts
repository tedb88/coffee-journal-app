// Scoring for the eval harness (Solution Plan §6). Pure functions, so the
// metrics themselves are unit tested.

import { z } from 'zod'
import { GRIND_SCALE, type Grind } from '../src/domain/enums.js'
import { checkRecipe } from '../src/domain/recipe/validate.js'
import { BeanAttributesSchema, PreferencesSchema, type Recipe } from '../src/domain/schemas.js'
import type { ScanResult } from '../src/domain/scan.js'

export const THRESHOLDS = {
  labelCoreAccuracy: 0.9,
  labelFabricationMax: 0.02,
  labelRoastDateAccuracy: 0.85,
  labelSchemaValid: 0.99,
  labelP90LatencyMs: 6000,
  recipeValid: 1,
  recipeInRange: 0.95,
}

/* ---------- AI-02 / AI-03: recipes ---------- */

const range = z.tuple([z.number(), z.number()])
export const GoldenCaseSchema = z.object({
  id: z.string(),
  description: z.string(),
  input: z.object({ bean: BeanAttributesSchema.partial(), doseG: z.number().nullable(), preferences: PreferencesSchema.nullable() }),
  expect: z.object({
    tempC: range,
    ratio: range,
    grind: z.tuple([z.enum(GRIND_SCALE), z.enum(GRIND_SCALE)]),
    totalTimeS: range,
    bloomS: range,
    pours: range,
  }),
})
export const GoldenSetSchema = z.object({ version: z.string(), status: z.string(), today: z.string(), cases: z.array(GoldenCaseSchema).min(1) })
export type GoldenCase = z.infer<typeof GoldenCaseSchema>

export interface RecipeScore {
  id: string
  valid: boolean
  validationIssues: string[]
  outOfRange: string[]
}

const within = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi
const grindWithin = (g: Grind, [lo, hi]: [Grind, Grind]) =>
  GRIND_SCALE.indexOf(g) >= GRIND_SCALE.indexOf(lo) && GRIND_SCALE.indexOf(g) <= GRIND_SCALE.indexOf(hi)

export function scoreRecipe(c: GoldenCase, recipe: Recipe): RecipeScore {
  const issues = checkRecipe(recipe)
  const e = c.expect
  const pours = recipe.steps.filter((s) => s.kind === 'pour').length
  const outOfRange: string[] = []
  if (!within(recipe.tempC, e.tempC)) outOfRange.push(`tempC ${recipe.tempC} not in ${e.tempC.join('–')}`)
  if (!within(recipe.ratio, e.ratio)) outOfRange.push(`ratio 1:${recipe.ratio} not in 1:${e.ratio.join('–1:')}`)
  if (!grindWithin(recipe.grind, e.grind)) outOfRange.push(`grind ${recipe.grind} not in ${e.grind.join('…')}`)
  if (!within(recipe.totalTimeS, e.totalTimeS)) outOfRange.push(`totalTimeS ${recipe.totalTimeS} not in ${e.totalTimeS.join('–')}`)
  if (!within(recipe.bloomS, e.bloomS)) outOfRange.push(`bloomS ${recipe.bloomS} not in ${e.bloomS.join('–')}`)
  if (!within(pours, e.pours)) outOfRange.push(`pours ${pours} not in ${e.pours.join('–')}`)
  return { id: c.id, valid: issues.length === 0, validationIssues: issues, outOfRange }
}

export function summariseRecipes(scores: RecipeScore[]) {
  const n = scores.length
  const valid = scores.filter((s) => s.valid).length / n
  const inRange = scores.filter((s) => s.outOfRange.length === 0).length / n
  return { cases: n, valid, inRange, passed: valid >= THRESHOLDS.recipeValid, inRangePassed: inRange >= THRESHOLDS.recipeInRange }
}

/* ---------- AI-01: labels ---------- */

export const LabelTruthSchema = z.object({
  name: z.string().nullable(),
  roaster: z.string().nullable(),
  originCountry: z.string().length(2).nullable(),
  region: z.string().nullable(),
  producer: z.string().nullable(),
  varieties: z.array(z.string()),
  process: z.string().nullable(),
  roastLevel: z.string().nullable(),
  altitude: z.object({ minM: z.number(), maxM: z.number() }).nullable(),
  labelNotes: z.array(z.string()),
  roastDate: z.string().nullable(),
  netWeightG: z.number().nullable(),
})
export type LabelTruth = z.infer<typeof LabelTruthSchema>

export const LabelCaseSchema = z.object({
  id: z.string(),
  file: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  language: z.string(),
  conditions: z.array(z.string()).default([]),
  truth: LabelTruthSchema,
})
export type LabelCase = z.infer<typeof LabelCaseSchema>

export const LABEL_FIELDS = Object.keys(LabelTruthSchema.shape) as Array<keyof LabelTruth>
/** The fields "core accuracy" is measured on (AI-01). */
export const CORE_FIELDS: Array<keyof LabelTruth> = ['name', 'roaster', 'originCountry', 'process', 'roastLevel', 'roastDate']

export type FieldOutcome = 'correct' | 'wrong' | 'missed' | 'fabricated' | 'empty'

function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Names may differ in punctuation, case or an extra word ("Coffee", "Roasters"). */
export function fuzzyEqual(a: string, b: string): boolean {
  const x = fold(a)
  const y = fold(b)
  if (!x || !y) return false
  if (x === y || x.includes(y) || y.includes(x)) return true
  const xs = new Set(x.split(' '))
  const ys = y.split(' ')
  const shared = ys.filter((t) => xs.has(t)).length
  return shared / Math.max(xs.size, ys.length) >= 0.6
}

function listOverlap(a: string[], b: string[]): number {
  const x = new Set(a.map(fold))
  const y = new Set(b.map(fold))
  if (x.size === 0 && y.size === 0) return 1
  const inter = [...x].filter((t) => y.has(t)).length
  return inter / new Set([...x, ...y]).size
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

export function compareField(field: keyof LabelTruth, predicted: unknown, truth: unknown): FieldOutcome {
  if (isEmpty(truth)) return isEmpty(predicted) ? 'empty' : 'fabricated'
  if (isEmpty(predicted)) return 'missed'
  let same: boolean
  switch (field) {
    case 'name':
    case 'roaster':
    case 'region':
    case 'producer':
      same = fuzzyEqual(String(predicted), String(truth))
      break
    case 'varieties':
    case 'labelNotes':
      same = listOverlap(predicted as string[], truth as string[]) >= 0.5
      break
    case 'altitude': {
      const p = predicted as { minM: number; maxM: number }
      const t = truth as { minM: number; maxM: number }
      same = Math.abs(p.minM - t.minM) <= 50 && Math.abs(p.maxM - t.maxM) <= 50
      break
    }
    case 'netWeightG':
      same = Math.abs(Number(predicted) - Number(truth)) <= 1
      break
    default:
      same = String(predicted).toLowerCase() === String(truth).toLowerCase()
  }
  return same ? 'correct' : 'wrong'
}

export function predictedFields(scan: ScanResult): Record<keyof LabelTruth, unknown> {
  const f = scan.fields
  return {
    name: f.name,
    roaster: f.roaster,
    originCountry: f.originCountry,
    region: f.region,
    producer: f.producer,
    varieties: f.varieties,
    process: f.process,
    roastLevel: f.roastLevel,
    altitude: f.altitude,
    labelNotes: f.labelNotes,
    roastDate: f.roastDate,
    netWeightG: f.netWeightG,
  }
}

export interface LabelScore {
  id: string
  language: string
  ok: boolean
  latencyMs: number
  costUsd: number
  fields: Partial<Record<keyof LabelTruth, FieldOutcome>>
  error?: string
}

export function scoreLabel(c: LabelCase, scan: ScanResult | null, latencyMs: number, costUsd: number, error?: string): LabelScore {
  if (!scan) return { id: c.id, language: c.language, ok: false, latencyMs, costUsd, fields: {}, error }
  const p = predictedFields(scan)
  const fields: LabelScore['fields'] = {}
  for (const k of LABEL_FIELDS) fields[k] = compareField(k, p[k], c.truth[k])
  return { id: c.id, language: c.language, ok: true, latencyMs, costUsd, fields }
}

function p90(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)]
}

export function summariseLabels(scores: LabelScore[]) {
  const ok = scores.filter((s) => s.ok)
  const perField: Record<string, { accuracy: number | null; fabricated: number; present: number; absent: number }> = {}
  for (const k of LABEL_FIELDS) {
    const outcomes = ok.map((s) => s.fields[k]!)
    const present = outcomes.filter((o) => o === 'correct' || o === 'wrong' || o === 'missed').length
    const absent = outcomes.filter((o) => o === 'empty' || o === 'fabricated').length
    perField[k] = {
      accuracy: present ? outcomes.filter((o) => o === 'correct').length / present : null,
      fabricated: outcomes.filter((o) => o === 'fabricated').length,
      present,
      absent,
    }
  }
  const core = ok.flatMap((s) => CORE_FIELDS.map((k) => s.fields[k]!)).filter((o) => o === 'correct' || o === 'wrong' || o === 'missed')
  const coreAccuracy = core.length ? core.filter((o) => o === 'correct').length / core.length : 0
  const absentTotal = LABEL_FIELDS.reduce((n, k) => n + perField[k].absent, 0)
  const fabricatedTotal = LABEL_FIELDS.reduce((n, k) => n + perField[k].fabricated, 0)
  const fabricationRate = absentTotal ? fabricatedTotal / absentTotal : 0
  const roastDateAccuracy = perField.roastDate.accuracy ?? 0
  const schemaValid = scores.length ? ok.length / scores.length : 0
  const latencyP90 = p90(scores.map((s) => s.latencyMs))
  const byLanguage: Record<string, number> = {}
  for (const lang of new Set(ok.map((s) => s.language))) {
    const o = ok
      .filter((s) => s.language === lang)
      .flatMap((s) => CORE_FIELDS.map((k) => s.fields[k]!))
      .filter((x) => x !== 'empty' && x !== 'fabricated')
    byLanguage[lang] = o.length ? o.filter((x) => x === 'correct').length / o.length : 0
  }
  const gates = {
    coreAccuracy: coreAccuracy >= THRESHOLDS.labelCoreAccuracy,
    fabrication: fabricationRate <= THRESHOLDS.labelFabricationMax,
    roastDate: roastDateAccuracy >= THRESHOLDS.labelRoastDateAccuracy,
    schemaValid: schemaValid >= THRESHOLDS.labelSchemaValid,
    latency: latencyP90 <= THRESHOLDS.labelP90LatencyMs,
  }
  return {
    cases: scores.length,
    coreAccuracy,
    fabricationRate,
    roastDateAccuracy,
    schemaValid,
    latencyP90Ms: latencyP90,
    costUsd: scores.reduce((n, s) => n + s.costUsd, 0),
    byLanguage,
    perField,
    gates,
    passed: Object.values(gates).every(Boolean),
  }
}
