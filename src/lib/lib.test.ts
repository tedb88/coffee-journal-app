import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { baselineRecipe } from '../domain/recipe/engine.js'
import { isValidRecipe } from '../domain/recipe/validate.js'
import type { ScanResult } from '../domain/scan.js'
import type { JournalEntry } from '../data/repositories.js'
import { getRecipe, scanLabel } from './api.js'
import { EMPTY_FORM, attributesFromForm, beanDraftFromForm, correctedFields, formFromScan } from './beanForm.js'
import { deviceId, resetDeviceId, DEVICE_KEY } from './device.js'
import { entryView, matchesSearch, pinsByCountry } from './journal.js'

const TODAY = new Date('2026-10-20T03:00:00Z')

const SCAN: ScanResult = {
  fields: {
    name: 'Guji Hambela',
    roaster: 'Fineprint',
    originCountry: 'ET',
    originName: 'Ethiopia',
    originRaw: 'Ethiopia, Guji',
    region: 'Guji',
    producer: null,
    varieties: ['74110', 'Heirloom'],
    process: 'washed',
    roastLevel: 'light',
    altitude: { minM: 1900, maxM: 2100 },
    labelNotes: ['jasmine', 'peach'],
    roastDate: '2026-10-14',
    netWeightG: 200,
  },
  confidence: { name: 'high', roastDate: 'medium' },
  flags: { roastDate: 'Printed 14.10.26. Read day-first as 14 October 2026.' },
  roastDateReading: { iso: '2026-10-14', reading: 'day-first', ambiguous: false },
  labelLanguage: 'ja',
  originalName: 'グジ',
  meta: { model: 'Qwen/Qwen2.5-VL-72B-Instruct', promptVersion: 'scan.v1' },
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>
function fakeFetch(handler: Handler) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return handler(String(url), init ?? {})
  }) as typeof fetch
  return { f, calls }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const noToken = async () => undefined

describe('scanLabel', () => {
  it('returns the scan and sends the device id and bot token', async () => {
    const { f, calls } = fakeFetch(() => json(SCAN))
    const res = await scanLabel({ base64: 'AAAA', mimeType: 'image/jpeg' }, { fetch: f, token: async () => 'tok' })
    expect(res).toEqual({ ok: true, scan: SCAN })
    const h = calls[0].init.headers as Record<string, string>
    expect(h['X-Turnstile-Token']).toBe('tok')
    expect(h['X-Device-Id']).toBeTruthy()
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ imageBase64: 'AAAA', mimeType: 'image/jpeg' })
  })

  it('passes on the server message and offers manual entry', async () => {
    const { f } = fakeFetch(() => json({ error: 'Label reading is not available right now.', manual: true }, 503))
    expect(await scanLabel({ base64: 'A', mimeType: 'image/jpeg' }, { fetch: f, token: noToken })).toEqual({
      ok: false,
      manual: true,
      message: 'Label reading is not available right now.',
    })
  })

  it('handles offline and unreadable replies', async () => {
    const offline = fakeFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(await scanLabel({ base64: 'A', mimeType: 'image/jpeg' }, { fetch: offline.f, token: noToken })).toMatchObject({ ok: false, manual: true })
    const html = fakeFetch(() => new Response('<html>', { status: 500 }))
    expect(await scanLabel({ base64: 'A', mimeType: 'image/jpeg' }, { fetch: html.f, token: noToken })).toMatchObject({ ok: false, manual: true })
  })
})

