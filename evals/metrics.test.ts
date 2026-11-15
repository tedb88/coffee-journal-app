import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { baselineRecipe } from '../src/domain/recipe/engine.js'
import { BeanAttributesSchema } from '../src/domain/schemas.js'
import type { ScanResult } from '../src/domain/scan.js'
import {
  compareField,
  fuzzyEqual,
  GoldenSetSchema,
  LabelCaseSchema,
  scoreLabel,
  scoreRecipe,
  summariseLabels,
  summariseRecipes,
  type LabelCase,
} from './metrics.js'

const golden = GoldenSetSchema.parse(JSON.parse(readFileSync(join(__dirname, 'recipes', 'golden.json'), 'utf8')))

describe('recipe golden set (AIG-01)', () => {
  it('has 50 well-formed cases with sensible ranges', () => {
    expect(golden.cases).toHaveLength(50)
    expect(new Set(golden.cases.map((c) => c.id)).size).toBe(50)
    for (const c of golden.cases) {
      for (const k of ['tempC', 'ratio', 'totalTimeS', 'bloomS', 'pours'] as const) expect(c.expect[k][0]).toBeLessThanOrEqual(c.expect[k][1])
    }
  })

  it('is met by the rules engine: every recipe valid (R0 exit) and ≥ 95% in range', () => {
    const today = new Date(`${golden.today}T03:00:00Z`)
    const scores = golden.cases.map((c) =>
      scoreRecipe(c, baselineRecipe({ bean: BeanAttributesSchema.parse(c.input.bean), doseG: c.input.doseG, preferences: c.input.preferences, today })),
    )
    const sum = summariseRecipes(scores)
    expect(sum.valid).toBe(1)
    expect(sum.inRange).toBeGreaterThanOrEqual(0.95)
  })

  it('reports each parameter outside its range', () => {
    const c = golden.cases[0]
    const r = baselineRecipe({ bean: BeanAttributesSchema.parse(c.input.bean), doseG: 15, today: new Date('2026-10-20') })
    const s = scoreRecipe(c, { ...r, tempC: 80, grind: 'coarse' })
    expect(s.valid).toBe(false)
    expect(s.outOfRange.join(' ')).toMatch(/tempC 80/)
    expect(s.outOfRange.join(' ')).toMatch(/grind coarse/)
  })
})

describe('label metrics', () => {
  it('fuzzy-matches names', () => {
    expect(fuzzyEqual('Fineprint Coffee Roasters', 'FINEPRINT')).toBe(true)
    expect(fuzzyEqual('Café Granja La Esperanza', 'cafe granja la esperanza')).toBe(true)
    expect(fuzzyEqual('Guji Hambela', 'Yirgacheffe Konga')).toBe(false)
  })

  it('separates correct, wrong, missed, fabricated and empty', () => {
    expect(compareField('originCountry', 'ET', 'ET')).toBe('correct')
    expect(compareField('originCountry', 'KE', 'ET')).toBe('wrong')
    expect(compareField('roastDate', null, '2026-10-14')).toBe('missed')
    expect(compareField('roastLevel', 'light', null)).toBe('fabricated')
    expect(compareField('labelNotes', [], [])).toBe('empty')
    expect(compareField('altitude', { minM: 1900, maxM: 2150 }, { minM: 1900, maxM: 2200 })).toBe('correct')
    expect(compareField('varieties', ['74110'], ['74110', '74112'])).toBe('correct')
    expect(compareField('netWeightG', 250, 200)).toBe('wrong')
  })

  const truth: LabelCase = LabelCaseSchema.parse(JSON.parse(readFileSync(join(__dirname, 'labels', 'ground-truth.template.json'), 'utf8'))[0])
  const scan = (over: Partial<ScanResult['fields']> = {}): ScanResult => ({
    fields: {
      ...truth.truth,
      originName: null,
      originRaw: null,
      process: 'washed',
      roastLevel: 'light',
      name: 'Guji Hambela',
      ...over,
    } as ScanResult['fields'],
    confidence: {},
    flags: {},
    roastDateReading: null,
    labelLanguage: 'zh',
    originalName: null,
    meta: { model: 'm', promptVersion: 'scan.v1' },
  })

  it('summarises a run against the thresholds', () => {
    const perfect = summariseLabels([scoreLabel(truth, scan(), 1200, 0.001)])
    expect(perfect).toMatchObject({ coreAccuracy: 1, fabricationRate: 0, roastDateAccuracy: 1, schemaValid: 1, passed: true })

    const fabricated = summariseLabels([scoreLabel(truth, scan({ producer: 'Invented Farm' }), 1200, 0.001)])
    expect(fabricated.fabricationRate).toBe(1)
    expect(fabricated.gates.fabrication).toBe(false)
    expect(fabricated.passed).toBe(false)

    const failed = summariseLabels([scoreLabel(truth, scan(), 1000, 0), scoreLabel(truth, null, 9000, 0, 'timeout')])
    expect(failed.schemaValid).toBe(0.5)
    expect(failed.latencyP90Ms).toBe(9000)
    expect(failed.passed).toBe(false)
  })
})
