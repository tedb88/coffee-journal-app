// JRN-04: everything the user has, out and back in without loss.

import { z } from 'zod'
import { label } from '../domain/enums.js'
import { countryByCode } from '../domain/normalise/country.js'
import { formatTime } from '../domain/recipe/format.js'
import { BeanSchema, BrewSchema } from '../domain/schemas.js'
import { getDb, guardQuota, SCHEMA_VERSION, type BrewMapDB } from './db.js'

export const EXPORT_FORMAT = 'brewmap-export'

const PhotoExportSchema = z.object({ id: z.string(), beanId: z.string().nullable(), type: z.string(), createdAt: z.string(), base64: z.string() })

export const ExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  exportedAt: z.string(),
  beans: z.array(BeanSchema),
  brews: z.array(BrewSchema),
  photos: z.array(PhotoExportSchema).default([]),
})
export type ExportFile = z.infer<typeof ExportSchema>

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

export async function exportAll(opts: { includePhotos?: boolean } = {}, db: BrewMapDB = getDb()): Promise<ExportFile> {
  const [beans, brews, photos] = await Promise.all([db.beans.toArray(), db.brews.toArray(), opts.includePhotos ? db.photos.toArray() : []])
  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    beans,
    brews,
    photos: photos.map((p) => ({ id: p.id, beanId: p.beanId, type: p.type, createdAt: p.createdAt, base64: toBase64(p.bytes) })),
  }
}

export interface ImportResult {
  beans: number
  brews: number
  photos: number
}

/** Merge an export into this device. Records with the same id are replaced by the imported copy. */
export async function importAll(data: unknown, db: BrewMapDB = getDb()): Promise<ImportResult> {
  const parsed = ExportSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error(`This file is not a BrewMap export, or it is damaged: ${parsed.error.issues[0]?.message ?? 'unknown problem'}.`)
  }
  const file = parsed.data
  await guardQuota(() =>
    db.transaction('rw', db.beans, db.brews, db.photos, async () => {
      await db.beans.bulkPut(file.beans)
      await db.brews.bulkPut(file.brews)
      await db.photos.bulkPut(file.photos.map((p) => ({ id: p.id, beanId: p.beanId, type: p.type, createdAt: p.createdAt, bytes: fromBase64(p.base64) })))
    }),
  )
  return { beans: file.beans.length, brews: file.brews.length, photos: file.photos.length }
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function brewsCsv(db: BrewMapDB = getDb()): Promise<string> {
  const [brews, beans] = await Promise.all([db.brews.orderBy('createdAt').toArray(), db.beans.toArray()])
  const byId = new Map(beans.map((b) => [b.id, b]))
  const header = ['date', 'coffee', 'origin', 'process', 'roast', 'dose_g', 'water_g', 'ratio', 'temp_c', 'grind', 'total_time', 'rating', 'notes']
  const rows = brews.map((w) => {
    const b = byId.get(w.beanId)
    return [
      w.createdAt,
      b?.name,
      countryByCode(b?.originCountry)?.name ?? b?.originRaw,
      label(b?.process),
      label(b?.roastLevel),
      w.recipe.doseG,
      w.recipe.waterG,
      `1:${w.recipe.ratio}`,
      w.recipe.tempC,
      label(w.recipe.grind),
      formatTime(w.recipe.totalTimeS),
      w.rating,
      w.notes,
    ]
      .map(csvCell)
      .join(',')
  })
  return [header.join(','), ...rows].join('\n')
}