describe('getRecipe (RCP-06)', () => {
  const req = { bean: attributesFromForm(formFromScan(SCAN), TODAY), doseG: 15, preferences: null }

  it('uses a valid server recipe', async () => {
    const server = { ...baselineRecipe({ ...req, today: TODAY }), source: 'ai' as const }
    const { f } = fakeFetch(() => json({ recipe: server, fallback: false }))
    const res = await getRecipe(req, { fetch: f, token: noToken, today: TODAY })
    expect(res).toMatchObject({ fallback: false, reason: null, recipe: { source: 'ai' } })
  })

  it('falls back on the device when offline, on errors and on an invalid recipe', async () => {
    const offline = fakeFetch(() => {
      throw new TypeError('offline')
    })
    const a = await getRecipe(req, { fetch: offline.f, token: noToken, today: TODAY })
    expect(a).toMatchObject({ fallback: true, reason: 'offline', recipe: { source: 'rules' } })
    expect(isValidRecipe(a.recipe)).toBe(true)

    const down = fakeFetch(() => json({ error: 'x' }, 500))
    expect(await getRecipe(req, { fetch: down.f, token: noToken, today: TODAY })).toMatchObject({ fallback: true, reason: 'http-500' })

    const bad = { ...baselineRecipe({ ...req, today: TODAY }), waterG: 9999 }
    const tampered = fakeFetch(() => json({ recipe: bad, fallback: false }))
    const c = await getRecipe(req, { fetch: tampered.f, token: noToken, today: TODAY })
    expect(c).toMatchObject({ fallback: true, reason: 'invalid' })
    expect(c.recipe.waterG).not.toBe(9999)
  })

  it('reports a server-side fallback reason', async () => {
    const { f } = fakeFetch(() => json({ recipe: baselineRecipe({ ...req, today: TODAY }), fallback: true, reason: 'cap' }))
    expect(await getRecipe(req, { fetch: f, token: noToken, today: TODAY })).toMatchObject({ fallback: true, reason: 'cap' })
  })
})

describe('bean form (CAP-03, CAP-06)', () => {
  it('round-trips a scan', () => {
    const form = formFromScan(SCAN)
    expect(form).toMatchObject({
      name: 'Guji Hambela',
      originCountry: 'ET',
      process: 'washed',
      roastDate: '2026-10-14',
      varieties: '74110, Heirloom',
      altitude: '1900–2100 m',
      netWeightG: '200',
    })
    expect(attributesFromForm(form, TODAY)).toMatchObject({ originCountry: 'ET', altitude: { minM: 1900, maxM: 2100 }, labelNotes: ['jasmine', 'peach'] })
    expect(correctedFields(form, SCAN)).toEqual([])
  })

  it('records the fields the user corrected', () => {
    const form = { ...formFromScan(SCAN), roastDate: '2026-10-12', roaster: 'Fineprint Coffee' }
    const draft = beanDraftFromForm(form, SCAN, TODAY)
    expect(draft.extraction?.userCorrected).toEqual(['roaster', 'roastDate'])
    expect(draft).toMatchObject({ source: 'scan', netWeightG: 200, remainingG: 200, roastDate: '2026-10-12' })
  })

  it('turns bad manual input into nulls, not guesses', () => {
    const form = {
      ...EMPTY_FORM,
      name: '  ',
      originCountry: 'Narnia',
      process: 'magic' as never,
      roastDate: '2019-01-01',
      netWeightG: 'lots',
      altitude: 'high',
    }
    const draft = beanDraftFromForm(form, null, TODAY)
    expect(draft).toMatchObject({
      name: 'Unnamed coffee',
      originCountry: null,
      originRaw: 'Narnia',
      process: null,
      roastDate: null,
      netWeightG: null,
      altitude: null,
      source: 'manual',
      extraction: null,
    })
  })

  it('accepts a typed country name', () => {
    expect(attributesFromForm({ ...EMPTY_FORM, originCountry: 'Kenya AA' }, TODAY).originCountry).toBe('KE')
  })
})

describe('journal read models', () => {
  const entry = (id: string, beanId: string, over: Partial<JournalEntry['bean']> = {}): JournalEntry => {
    const bean = {
      ...beanDraftFromForm(formFromScan(SCAN), SCAN, TODAY),
      id: beanId,
      createdAt: TODAY.toISOString(),
      updatedAt: TODAY.toISOString(),
      photoIds: [],
      status: 'active',
      legacyId: null,
      ...over,
    } as JournalEntry['bean']
    const recipe = baselineRecipe({ bean, doseG: 15, today: TODAY })
    return {
      bean,
      brew: {
        id,
        beanId,
        createdAt: TODAY.toISOString(),
        method: 'v60',
        recipe,
        guided: false,
        rating: null,
        balance: null,
        descriptors: [],
        notes: '',
        grindSetting: null,
        actualTimeS: null,
        advice: null,
        appliedFrom: null,
        legacyId: null,
      },
    }
  }

  it('builds the journal card view and searches it', () => {
    const v = entryView(entry('b1', 'x'))
    expect(v).toMatchObject({ id: 'b1', name: 'Guji Hambela', origin: 'Ethiopia · Guji', roastLevel: 'Light', process: 'Washed', aiRecipe: false })
    expect(v.guide.coffeeAmount).toBe('15 g')
    expect(matchesSearch(v, 'peach')).toBe(true)
    expect(matchesSearch(v, 'ethiopia')).toBe(true)
    expect(matchesSearch(v, 'kenya')).toBe(false)
  })

  it('groups bags into one pin per country and lists unmatched origins', () => {
    const list = [
      entry('1', 'a'),
      entry('2', 'a'),
      entry('3', 'b', { originCountry: 'KE', name: '<img src=x onerror=alert(1)>' }),
      entry('4', 'c', { originCountry: null, originRaw: 'Atlantis' }),
    ]
    const { pins, unmapped } = pinsByCountry(list)
    expect(pins.map((p) => [p.country.code, p.coffees.length])).toEqual([
      ['ET', 1],
      ['KE', 1],
    ])
    expect(pins[1].coffees[0].name).toBe('<img src=x onerror=alert(1)>')
    expect(unmapped).toEqual(['Atlantis'])
  })
})

