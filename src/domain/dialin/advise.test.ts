import { describe, expect, it } from 'vitest'
import { recipeFromParams } from '../recipe/engine.js'
import { checkRecipe } from '../recipe/validate.js'
import { advise, applyAdvice, type ChangeKind } from './advise.js'

const recipe = recipeFromParams({ doseG: 15, ratio: 16, tempC: 94, grind: 'medium', bloomS: 40, totalS: 190, pours: 3 }, { source: 'rules' })

// The decision table from Solution Plan §4.7, row by row (DIAL-02: 100% directional correctness).
const table: Array<[string, number, number, ChangeKind, ChangeKind | null]> = [
  ['sour, weak', -1, -1, 'grind-finer', 'hotter'],
  ['sour, strong', -1, 1, 'grind-finer', 'more-water'],
  ['sour, balanced strength', -1, 0, 'grind-finer', 'hotter'],
  ['bitter, strong', 1, 1, 'grind-coarser', 'more-water'],
  ['bitter, weak', 1, -1, 'grind-coarser', 'more-coffee'],
  ['bitter, balanced strength', 1, 0, 'grind-coarser', 'cooler'],
  ['balanced, weak', 0, -1, 'more-coffee', null],
  ['balanced, strong', 0, 1, 'more-water', null],
]

describe('advise', () => {
  it.each(table)('%s → %s then %s', (_name, sb, st, primary, secondary) => {
    const a = advise({ rating: 3, balance: { sourBitter: sb, strength: st }, recipe })
    expect(a.primary.kind).toBe(primary)
    expect(a.secondary?.kind ?? null).toBe(secondary)
    expect(a.keep).toBe(false)
    expect(a.title.length).toBeGreaterThan(0)
    expect(a.why.length).toBeGreaterThan(0)
  })

  it('keeps a balanced recipe the user liked', () => {
    const a = advise({ rating: 4, balance: { sourBitter: 0, strength: 0 }, recipe })
    expect(a).toMatchObject({ keep: true, title: 'Keep this recipe', primary: { kind: 'none' } })
  })

  it('asks for a repeat when balanced but not liked', () => {
    const a = advise({ rating: 2, balance: { sourBitter: 0, strength: 0 }, recipe })
    expect(a).toMatchObject({ keep: false, title: 'Brew it the same way once more' })
    expect(advise({ rating: null, balance: { sourBitter: 0, strength: 0 }, recipe }).keep).toBe(false)
  })

  it('speaks in clicks when the grinder setting is known, doubling for very sour', () => {
    const a = advise({ rating: 3, balance: { sourBitter: -1, strength: -1 }, recipe, clicks: 22 })
    expect(a.title).toBe('Grind 2 clicks finer')
    expect(a.detail).toBe('22 → 20 clicks')
    expect(a.then).toBe('Still sour after that? Raise the water to 95 °C.')
    expect(advise({ rating: 2, balance: { sourBitter: -2, strength: 0 }, recipe, clicks: 22 }).detail).toBe('22 → 18 clicks')
    expect(advise({ rating: 2, balance: { sourBitter: 2, strength: 1 }, recipe, clicks: 22 }).detail).toBe('22 → 26 clicks')
  })

  it('speaks in grind steps without a grinder setting', () => {
    expect(advise({ rating: 3, balance: { sourBitter: -1, strength: 0 }, recipe }).detail).toBe('medium → medium-fine')
    expect(advise({ rating: 3, balance: { sourBitter: 2, strength: 0 }, recipe }).title).toBe('Grind 2 steps coarser')
    expect(advise({ rating: 3, balance: { sourBitter: 1, strength: 0 }, recipe }).then).toMatch(/93 °C/)
    expect(advise({ rating: 3, balance: { sourBitter: 1, strength: -1 }, recipe }).then).toMatch(/16 g/)
    expect(advise({ rating: 3, balance: { sourBitter: -1, strength: 1 }, recipe }).then).toMatch(/1:17, so 255 g/)
  })

  it('describes ratio and dose changes', () => {
    expect(advise({ rating: 3, balance: { sourBitter: 0, strength: -1 }, recipe }).detail).toBe('15 g → 16 g, same 240 g of water')
    expect(advise({ rating: 3, balance: { sourBitter: 0, strength: 1 }, recipe }).detail).toBe('1:16 → 1:17, 255 g of water')
  })

  it('does not repeat a change that made the last cup worse (DIAL-04)', () => {
    const a = advise({ rating: 2, balance: { sourBitter: -1, strength: -1 }, recipe, history: [{ kind: 'grind-finer', ratingDelta: -1 }] })
    expect(a.primary.kind).toBe('hotter')
    expect(a.secondary).toBeNull()
    expect(a.title).toBe('Use water 1 °C hotter')
  })

  it('applies the change to the next recipe (DIAL-03)', () => {
    const cases: Array<[number, number, Partial<typeof recipe>]> = [
      [-1, 0, { grind: 'medium-fine' }],
      [1, 0, { grind: 'medium-coarse' }],
      [0, -1, { doseG: 16, waterG: 240 }],
      [0, 1, { ratio: 17, waterG: 255 }],
    ]
    for (const [sb, st, expected] of cases) {
      const next = applyAdvice(recipe, advise({ rating: 3, balance: { sourBitter: sb, strength: st }, recipe }))
      expect(next).toMatchObject(expected)
      expect(checkRecipe(next)).toEqual([])
    }
    const hotter = advise({ rating: 2, balance: { sourBitter: -1, strength: -1 }, recipe, history: [{ kind: 'grind-finer', ratingDelta: -1 }] })
    expect(applyAdvice(recipe, hotter).tempC).toBe(95)
    const cooler = advise({ rating: 2, balance: { sourBitter: 1, strength: 0 }, recipe, history: [{ kind: 'grind-coarser', ratingDelta: -2 }] })
    expect(applyAdvice(recipe, cooler).tempC).toBe(93)
    const byClicks = advise({ rating: 3, balance: { sourBitter: -1, strength: 0 }, recipe, clicks: 22 })
    expect(applyAdvice(recipe, byClicks, { clicks: 22 }).grind).toBe('medium')
    const keep = advise({ rating: 5, balance: { sourBitter: 0, strength: 0 }, recipe })
    expect(applyAdvice(recipe, keep)).toMatchObject({ tempC: 94, ratio: 16, grind: 'medium' })
  })
})
