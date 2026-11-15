import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recipeFromParams } from '../domain/recipe/engine.js'
import { BrewMapDB, guardQuota, newId, StorageFullError, useDb } from './db.js'
import { brewsCsv, exportAll, importAll } from './export.js'
import { BACKUP_META, dataUrlToPhoto, LEGACY_KEY, legacyBackup, legacyRecipe, migrateLegacy, readLegacy, type LegacyEntry } from './legacy-import.js'
import {
  addBrew,
  createBean,
  deleteBean,
  deleteBrew,
  getBean,
  getBrew,
  getPhoto,
  listBeans,
  listBrewsForBean,
  listJournal,
  restore,
  saveBean,
  updateBean,
  updateBrew,
  type BeanDraft,
} from './repositories.js'
import { estimateUsage, requestPersistence } from './storage.js'

let db: BrewMapDB
beforeEach(() => {
  db = new BrewMapDB(`test-${newId()}`)
  useDb(db)
})
afterEach(async () => {
  await db.delete()
  useDb(null)
})

const recipe = recipeFromParams({ doseG: 15, ratio: 16, tempC: 94, grind: 'medium-fine', bloomS: 40, totalS: 190, pours: 3 }, { source: 'rules' })
const photo = { bytes: new Uint8Array([1, 2, 3]).buffer, type: 'image/jpeg' }

/** A scanned bag and its first brew, as the app saves them: bag first, brew after tasting. */
async function scannedWithBrew(input: { bean: BeanDraft; recipe: typeof recipe; photo?: typeof photo }) {
  const bean = await saveBean({ bean: input.bean, photo: input.photo ?? null })
  const brew = await addBrew({ beanId: bean.id, recipe: input.recipe })
  return { bean: (await getBean(bean.id))!, brew }
}

describe('repositories', () => {
  it('saves a scanned bag with its photo and first brew', async () => {
    const { bean, brew } = await scannedWithBrew({
      bean: { source: 'scan', name: 'Hambela Alaka', originCountry: 'ET', netWeightG: 200, remainingG: 200 },
      recipe,
      photo,
    })
    expect(bean.photoIds).toHaveLength(1)
    expect(bean.remainingG).toBe(185) // BEAN-03: the dose comes off the bag
    expect(brew.beanId).toBe(bean.id)
    const stored = await getPhoto(bean.photoIds[0])
    expect(new Uint8Array(stored!.bytes)).toEqual(new Uint8Array([1, 2, 3]))
    const journal = await listJournal()
    expect(journal.map((e) => e.bean.name)).toEqual(['Hambela Alaka'])
  })

  it('creates, updates and lists beans with validation', async () => {
    const a = await createBean({ source: 'manual', name: 'A' })
    await new Promise((r) => setTimeout(r, 5))
    await createBean({ source: 'manual', name: 'B' })
    expect((await listBeans()).map((b) => b.name)).toEqual(['B', 'A'])
    const updated = await updateBean(a.id, { roaster: 'Fernleaf Roasters' })
    expect(updated.roaster).toBe('Fernleaf Roasters')
    expect((await getBean(a.id))?.roaster).toBe('Fernleaf Roasters')
    await expect(updateBean('missing', {})).rejects.toThrow(/No bean/)
    await expect(createBean({ source: 'manual', name: 'x'.repeat(500) })).rejects.toThrow()
    await expect(addBrew({ beanId: 'missing', recipe })).rejects.toThrow(/No bean/)
  })

  it('saves a bag on its own, before any brew', async () => {
    const bean = await saveBean({ bean: { source: 'manual', name: 'Kirinyaga AA', netWeightG: 250, remainingG: 250 } })
    expect(bean.photoIds).toEqual([])
    expect(await listBrewsForBean(bean.id)).toEqual([])
    expect(await listJournal()).toEqual([]) // the journal lists brews, so a new bag is not in it yet
  })

  it('deletes a brew but keeps the bag, giving the dose back (LOG-05, DR-05)', async () => {
    const { bean, brew } = await scannedWithBrew({ bean: { source: 'scan', name: 'Kirinyaga AA', netWeightG: 200, remainingG: 200 }, recipe, photo })
    const second = await addBrew({ beanId: bean.id, recipe })
    expect((await getBean(bean.id))?.remainingG).toBe(170)
    await deleteBrew(brew.id)
    const snap = await deleteBrew(second.id)
    expect(await getBean(bean.id)).toMatchObject({ remainingG: 200, photoIds: bean.photoIds })
    expect(await db.photos.count()).toBe(1)
    expect(await deleteBrew('missing')).toEqual({ beans: [], brews: [], photos: [] })

    await restore(snap) // Undo
    expect((await getBrew(second.id))?.id).toBe(second.id)
    expect((await getBean(bean.id))?.remainingG).toBe(185)
  })

  it('deletes a bag with its brews and photos, and Undo brings them all back', async () => {
    const { bean } = await scannedWithBrew({ bean: { source: 'scan', name: 'Hambela Alaka' }, recipe, photo })
    await addBrew({ beanId: bean.id, recipe })
    const snap = await deleteBean(bean.id)
    expect(snap).toMatchObject({ beans: [{ id: bean.id }] })
    expect(snap.brews).toHaveLength(2)
    expect(snap.photos).toHaveLength(1)
    expect(await db.beans.count()).toBe(0)
    expect(await db.brews.count()).toBe(0)
    await restore(snap)
    expect(await listBrewsForBean(bean.id)).toHaveLength(2)
    expect(await getPhoto(bean.photoIds[0])).toBeDefined()
  })

  it('edits a brew without touching its recipe snapshot (RCP-09)', async () => {
    const { brew } = await scannedWithBrew({ bean: { source: 'manual', name: 'A' }, recipe })
    const edited = await updateBrew(brew.id, { rating: 4, notes: 'Sweeter as it cooled', actualTimeS: 195 })
    expect(edited).toMatchObject({ rating: 4, notes: 'Sweeter as it cooled', actualTimeS: 195, recipe: brew.recipe, createdAt: brew.createdAt })
    await expect(updateBrew(brew.id, { rating: 9 })).rejects.toThrow()
    await expect(updateBrew('missing', {})).rejects.toThrow(/No brew/)
  })
})

