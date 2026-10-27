import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { GRIND_SCALE, PROCESSES, ROAST_LEVELS } from '../enums.js'
import { ORIGIN_PROFILES, V60, describeRulesForPrompt } from '../rules/index.js'
import type { BeanAttributes, Recipe } from '../schemas.js'
import { applyAdjustment, AdjustmentPlanSchema } from './adjust.js'
import { baselineParams, defaultDose } from './baseline.js'
import { calculate, splitExact } from './calculate.js'
import { baselineRecipe, buildRecipe, paramsOf, recipeFromParams, rescale } from './engine.js'
import { formatRecipe, formatTime, parseTime } from './format.js'
import { clampParams } from './params.js'
import { checkRecipe, isValidRecipe } from './validate.js'

const today = new Date('2026-10-23T00:00:00Z')
const hambela: Pick<BeanAttributes, 'originCountry' | 'process' | 'roastLevel' | 'roastDate'> = {
  originCountry: 'ET',
  process: 'washed',
  roastLevel: 'light',
  roastDate: '2026-10-14',
}

describe('splitExact', () => {
  it('always sums exactly to the total', () => {
    expect(splitExact(210, [1, 1, 1])).toEqual([70, 70, 70])
    expect(splitExact(211, [1, 1, 1])).toEqual([71, 70, 70])
    expect(splitExact(100, [3, 1])).toEqual([75, 25])
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), fc.array(fc.double({ min: 0.01, max: 10, noNaN: true }), { minLength: 1, maxLength: 6 }), (total, w) => {
        const parts = splitExact(total, w)
        return parts.reduce((a, b) => a + b, 0) === total && parts.every((p) => p >= 0)
      }),
    )
  })
})

describe('baseline', () => {
  it('builds the Hambela recipe from the Ethiopian profile, washed, light roast', () => {
    const { params, notes, daysOffRoast } = baselineParams({ bean: hambela, today })
    expect(daysOffRoast).toBe(9)
    expect(params).toMatchObject({ doseG: 15, ratio: 17, tempC: 96, grind: 'medium-fine', bloomS: 40, pours: 3 })
    expect(params.totalS).toBe(225) // 210 + 15 for a light roast
    expect(notes[0]).toMatch(/Ethiopian/)
  })

  it('falls back to the default profile for unknown origins', () => {
    const { params } = baselineParams({ bean: { originCountry: null, process: null, roastLevel: null, roastDate: null } })
    expect(params).toMatchObject({ ratio: 16, tempC: 93, grind: 'medium', bloomS: 30, totalS: 190, doseG: 15 })
  })

  it('applies process, roast and preference modifiers', () => {
    const natural = baselineParams({ bean: { ...hambela, process: 'natural', roastLevel: 'medium' }, today }).params
    expect(natural).toMatchObject({ tempC: 93, ratio: 16, grind: 'medium', bloomS: 45 })
    const dark = baselineParams({ bean: { originCountry: 'BR', process: null, roastLevel: 'dark', roastDate: null } }).params
    expect(dark.tempC).toBe(88)
    expect(dark.grind).toBe('medium-coarse') // clamped from coarse to the V60 range
    const light = baselineParams({ bean: hambela, today, preferences: { taste: 'floral', body: 'light', acidity: 'bright' } }).params
    expect(light).toMatchObject({ ratio: 18, tempC: 96, pours: 4 })
    const choc = baselineParams({ bean: hambela, today, preferences: { taste: 'chocolatey', body: 'concentrated', acidity: 'lowacid' } }).params
    expect(choc).toMatchObject({ pours: 2, ratio: 14 })
  })

  it('blooms longer for very fresh coffee', () => {
    const fresh = baselineParams({ bean: { ...hambela, roastDate: '2026-10-20' }, today }).params
    expect(fresh.bloomS).toBe(50)
  })

  it('scales total time gently with the dose', () => {
    expect(baselineParams({ bean: hambela, today, doseG: 20 }).params.totalS).toBe(V60.bounds.totalS.max) // 225 × √(20/15) = 260, clamped
    expect(baselineParams({ bean: hambela, today, doseG: 12 }).params.totalS).toBe(201)
  })

  it('knows each origin’s default dose', () => {
    expect(defaultDose({ originCountry: 'BR' })).toBe(16)
    expect(defaultDose({ originCountry: null })).toBe(15)
  })
})

