// JRN-05: move the prototype's localStorage journal into IndexedDB without
// losing anything (BRD Appendix B). The raw JSON is backed up first, the
// migration can run again safely, and the old key is left in place.

import { GRIND_SCALE, type Grind } from '../domain/enums.js'
import { normaliseCountry } from '../domain/normalise/country.js'
import { normaliseProcess, normaliseRoast } from '../domain/normalise/enums.js'
import { parseAltitude, splitNotes, splitVarieties } from '../domain/normalise/text.js'
import { parseTime } from '../domain/recipe/format.js'
import { ENGINE_VERSION } from '../domain/recipe/engine.js'
import { RULES_VERSION } from '../domain/rules/index.js'
import { BeanSchema, BrewSchema, type Bean, type Brew, type Recipe, type Step } from '../domain/schemas.js'
import { getDb, guardQuota, newId, type BrewMapDB, type PhotoRecord } from './db.js'

export const LEGACY_KEY = 'brewmap_journal'
export const MIGRATION_META = 'legacyMigration'
export const BACKUP_META = 'legacyBackup'

export interface LegacyGuide {
  coffeeAmount?: string
  waterAmount?: string
  ratio?: string
  waterTemp?: string
  grindSize?: string
  totalTime?: string
  steps?: Array<{ name?: string; water?: string; waitUntil?: string; notes?: string }>
  tips?: string
}

export interface LegacyEntry {
  id?: string
  savedAt?: string
  imageDataUrl?: string | null
  name?: string
  origin?: string
  region?: string
  roastLevel?: string
  process?: string
  tastingNotes?: string[] | string
  variety?: string
  altitude?: string | number
  labelLanguage?: string
  brewGuide?: LegacyGuide | null
}

export interface MigrationResult {
  alreadyDone: boolean
  migrated: number
  skipped: number
  failed: number
}

type ReadableStorage = Pick<Storage, 'getItem'>

export function readLegacy(storage: ReadableStorage | null | undefined): { raw: string; entries: LegacyEntry[] } | null {
  let raw: string | null = null
  try {
    raw = storage?.getItem(LEGACY_KEY) ?? null
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? { raw, entries: parsed as LegacyEntry[] } : { raw, entries: [] }
  } catch {
    return { raw, entries: [] }
  }
}