describe('guardQuota (DR-05)', () => {
  it('turns quota errors into a clear message and never deletes', async () => {
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
    await expect(guardQuota(() => Promise.reject(quota))).rejects.toBeInstanceOf(StorageFullError)
    await expect(guardQuota(() => Promise.reject({ name: 'AbortError', inner: { name: 'QuotaExceededError' } }))).rejects.toBeInstanceOf(StorageFullError)
    await expect(guardQuota(() => Promise.reject(new Error('other')))).rejects.toThrow('other')
  })
})

describe('legacy migration (JRN-05)', () => {
  const tinyJpeg = 'data:image/jpeg;base64,' + btoa('\xff\xd8\xff\xd9')
  const entries: LegacyEntry[] = [
    {
      id: '1711950000000-abcde',
      savedAt: '2026-04-01T09:30:00.000Z',
      imageDataUrl: tinyJpeg,
      name: 'Hambela Alaka',
      origin: 'Ethiopia',
      region: 'Guji',
      roastLevel: 'Light',
      process: 'Washed',
      tastingNotes: ['Jasmine', 'Bergamot'],
      variety: 'Heirloom',
      altitude: '1,950–2,200 m',
      labelLanguage: 'en',
      brewGuide: {
        coffeeAmount: '15g',
        waterAmount: '255ml',
        ratio: '1:17',
        waterTemp: '96°C',
        grindSize: 'Medium-Fine',
        totalTime: '3:45',
        steps: [
          { name: 'Bloom', water: '30ml', waitUntil: '0:40', notes: 'Saturate.' },
          { name: 'First Pour', water: '112ml', waitUntil: '1:57', notes: '' },
          { name: 'Final Pour', water: '113ml', waitUntil: '3:45', notes: '' },
        ],
        tips: 'Washed process gives a clean cup.',
      },
    },
    { id: '1711950000001-fghij', savedAt: 'not a date', name: 'Mystery', origin: 'Atlantis' },
    { id: '1711950000000-abcde', name: 'Duplicate of the first' },
  ]
  const storage = (raw: string | null) => ({ getItem: (k: string) => (k === LEGACY_KEY ? raw : null) })

  it('maps every entry to a bean and a brew, keeps the photo and the original guide', async () => {
    const res = await migrateLegacy(storage(JSON.stringify(entries)), db, new Date('2026-10-27T00:00:00Z'))
    expect(res).toEqual({ alreadyDone: false, migrated: 2, skipped: 1, failed: 0 })
    const journal = await listJournal()
    expect(journal).toHaveLength(2)
    const hambela = journal.find((e) => e.bean.name === 'Hambela Alaka')!
    expect(hambela.bean).toMatchObject({
      originCountry: 'ET',
      originRaw: 'Ethiopia',
      region: 'Guji',
      process: 'washed',
      roastLevel: 'light',
      labelNotes: ['jasmine', 'bergamot'],
      varieties: ['Heirloom'],
      altitude: { minM: 1950, maxM: 2200 },
      source: 'legacy',
      legacyId: '1711950000000-abcde',
    })
    expect(hambela.bean.photoIds).toHaveLength(1)
    expect(hambela.brew.createdAt).toBe('2026-04-01T09:30:00.000Z')
    expect(hambela.brew.recipe).toMatchObject({
      source: 'legacy',
      doseG: 15,
      waterG: 255,
      ratio: 17,
      tempC: 96,
      grind: 'medium-fine',
      totalTimeS: 225,
      bloomS: 40,
    })
    expect(hambela.brew.recipe.steps.map((s) => s.targetG)).toEqual([30, 142, 255])
    expect(hambela.brew.recipe.legacyGuide).toMatchObject({ coffeeAmount: '15g' })
    const mystery = journal.find((e) => e.bean.name === 'Mystery')!
    expect(mystery.bean.originCountry).toBeNull()
    expect(mystery.brew.createdAt).toBe('2026-10-27T00:00:00.000Z')
  })

  it('backs up the raw journal first and leaves the old key untouched', async () => {
    const raw = JSON.stringify(entries)
    const s = storage(raw)
    await migrateLegacy(s, db)
    expect((await legacyBackup())?.raw).toBe(raw)
    expect(s.getItem(LEGACY_KEY)).toBe(raw)
  })

  it('runs only once', async () => {
    await migrateLegacy(storage(JSON.stringify(entries)), db)
    expect(await migrateLegacy(storage(JSON.stringify(entries)), db)).toMatchObject({ alreadyDone: true })
    expect(await db.beans.count()).toBe(2)
  })

  it('never duplicates entries when two launches migrate at once', async () => {
    const raw = JSON.stringify(entries)
    const [a, b] = await Promise.all([migrateLegacy(storage(raw), db), migrateLegacy(storage(raw), db)])
    expect(a.migrated + b.migrated).toBe(2)
    expect(a.skipped + b.skipped).toBe(4) // the fixture holds one duplicate; the second run skips all three
    expect(await db.beans.count()).toBe(2)
    expect(await db.brews.count()).toBe(2)
  })

  it('copes with no journal, damaged JSON and storage that throws', async () => {
    expect(await migrateLegacy(storage(null), db)).toEqual({ alreadyDone: false, migrated: 0, skipped: 0, failed: 0 })
    expect(readLegacy(storage('{bad json'))?.entries).toEqual([])
    expect(readLegacy(storage('{"not":"array"}'))?.entries).toEqual([])
    expect(
      readLegacy({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBeNull()
    expect(readLegacy(null)).toBeNull()
  })

  it('retries next launch when an entry fails', async () => {
    const bad = [{ id: 'x', name: 'Broken', brewGuide: { steps: 'not a list' } }]
    const res = await migrateLegacy(storage(JSON.stringify(bad)), db)
    expect(res.failed).toBe(1)
    expect(await db.meta.get('legacyMigration')).toBeUndefined()
    expect(await db.meta.get(BACKUP_META)).toBeDefined()
  })

  it('handles missing guides and bad data URLs', () => {
    expect(legacyRecipe(null)).toMatchObject({ doseG: 15, ratio: 16, waterG: 240, steps: [] })
    expect(dataUrlToPhoto('not a data url')).toBeNull()
    expect(dataUrlToPhoto('data:image/png,plain')).toBeNull()
    expect(dataUrlToPhoto('data:;base64,%%%')).toBeNull()
    expect(dataUrlToPhoto(tinyJpeg)?.type).toBe('image/jpeg')
  })
})

describe('export and import (JRN-04)', () => {
  it('round-trips beans, brews and photos without loss', async () => {
    await scannedWithBrew({ bean: { source: 'scan', name: 'Hambela Alaka', originCountry: 'ET' }, recipe, photo })
    const file = await exportAll({ includePhotos: true })
    expect(file.photos).toHaveLength(1)
    const json = JSON.parse(JSON.stringify(file))

    const other = new BrewMapDB(`test-${newId()}`)
    const res = await importAll(json, other)
    expect(res).toEqual({ beans: 1, brews: 1, photos: 1 })
    expect(await other.beans.toArray()).toEqual(await db.beans.toArray())
    expect(await other.brews.toArray()).toEqual(await db.brews.toArray())
    const p = (await other.photos.toArray())[0]
    expect(new Uint8Array(p.bytes)).toEqual(new Uint8Array([1, 2, 3]))
    await importAll(json, other) // merging the same file twice adds nothing
    expect(await other.beans.count()).toBe(1)
    await other.delete()
  })

  it('exports without photos by default and refuses other files', async () => {
    expect((await exportAll()).photos).toEqual([])
    await expect(importAll({ format: 'something-else' })).rejects.toThrow(/not a BrewMap export/)
  })

  it('writes brews as CSV', async () => {
    const { bean } = await scannedWithBrew({
      bean: { source: 'scan', name: 'Hambela, "Alaka"', originCountry: 'ET', process: 'washed', roastLevel: 'light' },
      recipe,
    })
    await addBrew({ beanId: bean.id, recipe, rating: 4, notes: 'Bright' })
    const csv = (await brewsCsv()).split('\n')
    expect(csv[0]).toBe('date,coffee,origin,process,roast,dose_g,water_g,ratio,temp_c,grind,total_time,rating,notes')
    expect(csv[1]).toContain('"Hambela, ""Alaka""",Ethiopia,Washed,Light,15,240,1:16,94,Medium-fine,3:10,,')
    expect(csv[2]).toMatch(/,4,Bright$/)
  })
})

describe('storage manager', () => {
  it('asks for persistent storage once', async () => {
    expect(await requestPersistence({ persisted: async () => true, persist: async () => false })).toBe(true)
    expect(await requestPersistence({ persisted: async () => false, persist: async () => true })).toBe(true)
    expect(await requestPersistence(null)).toBe(false)
    expect(
      await requestPersistence({
        persist: async () => {
          throw new Error('no')
        },
      }),
    ).toBe(false)
  })

  it('reports how full storage is', async () => {
    expect(await estimateUsage({ estimate: async () => ({ usage: 85, quota: 100 }) })).toEqual({ usage: 85, quota: 100, ratio: 0.85, nearlyFull: true })
    expect(await estimateUsage({ estimate: async () => ({}) })).toMatchObject({ ratio: 0, nearlyFull: false })
    expect(await estimateUsage(null)).toBeNull()
    expect(
      await estimateUsage({
        estimate: async () => {
          throw new Error('x')
        },
      }),
    ).toBeNull()
  })
})

describe('schema v2 upgrade (DR-04)', () => {
  it('fills the new brew fields on records saved by v1', async () => {
    const name = `upgrade-${newId()}`
    const { default: Dexie } = await import('dexie')
    const v1 = new Dexie(name)
    v1.version(1).stores({
      beans: 'id, createdAt, originCountry, status, legacyId',
      brews: 'id, beanId, createdAt, legacyId',
      photos: 'id, beanId',
      meta: 'key',
    })
    await v1.table('brews').add({
      id: 'old',
      beanId: 'b',
      createdAt: '2026-10-01T08:00:00.000Z',
      method: 'v60',
      recipe,
      guided: false,
      rating: 3,
      balance: null,
      descriptors: [],
      notes: '',
      grindSetting: null,
      legacyId: null,
    })
    v1.close()
    const v2 = new BrewMapDB(name)
    expect(await v2.brews.get('old')).toMatchObject({ actualTimeS: null, advice: null, appliedFrom: null, rating: 3 })
    await v2.delete()
  })
})