describe('deviceId', () => {
  it('is created once and reused', () => {
    resetDeviceId()
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    const id = deviceId(storage)
    expect(store.get(DEVICE_KEY)).toBe(id)
    resetDeviceId()
    expect(deviceId(storage)).toBe(id)
    resetDeviceId()
  })
})

describe('startUp (JRN-05)', () => {
  it('moves the old journal once and reports it', async () => {
    const { startUp, resetStartUp } = await import('./startup.js')
    const { BrewMapDB, useDb } = await import('../data/db.js')
    const { listJournal } = await import('../data/repositories.js')
    const db = new BrewMapDB(`startup-${Math.random()}`)
    useDb(db)
    const legacy = JSON.stringify([
      {
        id: 'old-1',
        savedAt: '2026-01-02T03:04:05.000Z',
        name: 'Old Kenya',
        origin: 'Kenya',
        roastLevel: 'Light',
        process: 'Washed',
        tastingNotes: ['blackcurrant'],
      },
    ])
    const storage = { getItem: (k: string) => (k === 'brewmap_journal' ? legacy : null) } as Storage
    const [a, b] = await Promise.all([startUp(storage), startUp(storage)])
    expect(a).toBe(b)
    expect(a).toMatchObject({ migrated: 1, failed: 0, storageFull: false })
    resetStartUp()
    expect(await startUp(storage)).toMatchObject({ migrated: 0, failed: 0 })
    resetStartUp()
    const list = await listJournal(db)
    expect(list).toHaveLength(1)
    expect(list[0].bean).toMatchObject({ name: 'Old Kenya', originCountry: 'KE', source: 'legacy' })
    useDb(null)
  })
})

describe('display helpers', async () => {
  const { beanMeta, beanByline, remaining, recipeLine, whenText, parseMinutes, fullDate, freshnessStatus } = await import('./display.js')
  const bean = { originCountry: 'ET', originRaw: null, process: 'washed', roastLevel: 'light', roaster: 'Fernleaf Roasters', region: 'Guji' } as const
  const recipe = baselineRecipe({ bean: { originCountry: 'ET', process: 'washed', roastLevel: 'light', roastDate: null }, doseG: 15, today: TODAY })

  it('describes a bag in plain words', () => {
    expect(beanMeta(bean)).toBe('Ethiopia · Washed · Light')
    expect(beanByline(bean)).toBe('Fernleaf Roasters · Ethiopia, Guji')
    expect(beanMeta({ originCountry: null, originRaw: 'Atlantis', process: null, roastLevel: null })).toBe('Atlantis')
    expect(freshnessStatus({ roastDate: '2026-10-11', roastLevel: 'light' }, TODAY)).toMatchObject({ tone: 'positive', text: 'At its best · day 9' })
    expect(freshnessStatus({ roastDate: null, roastLevel: 'light' }, TODAY)).toBeNull()
  })

  it('says how much is left', () => {
    expect(remaining({ remainingG: 65, netWeightG: 250 }, 15, 3)).toEqual({ amount: '65 g', note: 'about 4 brews' })
    expect(remaining({ remainingG: 200, netWeightG: 200 }, 15, 0)).toEqual({ amount: '200 g', note: 'new' })
    expect(remaining({ remainingG: 10, netWeightG: 200 }, 15, 9).note).toBe('nearly empty')
    expect(remaining({ remainingG: null, netWeightG: null }, 15, 2)).toEqual({ amount: '—', note: '2 brews' })
  })

  it('summarises recipes, dates and times', () => {
    expect(recipeLine(recipe)).toMatch(/^15 g · \d+ g · \d+ °C · Medium-fine · \d:\d\d$/)
    expect(recipeLine(recipe, 22, 200)).toMatch(/22 clicks · 3:20$/)
    expect(recipeLine({ ...recipe, source: 'legacy', legacyGuide: { coffeeAmount: '15g', waterAmount: '240ml', waterTemp: '93°C', totalTime: '3:10' } })).toBe(
      '15g · 240ml · 93°C · 3:10',
    )
    const now = new Date(2026, 9, 23, 9, 0)
    expect(whenText(new Date(2026, 9, 23, 7, 58).toISOString(), now)).toBe('Today, 07:58')
    expect(whenText(new Date(2026, 9, 22, 18, 2).toISOString(), now)).toBe('Yesterday, 18:02')
    expect(whenText(new Date(2026, 9, 20, 7, 40).toISOString(), now)).toMatch(/^Tue 20 Oct, 07:40$/)
    expect(fullDate('2026-10-14')).toBe('14 Oct 2026')
    expect(parseMinutes('3:10')).toBe(190)
    expect(parseMinutes('190')).toBe(190)
    expect(parseMinutes('3:75')).toBeNull()
    expect(parseMinutes('soon')).toBeNull()
  })
})

