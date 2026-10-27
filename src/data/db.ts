// On-device storage (ADR-01, D5): IndexedDB through Dexie. Photos live in
// their own table as bytes, outside the bean records (DR-03).

import Dexie, { type Table } from 'dexie'
import type { Bean, Brew } from '../domain/schemas.js'

export const SCHEMA_VERSION = 1

export interface PhotoRecord {
  id: string
  beanId: string | null
  type: string
  bytes: ArrayBuffer
  createdAt: string
}

export interface MetaRecord {
  key: string
  value: unknown
}

export class BrewMapDB extends Dexie {
  beans!: Table<Bean, string>
  brews!: Table<Brew, string>
  photos!: Table<PhotoRecord, string>
  meta!: Table<MetaRecord, string>

  constructor(name = 'brewmap') {
    super(name)
    // DR-04: each schema change is a new version with an upgrade; never edit a shipped one.
    this.version(1).stores({
      beans: 'id, createdAt, originCountry, status, legacyId',
      brews: 'id, beanId, createdAt, legacyId',
      photos: 'id, beanId',
      meta: 'key',
    })
  }
}

let instance: BrewMapDB | null = null

export function getDb(): BrewMapDB {
  if (!instance) instance = new BrewMapDB()
  return instance
}

/** Tests swap in an isolated database. */
export function useDb(db: BrewMapDB | null): void {
  instance = db
}

export class StorageFullError extends Error {
  constructor() {
    super('Your phone is out of space for BrewMap. Export your journal or remove some photos, then try again. Nothing was deleted.')
    this.name = 'StorageFullError'
  }
}

/** DR-05: storage pressure is reported, never solved by deleting the user's data. */
export async function guardQuota<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (e) {
    const name = (e as { name?: string; inner?: { name?: string } })?.name
    const inner = (e as { inner?: { name?: string } })?.inner?.name
    if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') throw new StorageFullError()
    throw e
  }
}

export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
