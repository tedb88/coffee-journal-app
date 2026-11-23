import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { normaliseScan, parseWeightG, ScanModelOutputSchema, type ScanModelOutput } from './scan.js'

const TODAY = new Date('2026-10-20T03:00:00Z')
const META = { model: 'm', promptVersion: 'scan.v1' }

const output = (over: Partial<ScanModelOutput> = {}): ScanModelOutput =>
  ScanModelOutputSchema.parse({
    fields: { name: 'Guji Hambela', roaster: 'Fineprint', origin: 'Ethiopia, Guji', roastDate: '14.10.26', netWeight: '200g', altitude: '2,100 masl' },
    confidence: { name: 'high' },
    evidence: { name: 'GUJI HAMBELA', roaster: 'FINEPRINT', origin: 'ETHIOPIA GUJI', roastDate: '14.10.26', netWeight: '200g', altitude: '2,100 MASL' },
    ...over,
  })

describe('normaliseScan (AI-01)', () => {
  it('normalises a clean reading without flags', () => {
    const r = normaliseScan(output(), TODAY, META)
    expect(r.fields).toMatchObject({
      originCountry: 'ET',
      originName: 'Ethiopia',
      roastDate: '2026-10-14',
      netWeightG: 200,
      altitude: { minM: 2100, maxM: 2100 },
    })
    expect(r.flags).toEqual({})
    expect(r.meta).toEqual(META)
  })

  it('flags values that have no quoted label text (fabrication gate)', () => {
    const r = normaliseScan(output({ evidence: { name: 'GUJI HAMBELA' } }), TODAY, META)
    for (const k of ['roaster', 'origin', 'roastDate', 'altitude', 'netWeight'] as const) {
      expect(r.confidence[k]).toBe('low')
      expect(r.flags[k]).toMatch(/Not clearly printed/)
    }
    expect(r.flags.name).toBeUndefined()
  })

  it('flags an origin it cannot match to a country', () => {
    const r = normaliseScan(output({ fields: { origin: 'Atlantis Highlands' }, evidence: { origin: 'ATLANTIS' } }), TODAY, META)
    expect(r.fields.originCountry).toBeNull()
    expect(r.fields.originRaw).toBe('Atlantis Highlands')
    expect(r.flags.origin).toMatch(/Could not match "Atlantis Highlands"/)
  })

  it('flags an unreadable or implausible roast date', () => {
    const r = normaliseScan(output({ fields: { roastDate: 'best before 2028' }, evidence: { roastDate: 'best before 2028' } }), TODAY, META)
    expect(r.fields.roastDate).toBeNull()
    expect(r.flags.roastDate).toMatch(/Could not read/)
  })

  it('explains how an ambiguous date was read', () => {
    const r = normaliseScan(output({ fields: { roastDate: '05/10/26' }, evidence: { roastDate: '05/10/26' } }), TODAY, META)
    expect(r.fields.roastDate).toBe('2026-10-05')
    expect(r.confidence.roastDate).toBe('medium')
    expect(r.flags.roastDate).toBe('Printed 05/10/26. Read day-first as 5 October 2026.')
  })

  it('gives every low-confidence field a reason to check it', () => {
    const r = normaliseScan(output({ fields: { process: 'Washed' }, confidence: { process: 'low' }, evidence: {} }), TODAY, META)
    expect(r.fields.process).toBe('washed')
    expect(r.flags.process).toMatch(/hard to read/)
  })

  it('accepts lists or strings, and copes with missing parts', () => {
    const r = normaliseScan(
      ScanModelOutputSchema.parse({
        fields: { tastingNotes: 'Jasmine / Peach, jasmine', varieties: 'Heirloom & 74110', roastLevel: 'Medium Light', name: 42 },
      }),
      TODAY,
      { model: null, promptVersion: null },
    )
    expect(r.fields.labelNotes).toEqual(['jasmine', 'peach'])
    expect(r.fields.varieties).toEqual(['Heirloom', '74110'])
    expect(r.fields.roastLevel).toBe('medium-light')
    expect(r.fields.name).toBe('42')
    expect(r.labelLanguage).toBeNull()
  })

  it('tolerates junk confidence values from the model', () => {
    const parsed = ScanModelOutputSchema.parse({ fields: {}, confidence: { name: 'very sure' } })
    expect(parsed.confidence.name).toBe('low')
  })
})