describe('calculate', () => {
  it('produces the canvas pour plan for 15 g at 1:16', () => {
    const c = calculate({ doseG: 15, ratio: 16, tempC: 94, grind: 'medium-fine', bloomS: 40, totalS: 190, pours: 3 })
    expect(c.waterG).toBe(240)
    expect(c.steps.map((s) => s.targetG)).toEqual([30, 100, 170, 240, 240])
    expect(c.steps.map((s) => [s.startS, s.pourEndS, s.endS])).toEqual([
      [0, 10, 40],
      [40, 60, 70],
      [70, 90, 100],
      [100, 120, 120],
      [120, 120, 190],
    ])
    expect(c.steps.map((s) => s.label)).toEqual(['Bloom', 'First pour', 'Second pour', 'Last pour', 'Draw down'])
  })

  it('compresses pour windows when time is short', () => {
    const c = calculate({ doseG: 15, ratio: 16, tempC: 94, grind: 'medium', bloomS: 50, totalS: 135, pours: 5 })
    const draw = c.steps[c.steps.length - 1]
    expect(draw.endS - draw.startS).toBeGreaterThanOrEqual(V60.minDrawdownS)
  })
})

describe('engine and validator', () => {
  it('builds a valid rules recipe', () => {
    const r = baselineRecipe({ bean: hambela, today })
    expect(checkRecipe(r)).toEqual([])
    expect(r.source).toBe('rules')
    expect(r.rationale).toMatch(/Ethiopian/)
  })

  it('applies an AI plan inside its bounds', () => {
    const plan = AdjustmentPlanSchema.parse({
      tempDeltaC: -2,
      ratioDelta: -1,
      grindStepDelta: 0,
      pourCount: 4,
      pourWeights: [1, 1, 2, 2],
      rationale: 'Cooler for this roast.',
      expectedCup: 'Tea-like.',
    })
    const res = buildRecipe({ bean: hambela, today }, plan, { promptVersion: 'recipe.v1', model: 'm' })
    expect(res.usedBaseline).toBe(false)
    expect(res.recipe).toMatchObject({ tempC: 94, ratio: 16, source: 'ai', promptVersion: 'recipe.v1', model: 'm', expectedCup: 'Tea-like.' })
    expect(res.recipe.steps.filter((s) => s.kind === 'pour').map((s) => s.amountG)).toEqual([35, 35, 70, 70])
  })

  it('clamps an AI plan that asks for too much', () => {
    const plan = AdjustmentPlanSchema.parse({ tempDeltaC: 9, ratioDelta: -7, grindStepDelta: 4, pourCount: 9, pourWeights: [1, 2], rationale: 'x' })
    const res = buildRecipe({ bean: hambela, today }, plan)
    expect(res.clamped).toEqual(expect.arrayContaining(['tempDeltaC', 'ratioDelta', 'grindStepDelta', 'pourWeights', 'pours']))
    expect(checkRecipe(res.recipe)).toEqual([])
    expect(res.recipe.tempC).toBeLessThanOrEqual(V60.bounds.tempC.max)
  })

  it('without a plan returns the baseline', () => {
    expect(buildRecipe({ bean: hambela, today }).usedBaseline).toBe(true)
  })

  it('reports every kind of broken recipe', () => {
    const good = baselineRecipe({ bean: hambela, today })
    const broken: Recipe = {
      ...good,
      waterG: good.waterG + 5,
      tempC: 99,
      ratio: 20,
      doseG: 40,
      bloomS: 10,
      totalTimeS: 999,
      grind: 'fine',
      rationale: 'x'.repeat(401),
      steps: [{ ...good.steps[1] }, { ...good.steps[0], startS: 0, pourEndS: 5, endS: 2, targetG: 1 }],
    }
    const issues = checkRecipe(broken)
    for (const pattern of [
      /dose/,
      /ratio/,
      /temperature/,
      /grind/,
      /bloom/,
      /total time/,
      /dose × ratio/,
      /pours/,
      /first step/,
      /last step/,
      /sum to/,
      /target/,
      /backwards/,
      /starts before|does not start/,
      /rationale/,
    ]) {
      expect(issues.some((i) => pattern.test(i))).toBe(true)
    }
    expect(checkRecipe({ nope: true })[0]).toMatch(/schema/)
    expect(isValidRecipe(good)).toBe(true)
  })

  it('accepts legacy snapshots as saved', () => {
    const legacy = { ...baselineRecipe({ bean: hambela, today }), source: 'legacy' as const, waterG: 1 }
    expect(checkRecipe(legacy)).toEqual([])
  })

  it('rescales a recipe to a new dose (RCP-07)', () => {
    const r = recipeFromParams({ doseG: 15, ratio: 16, tempC: 94, grind: 'medium-fine', bloomS: 40, totalS: 190, pours: 3 }, { source: 'rules' })
    const big = rescale(r, 18)
    expect(big.waterG).toBe(288)
    expect(big.steps.reduce((a, s) => a + s.amountG, 0)).toBe(288)
    expect(checkRecipe(big)).toEqual([])
    expect(paramsOf(big).pours).toBe(3)
    expect(rescale({ ...r, source: 'ai' }, 16).steps[1].note).toBe(r.steps[1].note)
  })

  it('renders the rules into the prompt text', () => {
    expect(describeRulesForPrompt()).toMatch(/1:13 to 1:18/)
  })
})

