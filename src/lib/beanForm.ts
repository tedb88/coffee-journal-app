// The Confirm screen's editable fields (CAP-03, CAP-06), and the mapping
// from a scan to the form and from the form to a bean record.

import { PROCESSES, ROAST_LEVELS, type Process, type RoastLevel } from '../domain/enums.js'
import { countryByCode, normaliseCountry } from '../domain/normalise/country.js'
import { parseAltitude, splitNotes, splitVarieties } from '../domain/normalise/text.js'
import { isPlausibleRoastDate } from '../domain/normalise/date.js'
import type { BeanAttributes } from '../domain/schemas.js'
import type { ScanField, ScanResult } from '../domain/scan.js'
import type { BeanDraft } from '../data/repositories.js'

export interface BeanForm {
  name: string
  roaster: string
  /** ISO 3166-1 alpha-2, or '' when unknown. */
  originCountry: string
  region: string
  producer: string
  process: Process | ''
  roastLevel: RoastLevel | ''
  /** YYYY-MM-DD, or ''. */
  roastDate: string
  varieties: string
  altitude: string
  labelNotes: string
  netWeightG: string
}

export type FormField = keyof BeanForm

export const EMPTY_FORM: BeanForm = {
  name: '',
  roaster: '',
  originCountry: '',
  region: '',
  producer: '',
  process: '',
  roastLevel: '',
  roastDate: '',
  varieties: '',
  altitude: '',
  labelNotes: '',
  netWeightG: '',
}

/** Which scan field each form field is checked against. */
export const FORM_TO_SCAN: Partial<Record<FormField, ScanField>> = {
  name: 'name',
  roaster: 'roaster',
  originCountry: 'origin',
  region: 'region',
  producer: 'producer',
  process: 'process',
  roastLevel: 'roastLevel',
  roastDate: 'roastDate',
  varieties: 'varieties',
  altitude: 'altitude',
  labelNotes: 'tastingNotes',
  netWeightG: 'netWeight',
}

function altitudeText(a: ScanResult['fields']['altitude']): string {
  if (!a) return ''
  return a.minM === a.maxM ? `${a.minM} m` : `${a.minM}–${a.maxM} m`
}

export function formFromScan(scan: ScanResult): BeanForm {
  const f = scan.fields
  return {
    name: f.name ?? '',
    roaster: f.roaster ?? '',
    originCountry: f.originCountry ?? '',
    region: f.region ?? '',
    producer: f.producer ?? '',
    process: f.process ?? '',
    roastLevel: f.roastLevel ?? '',
    roastDate: f.roastDate ?? '',
    varieties: f.varieties.join(', '),
    altitude: altitudeText(f.altitude),
    labelNotes: f.labelNotes.join(', '),
    netWeightG: f.netWeightG ? String(f.netWeightG) : '',
  }
}

const trim = (s: string, max = 120) => s.trim().slice(0, max)
const orNull = (s: string, max?: number) => trim(s, max) || null

/** The attributes a recipe is built from, read from the form. Invalid values become null, never a guess. */
export function attributesFromForm(form: BeanForm, today = new Date()): BeanAttributes {
  const country = countryByCode(form.originCountry) ?? normaliseCountry(form.originCountry)
  return {
    name: trim(form.name),
    originCountry: country?.code ?? null,
    region: orNull(form.region),
    process: (PROCESSES as readonly string[]).includes(form.process) ? (form.process as Process) : null,
    roastLevel: (ROAST_LEVELS as readonly string[]).includes(form.roastLevel) ? (form.roastLevel as RoastLevel) : null,
    roastDate: /^\d{4}-\d{2}-\d{2}$/.test(form.roastDate) && isPlausibleRoastDate(form.roastDate, today) ? form.roastDate : null,
    varieties: splitVarieties(form.varieties)
      .slice(0, 10)
      .map((v) => v.slice(0, 60)),
    altitude: parseAltitude(form.altitude || null),
    labelNotes: splitNotes(form.labelNotes)
      .slice(0, 12)
      .map((n) => n.slice(0, 40)),
  }
}

/** Form fields the user changed from what the scan read (CAP-03). */
export function correctedFields(form: BeanForm, scan: ScanResult | null): FormField[] {
  if (!scan) return []
  const original = formFromScan(scan)
  return (Object.keys(EMPTY_FORM) as FormField[]).filter((k) => form[k].trim() !== original[k].trim())
}

export function beanDraftFromForm(form: BeanForm, scan: ScanResult | null, today = new Date()): BeanDraft {
  const attrs = attributesFromForm(form, today)
  const weight = Number(form.netWeightG)
  const netWeightG = Number.isFinite(weight) && weight >= 20 && weight <= 5000 ? Math.round(weight) : null
  const country = countryByCode(attrs.originCountry)
  return {
    ...attrs,
    name: attrs.name || 'Unnamed coffee',
    roaster: orNull(form.roaster),
    producer: orNull(form.producer),
    originRaw: scan?.fields.originRaw ?? (country ? null : orNull(form.originCountry)),
    netWeightG,
    remainingG: netWeightG,
    source: scan ? 'scan' : 'manual',
    extraction: scan
      ? {
          model: scan.meta.model,
          promptVersion: scan.meta.promptVersion,
          labelLanguage: scan.labelLanguage,
          confidence: scan.confidence,
          userCorrected: correctedFields(form, scan),
        }
      : null,
  }
}