describe('normaliseScan with untranslated Chinese and Japanese labels (AI-01, CAP-04)', () => {
  const NOV = new Date('2026-11-23T03:00:00Z')
  const cjk = (fields: Record<string, string>) => ScanModelOutputSchema.parse({ fields, evidence: { ...fields } })

  it('reads a Traditional Chinese origin and roast date without flagging them', () => {
    const r = normaliseScan(cjk({ origin: '哥倫比亞', roastDate: '2026年11月10日', process: '水洗', roastLevel: '淺焙' }), NOV, META)
    expect(r.fields).toMatchObject({
      originCountry: 'CO',
      originName: 'Colombia',
      originRaw: '哥倫比亞',
      roastDate: '2026-11-10',
      process: 'washed',
      roastLevel: 'light',
    })
    expect(r.roastDateReading).toEqual({ iso: '2026-11-10', reading: 'cjk', ambiguous: false })
    expect(r.flags.origin).toBeUndefined()
    expect(r.flags.roastDate).toBeUndefined()
    expect(r.confidence.origin).toBeUndefined()
    expect(r.confidence.roastDate).toBeUndefined()
  })

  it('reads a Japanese origin and era date without flagging them', () => {
    const r = normaliseScan(
      cjk({ origin: 'エチオピア・イルガチェフェ', roastDate: '令和8年11月10日', process: 'ナチュラル', roastLevel: '中浅煎り' }),
      NOV,
      META,
    )
    expect(r.fields).toMatchObject({ originCountry: 'ET', roastDate: '2026-11-10', process: 'natural', roastLevel: 'medium-light' })
    expect(r.flags).toEqual({})
  })

  it('still flags a date without a year instead of guessing it', () => {
    const r = normaliseScan(cjk({ origin: '肯亞', roastDate: '11月10日' }), NOV, META)
    expect(r.fields.originCountry).toBe('KE')
    expect(r.fields.roastDate).toBeNull()
    expect(r.flags.roastDate).toMatch(/Could not read "11月10日"/)
  })

  it('still flags an untranslated value that has no quoted label text (fabrication gate)', () => {
    const r = normaliseScan(ScanModelOutputSchema.parse({ fields: { origin: '哥倫比亞' }, evidence: {} }), NOV, META)
    expect(r.confidence.origin).toBe('low')
    expect(r.flags.origin).toMatch(/Not clearly printed/)
  })

  // AI-01: a field not printed on the label stays empty. The normaliser only reads text the model
  // returned; it must never turn an empty field into a value, in any language.
  it('never fills a field the model left empty', () => {
    const value = fc.oneof(
      fc.constantFrom('哥倫比亞', 'エチオピア', 'Kenya AA', '2026年11月10日', '令和8年11月10日', '11月10日', '水洗', '淺焙', '200g', '1,900 m'),
      fc.string(),
    )
    const keys = ['name', 'roaster', 'origin', 'region', 'producer', 'process', 'roastLevel', 'altitude', 'roastDate', 'netWeight'] as const
    const mapped: Record<(typeof keys)[number], (r: ReturnType<typeof normaliseScan>['fields']) => unknown[]> = {
      name: (f) => [f.name],
      roaster: (f) => [f.roaster],
      origin: (f) => [f.originCountry, f.originName, f.originRaw],
      region: (f) => [f.region],
      producer: (f) => [f.producer],
      process: (f) => [f.process],
      roastLevel: (f) => [f.roastLevel],
      altitude: (f) => [f.altitude],
      roastDate: (f) => [f.roastDate],
      netWeight: (f) => [f.netWeightG],
    }
    fc.assert(
      fc.property(
        fc.record(Object.fromEntries(keys.map((k) => [k, fc.option(value, { nil: null })])) as Record<(typeof keys)[number], fc.Arbitrary<string | null>>),
        (fields) => {
          const r = normaliseScan(ScanModelOutputSchema.parse({ fields, evidence: { ...fields } }), NOV, META)
          return keys.filter((k) => fields[k] === null).every((k) => mapped[k](r.fields).every((v) => v === null))
        },
      ),
      { numRuns: 2_000 },
    )
  })
})

describe('parseWeightG', () => {
  it.each([
    ['200g', 200],
    ['250 grams', 250],
    ['1 kg', 1000],
    ['12 oz', 340],
    ['1 lb', 454],
    ['0,25 kg', 250],
    ['5 g', null],
    ['heavy', null],
    [null, null],
  ])('%s → %s', (raw, g) => expect(parseWeightG(raw)).toBe(g))
})
