import { BeanSchema, BrewSchema, type Bean, type Brew } from '../domain/schemas.js'
import { getDb, guardQuota, newId, type BrewMapDB, type PhotoRecord } from './db.js'

export type BeanDraft = Omit<Partial<Bean>, 'id' | 'createdAt' | 'updatedAt'> & Pick<Bean, 'source'>

export interface PhotoInput {
  bytes: ArrayBuffer
  type: string
}

export interface JournalEntry {
  brew: Brew
  bean: Bean
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function createBean(draft: BeanDraft, db: BrewMapDB = getDb()): Promise<Bean> {
  const at = nowIso()
  const bean = BeanSchema.parse({ ...draft, id: newId(), createdAt: at, updatedAt: at })
  await guardQuota(() => db.beans.add(bean))
  return bean
}

export async function updateBean(id: string, patch: Partial<Bean>, db: BrewMapDB = getDb()): Promise<Bean> {
  const current = await db.beans.get(id)
  if (!current) throw new Error(`No bean with id ${id}`)
  const next = BeanSchema.parse({ ...current, ...patch, id, updatedAt: nowIso() })
  await guardQuota(() => db.beans.put(next))
  return next
}

export function getBean(id: string, db: BrewMapDB = getDb()): Promise<Bean | undefined> {
  return db.beans.get(id)
}

export function listBeans(db: BrewMapDB = getDb()): Promise<Bean[]> {
  return db.beans.orderBy('createdAt').reverse().toArray()
}

export async function addBrew(
  input: Pick<Brew, 'beanId' | 'recipe'> & Partial<Omit<Brew, 'id' | 'beanId' | 'recipe'>>,
  db: BrewMapDB = getDb(),
): Promise<Brew> {
  const brew = BrewSchema.parse({ method: 'v60', createdAt: nowIso(), ...input, id: newId() })
  await guardQuota(() =>
    db.transaction('rw', db.brews, db.beans, async () => {
      await db.brews.add(brew)
      const bean = await db.beans.get(brew.beanId)
      if (!bean) throw new Error(`No bean with id ${brew.beanId}`)
      if (bean.remainingG !== null) {
        await db.beans.put({ ...bean, remainingG: Math.max(0, bean.remainingG - brew.recipe.doseG), updatedAt: nowIso() })
      }
    }),
  )
  return brew
}

export async function savePhoto(beanId: string | null, photo: PhotoInput, db: BrewMapDB = getDb()): Promise<PhotoRecord> {
  const record: PhotoRecord = { id: newId(), beanId, type: photo.type, bytes: photo.bytes, createdAt: nowIso() }
  await guardQuota(() => db.photos.add(record))
  return record
}

export function getPhoto(id: string, db: BrewMapDB = getDb()): Promise<PhotoRecord | undefined> {
  return db.photos.get(id)
}

/** Save a bag and its photo before its first brew (Check the label → recipe, or "Save for later"). */
export async function saveBean(input: { bean: BeanDraft; photo?: PhotoInput | null }, db: BrewMapDB = getDb()): Promise<Bean> {
  const bean = await createBean(input.bean, db)
  if (!input.photo) return bean
  const photo = await savePhoto(bean.id, input.photo, db)
  return updateBean(bean.id, { photoIds: [photo.id] }, db)
}

export function listBrewsForBean(beanId: string, db: BrewMapDB = getDb()): Promise<Brew[]> {
  return db.brews.where('beanId').equals(beanId).sortBy('createdAt')
}

export function getBrew(id: string, db: BrewMapDB = getDb()): Promise<Brew | undefined> {
  return db.brews.get(id)
}

/** LOG-05: edit a logged brew. The recipe snapshot and links stay as they were (RCP-09). */
export async function updateBrew(
  id: string,
  patch: Partial<Pick<Brew, 'rating' | 'balance' | 'descriptors' | 'notes' | 'grindSetting' | 'actualTimeS' | 'advice'>>,
  db: BrewMapDB = getDb(),
): Promise<Brew> {
  const current = await db.brews.get(id)
  if (!current) throw new Error(`No brew with id ${id}`)
  const next = BrewSchema.parse({ ...current, ...patch, id })
  await guardQuota(() => db.brews.put(next))
  return next
}

/** Everything a delete removed, so Undo can put it back (LOG-05). */
export interface Snapshot {
  beans: Bean[]
  brews: Brew[]
  photos: PhotoRecord[]
}

export async function restore(snapshot: Snapshot, db: BrewMapDB = getDb()): Promise<void> {
  await guardQuota(() =>
    db.transaction('rw', db.beans, db.brews, db.photos, async () => {
      await db.beans.bulkPut(snapshot.beans)
      await db.brews.bulkPut(snapshot.brews)
      await db.photos.bulkPut(snapshot.photos)
    }),
  )
}

/** Every brew with its bean, newest first (the Journal and Map). */
export async function listJournal(db: BrewMapDB = getDb()): Promise<JournalEntry[]> {
  const [brews, beans] = await Promise.all([db.brews.orderBy('createdAt').reverse().toArray(), db.beans.toArray()])
  const byId = new Map(beans.map((b) => [b.id, b]))
  return brews.flatMap((brew) => {
    const bean = byId.get(brew.beanId)
    return bean ? [{ brew, bean }] : []
  })
}

/**
 * Delete a brew the user chose to delete (DR-05: only on their action). The
 * bag stays, and the brew's dose goes back into it.
 */
export async function deleteBrew(id: string, db: BrewMapDB = getDb()): Promise<Snapshot> {
  return db.transaction('rw', db.brews, db.beans, async () => {
    const brew = await db.brews.get(id)
    if (!brew) return { beans: [], brews: [], photos: [] }
    const bean = await db.beans.get(brew.beanId)
    await db.brews.delete(id)
    if (bean && bean.remainingG !== null) {
      const back = bean.remainingG + brew.recipe.doseG
      await db.beans.put({ ...bean, remainingG: bean.netWeightG ? Math.min(bean.netWeightG, back) : back, updatedAt: nowIso() })
    }
    return { beans: bean ? [bean] : [], brews: [brew], photos: [] }
  })
}

/** Delete a bag with its brews and photos (DR-05: only on the user's action). */
export async function deleteBean(id: string, db: BrewMapDB = getDb()): Promise<Snapshot> {
  return db.transaction('rw', db.beans, db.brews, db.photos, async () => {
    const bean = await db.beans.get(id)
    const brews = await db.brews.where('beanId').equals(id).toArray()
    const photos = await db.photos.where('beanId').equals(id).toArray()
    await db.brews.where('beanId').equals(id).delete()
    await db.photos.where('beanId').equals(id).delete()
    await db.beans.delete(id)
    return { beans: bean ? [bean] : [], brews, photos }
  })
}