function int(text: unknown, fallback: number): number {
  const n = parseInt(String(text ?? ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function grindOf(text: unknown): Grind {
  const t = String(text ?? '')
    .toLowerCase()
    .trim()
  return (GRIND_SCALE as readonly string[]).includes(t) ? (t as Grind) : 'medium'
}

function isoOr(text: unknown, fallback: string): string {
  const t = typeof text === 'string' ? Date.parse(text) : NaN
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback
}

export function legacyRecipe(guide: LegacyGuide | null | undefined): Recipe {
  const g = guide ?? {}
  const doseG = int(g.coffeeAmount, 15)
  const ratio = int(String(g.ratio ?? '').split(':')[1], 16)
  const waterG = int(g.waterAmount, Math.round(doseG * ratio))
  const totalTimeS = parseTime(g.totalTime) ?? 190
  let target = 0
  let prevEnd = 0
  const steps: Step[] = (g.steps ?? []).map((s, i) => {
    const amountG = int(s.water, 0)
    target += amountG
    const endS = Math.max(prevEnd, parseTime(s.waitUntil) ?? prevEnd)
    const step: Step = {
      kind: i === 0 ? 'bloom' : 'pour',
      label: s.name || (i === 0 ? 'Bloom' : `Pour ${i}`),
      startS: prevEnd,
      pourEndS: endS,
      endS,
      amountG,
      targetG: target,
      note: s.notes ?? '',
    }
    prevEnd = endS
    return step
  })
  return {
    method: 'v60',
    doseG,
    waterG,
    ratio,
    tempC: int(g.waterTemp, 93),
    grind: grindOf(g.grindSize),
    bloomS: steps[0]?.endS ?? 30,
    totalTimeS,
    steps,
    rationale: g.tips ?? null,
    expectedCup: null,
    source: 'legacy',
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    promptVersion: null,
    model: null,
    legacyGuide: guide ? (guide as Record<string, unknown>) : null,
  }
}

export function dataUrlToPhoto(dataUrl: string | null | undefined): { bytes: ArrayBuffer; type: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl ?? '')
  if (!m || !m[2]) return null
  try {
    const bin = atob(m[3])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes: bytes.buffer, type: m[1] || 'image/jpeg' }
  } catch {
    return null
  }
}

export function mapLegacyEntry(e: LegacyEntry, now: string): { bean: Bean; brew: Brew; photo: PhotoRecord | null } {
  const createdAt = isoOr(e.savedAt, now)
  const beanId = newId()
  const country = normaliseCountry(e.origin)
  const photoData = dataUrlToPhoto(e.imageDataUrl)
  const photo: PhotoRecord | null = photoData ? { id: newId(), beanId, createdAt, ...photoData } : null
  const bean = BeanSchema.parse({
    id: beanId,
    createdAt,
    updatedAt: now,
    name: String(e.name ?? '').slice(0, 120),
    originCountry: country?.code ?? null,
    originRaw: e.origin ? String(e.origin).slice(0, 120) : null,
    region: e.region ? String(e.region).slice(0, 120) : null,
    process: normaliseProcess(e.process),
    roastLevel: normaliseRoast(e.roastLevel),
    labelNotes: splitNotes(e.tastingNotes),
    varieties: splitVarieties(e.variety),
    altitude: parseAltitude(e.altitude),
    photoIds: photo ? [photo.id] : [],
    source: 'legacy',
    legacyId: e.id ? String(e.id) : null,
    extraction: { model: null, promptVersion: null, labelLanguage: e.labelLanguage ?? null, confidence: {}, userCorrected: [] },
  })
  const brew = BrewSchema.parse({
    id: newId(),
    beanId,
    createdAt,
    method: 'v60',
    recipe: legacyRecipe(e.brewGuide),
    legacyId: e.id ? String(e.id) : null,
  })
  return { bean, brew, photo }
}

export async function migrateLegacy(storage: ReadableStorage | null | undefined, db: BrewMapDB = getDb(), now: Date = new Date()): Promise<MigrationResult> {
  const done = await db.meta.get(MIGRATION_META)
  if (done) return { alreadyDone: true, migrated: 0, skipped: 0, failed: 0 }
  const legacy = readLegacy(storage)
  const at = now.toISOString()
  if (!legacy) {
    await db.meta.put({ key: MIGRATION_META, value: { at, count: 0 } })
    return { alreadyDone: false, migrated: 0, skipped: 0, failed: 0 }
  }

  // Backup first, so a failure part-way through can always be recovered.
  await guardQuota(() => db.meta.put({ key: BACKUP_META, value: { at, raw: legacy.raw } }))

  let migrated = 0
  let skipped = 0
  let failed = 0
  for (const entry of legacy.entries) {
    try {
      const { bean, brew, photo } = mapLegacyEntry(entry, at)
      // Check and insert in one transaction, so two launches at once (two tabs,
      // or a re-run effect) cannot both add the same entry.
      const added = await guardQuota(() =>
        db.transaction('rw', db.beans, db.brews, db.photos, async () => {
          if (bean.legacyId && (await db.beans.where('legacyId').equals(bean.legacyId).count()) > 0) return false
          await db.beans.add(bean)
          await db.brews.add(brew)
          if (photo) await db.photos.add(photo)
          return true
        }),
      )
      if (added) migrated++
      else skipped++
    } catch (e) {
      if ((e as Error).name === 'StorageFullError') throw e
      failed++
    }
  }
  // Only mark complete when every entry made it; otherwise the next launch tries the rest again.
  if (failed === 0) await db.meta.put({ key: MIGRATION_META, value: { at, count: migrated } })
  return { alreadyDone: false, migrated, skipped, failed }
}

export async function legacyBackup(db: BrewMapDB = getDb()): Promise<{ at: string; raw: string } | null> {
  const rec = await db.meta.get(BACKUP_META)
  return (rec?.value as { at: string; raw: string } | undefined) ?? null
}