describe('property: no invalid recipe is ever delivered (RCP-04)', () => {
  const bean = fc.record({
    originCountry: fc.constantFrom(null, ...Object.keys(ORIGIN_PROFILES), 'ZZ'),
    process: fc.constantFrom(null, ...PROCESSES),
    roastLevel: fc.constantFrom(null, ...ROAST_LEVELS),
    roastDate: fc.constantFrom(null, '2026-10-22', '2026-10-14', '2026-08-01'),
  })
  const prefs = fc.record({
    taste: fc.constantFrom(null, 'fruity', 'floral', 'chocolatey', 'balanced'),
    body: fc.constantFrom(null, 'light', 'medium', 'strong', 'concentrated'),
    acidity: fc.constantFrom(null, 'bright', 'smooth', 'lowacid'),
  })
  const plan = fc.option(
    fc.record({
      tempDeltaC: fc.double({ min: -20, max: 20, noNaN: true }),
      ratioDelta: fc.double({ min: -20, max: 20, noNaN: true }),
      grindStepDelta: fc.integer({ min: -9, max: 9 }),
      bloomS: fc.option(fc.integer({ min: -10, max: 200 }), { nil: null }),
      pourCount: fc.option(fc.integer({ min: -2, max: 12 }), { nil: null }),
      pourWeights: fc.option(fc.array(fc.double({ min: -1, max: 5, noNaN: true }), { maxLength: 8 }), { nil: null }),
      rationale: fc.string({ maxLength: 50 }),
    }),
    { nil: null },
  )

  it('holds for 10,000 random beans, doses, preferences and AI plans', () => {
    fc.assert(
      fc.property(bean, prefs, fc.integer({ min: 1, max: 60 }), plan, (b, p, dose, pl) => {
        const res = buildRecipe({ bean: b as never, preferences: p as never, doseG: dose, today }, pl as never)
        return checkRecipe(res.recipe).length === 0
      }),
      { numRuns: 10_000 },
    )
  })

  it('holds for every grind and any rescale', () => {
    fc.assert(
      fc.property(fc.constantFrom(...GRIND_SCALE), fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 60 }), (g, d1, d2) => {
        const r = recipeFromParams({ doseG: d1, ratio: 16, tempC: 93, grind: g, bloomS: 35, totalS: 190, pours: 3 }, { source: 'user' })
        return checkRecipe(r).length === 0 && checkRecipe(rescale(r, d2)).length === 0
      }),
      { numRuns: 2_000 },
    )
  })
})

describe('format', () => {
  it('formats recipes for the current screens', () => {
    const r = recipeFromParams(
      { doseG: 15, ratio: 16, tempC: 94, grind: 'medium-fine', bloomS: 40, totalS: 190, pours: 3 },
      { source: 'rules', rationale: 'Why.', expectedCup: 'Cup.' },
    )
    const d = formatRecipe(r)
    expect(d).toMatchObject({
      coffeeAmount: '15 g',
      waterAmount: '240 g',
      ratio: '1:16',
      waterTemp: '94 °C',
      grindSize: 'Medium-fine',
      totalTime: '3:10',
      tips: 'Why. Cup.',
    })
    expect(d.steps[1]).toEqual({ name: 'First pour', water: 'to 100 g', waitUntil: '1:00', notes: expect.any(String) })
    expect(d.steps[4]).toMatchObject({ water: '', waitUntil: '3:10' })
    const legacyGuide = { coffeeAmount: '15g' }
    expect(formatRecipe({ ...r, source: 'legacy', legacyGuide })).toBe(legacyGuide)
  })

  it('formats and parses times', () => {
    expect(formatTime(190)).toBe('3:10')
    expect(formatTime(-5)).toBe('0:00')
    expect(parseTime('until 3:30')).toBe(210)
    expect(parseTime('soon')).toBeNull()
  })

  it('clampParams reports what moved', () => {
    expect(clampParams({ doseG: 15, ratio: 16, tempC: 93, grind: 'medium', bloomS: 30, totalS: 190, pours: 3 }).clamped).toEqual([])
    expect(
      applyAdjustment({ doseG: 15, ratio: 16, tempC: 93, grind: 'medium', bloomS: 30, totalS: 190, pours: 3 }, AdjustmentPlanSchema.parse({ rationale: 'r' }))
        .clamped,
    ).toEqual([])
  })
})
