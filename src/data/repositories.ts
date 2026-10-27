import { BeanSchema, BrewSchema, type Bean, type Brew, type Recipe } from '../domain/schemas.js'
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

/** Save a scanned bag, its photo and its first brew in one go (the Scanner flow). */
export async function saveScannedBrew(input: { bean: BeanDraft; recipe: Recipe; photo?: PhotoInput | null }, db: BrewMapDB = getDb()): Promise<JournalEntry> {
  const bean = await createBean(input.bean, db)
  let saved = bean
  if (input.photo) {
    const photo = await savePhoto(bean.id, input.photo, db)
    saved = await updateBean(bean.id, { photoIds: [photo.id] }, db)
  }
  const brew = await addBrew({ beanId: bean.id, recipe: input.recipe }, db)
  return { bean: (await db.beans.get(bean.id)) ?? saved, brew }
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
 * Delete a brew the user chose to delete. A bean left with no brews goes with
 * it, with its photos, matching the journal's one-entry-per-scan behaviour.
 */
export async function deleteBrew(id: string, db: BrewMapDB = getDb()): Promise<void> {
  await db.transaction('rw', db.brews, db.beans, db.photos, async () => {
    const brew = await db.brews.get(id)
    if (!brew) return
    await db.brews.delete(id)
    const others = await db.brews.where('beanId').equals(brew.beanId).count()
    if (others === 0) {
      await db.photos.where('beanId').equals(brew.beanId).delete()
      await db.beans.delete(brew.beanId)
    }
  })
}