describe('Today picks the bag to brew', async () => {
  const { pickNextBean, onShelf } = await import('./today.js')
  const mk = (id: string, over: Record<string, unknown> = {}) =>
    ({
      id,
      name: id,
      status: 'active',
      remainingG: 100,
      roastDate: null,
      roastLevel: 'light',
      createdAt: '2026-10-01T00:00:00.000Z',
      ...over,
    }) as unknown as JournalEntry['bean']
  const brewOf = (beanId: string, createdAt: string) => ({ beanId, createdAt }) as unknown as JournalEntry['brew']

  it('prefers a bag at its best, then the one brewed most recently', () => {
    const peak = mk('peak', { roastDate: '2026-10-13' })
    const resting = mk('resting', { roastDate: '2026-10-21' })
    const plain = mk('plain')
    expect(pickNextBean([resting, plain, peak], [], TODAY)?.id).toBe('peak')
    expect(pickNextBean([resting, plain], [], TODAY)?.id).toBe('plain')
    const a = mk('a')
    const b = mk('b')
    expect(pickNextBean([a, b], [brewOf('a', '2026-10-20T07:00:00.000Z'), brewOf('b', '2026-10-22T07:00:00.000Z')], TODAY)?.id).toBe('b')
  })

  it('leaves finished and empty bags off the shelf', () => {
    const list = [mk('done', { status: 'finished' }), mk('empty', { remainingG: 0 }), mk('unknown', { remainingG: null })]
    expect(onShelf(list).map((b) => b.id)).toEqual(['unknown'])
    expect(pickNextBean([mk('done', { status: 'finished' })], [], TODAY)).toBeNull()
  })
})

describe('editing a saved bag (LOG-05)', async () => {
  const { formFromBean, beanPatchFromForm } = await import('./beanForm.js')
  const saved = {
    ...beanDraftFromForm(formFromScan(SCAN), SCAN, TODAY),
    id: 'x',
    createdAt: TODAY.toISOString(),
    updatedAt: TODAY.toISOString(),
    photoIds: [],
    status: 'active',
    legacyId: null,
    remainingG: 170,
  } as unknown as JournalEntry['bean']

  it('fills the form from the bag and keeps what was used when the weight changes', () => {
    const form = formFromBean(saved)
    expect(form).toMatchObject({ name: 'Guji Hambela', originCountry: 'ET', netWeightG: '200', altitude: '1900–2100 m' })
    expect(beanPatchFromForm(form, saved, TODAY)).toMatchObject({ name: 'Guji Hambela', remainingG: 170 })
    expect(beanPatchFromForm({ ...form, netWeightG: '250' }, saved, TODAY)).toMatchObject({ netWeightG: 250, remainingG: 220 })
    const patch = beanPatchFromForm({ ...form, name: 'Guji Hambela Lot 2' }, saved, TODAY)
    expect(patch).not.toHaveProperty('source')
    expect(patch).not.toHaveProperty('extraction')
  })
})
