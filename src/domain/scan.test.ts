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
