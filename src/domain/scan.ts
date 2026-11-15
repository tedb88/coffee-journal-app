// AI-01 output contract and its normalisation. The model reads; code
// interprets: country to ISO, enums, roast date (day-first, plausible),
// altitude, weight. A field with no supporting text from the label is
// downgraded, which is how the fabrication gate is enforced.

import { z } from 'zod'
import type { Process, RoastLevel } from './enums.js'
import { normaliseCountry } from './normalise/country.js'
import { parseRoastDate, type DateReading } from './normalise/date.js'
import { normaliseProcess, normaliseRoast } from './normalise/enums.js'
import { parseAltitude, splitNotes, splitVarieties } from './normalise/text.js'
import type { Altitude } from './schemas.js'

const loose = z.union([z.string(), z.number()]).nullable().optional()
const list = z
  .union([z.array(z.string()), z.string()])
  .nullable()
  .optional()
const level = z.enum(['high', 'medium', 'low'])

export const SCAN_FIELDS = [
  'name',
  'roaster',
  'origin',
  'region',
  'producer',
  'varieties',
  'process',
  'roastLevel',
  'altitude',
  'tastingNotes',
  'roastDate',
  'netWeight',
] as const
export type ScanField = (typeof SCAN_FIELDS)[number]

/** What the vision model must return (prompt scan.v1). Lenient: code does the strict part. */
export const ScanModelOutputSchema = z.object({
  fields: z.object({
    name: loose,
    roaster: loose,
    origin: loose,
    region: loose,
    producer: loose,
    varieties: list,
    process: loose,
    roastLevel: loose,
    altitude: loose,
    tastingNotes: list,
    roastDate: loose,
    netWeight: loose,
  }),
  confidence: z.record(z.string(), level.catch('low')).default({}),
  evidence: z.record(z.string(), z.string().nullable()).default({}),
  labelLanguage: z.string().nullable().optional(),
  originalName: z.string().nullable().optional(),
})
export type ScanModelOutput = z.infer<typeof ScanModelOutputSchema>

export interface ScanResult {
  fields: {
    name: string | null
    roaster: string | null
    originCountry: string | null
    originName: string | null
    originRaw: string | null
    region: string | null
    producer: string | null
    varieties: string[]
    process: Process | null
    roastLevel: RoastLevel | null
    altitude: Altitude | null
    labelNotes: string[]
    roastDate: string | null
    netWeightG: number | null
  }
  confidence: Partial<Record<ScanField, 'high' | 'medium' | 'low'>>
  /** Fields the user should check, with the reason in plain words (CAP-04). */
  flags: Partial<Record<ScanField, string>>
  roastDateReading: DateReading | null
  labelLanguage: string | null
  originalName: string | null
  meta: { model: string | null; promptVersion: string | null }
}

/** These must quote the label, or they are treated as guesses. */
const EVIDENCE_REQUIRED: ScanField[] = ['name', 'roaster', 'origin', 'roastDate', 'altitude', 'netWeight']

function text(v: unknown, max = 120): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

/** "200 g", "250g", "12 oz", "1 lb" → grams. */
export function parseWeightG(raw: unknown): number | null {
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/,/g, '.')
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|gram|grams|oz|ounces?|lb|lbs)\b/)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2]
  const g = unit === 'kg' ? n * 1000 : unit.startsWith('oz') || unit.startsWith('ounce') ? n * 28.35 : unit.startsWith('lb') ? n * 453.6 : n
  const rounded = Math.round(g)
  return rounded >= 20 && rounded <= 5000 ? rounded : null
}

export function normaliseScan(out: ScanModelOutput, today: Date, meta: ScanResult['meta']): ScanResult {
  const f = out.fields
  const ev = out.evidence ?? {}
  const confidence: ScanResult['confidence'] = {}
  const flags: ScanResult['flags'] = {}
  for (const key of SCAN_FIELDS) {
    const c = out.confidence?.[key]
    if (c) confidence[key] = c
  }

  const country = normaliseCountry(text(f.origin))
  const datesource = text(ev.roastDate, 80) ?? text(f.roastDate, 80)
  const reading = parseRoastDate(datesource, today)

  const fields: ScanResult['fields'] = {
    name: text(f.name),
    roaster: text(f.roaster),
    originCountry: country?.code ?? null,
    originName: country?.name ?? null,
    originRaw: text(f.origin),
    region: text(f.region),
    producer: text(f.producer),
    varieties: splitVarieties(f.varieties as string | string[] | null),
    process: normaliseProcess(text(f.process)),
    roastLevel: normaliseRoast(text(f.roastLevel)),
    altitude: parseAltitude(text(ev.altitude) ?? text(f.altitude)),
    labelNotes: splitNotes(f.tastingNotes as string | string[] | null),
    roastDate: reading?.iso ?? null,
    netWeightG: parseWeightG(text(ev.netWeight) ?? text(f.netWeight)),
  }

  // Fabrication gate: a value with no quoted label text is a guess.
  const present: Record<string, unknown> = {
    name: fields.name,
    roaster: fields.roaster,
    origin: fields.originRaw,
    roastDate: text(f.roastDate) ?? fields.roastDate,
    altitude: text(f.altitude),
    netWeight: text(f.netWeight),
  }
  for (const key of EVIDENCE_REQUIRED) {
    if (present[key] && !text(ev[key])) {
      confidence[key] = 'low'
      flags[key] = 'Not clearly printed on the label. Check it.'
    }
  }

  if (fields.originRaw && !country) {
    confidence.origin = 'low'
    flags.origin = `Could not match "${fields.originRaw}" to a coffee country. Check it.`
  }
  if (text(f.roastDate) && !reading) {
    confidence.roastDate = 'low'
    flags.roastDate = `Could not read "${text(f.roastDate)}" as a recent date. Check it.`
  } else if (reading?.ambiguous) {
    confidence.roastDate = 'medium'
    flags.roastDate = `Printed ${datesource}. Read day-first as ${new Date(`${reading.iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.`
  }
  for (const key of SCAN_FIELDS) {
    if (confidence[key] === 'low' && !flags[key]) flags[key] = 'The label was hard to read here. Check it.'
  }

  return {
    fields,
    confidence,
    flags,
    roastDateReading: reading,
    labelLanguage: text(out.labelLanguage, 12),
    originalName: text(out.originalName),
    meta,
  }
}
