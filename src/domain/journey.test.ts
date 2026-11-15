import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { freshness, freshnessText } from './beans/freshness.js'
import { beanStats } from './beans/stats.js'
import { brewState, elapsed, jumpClock, nextMark, pauseClock, startClock, stoppedClock, waterAt } from './brew/timeline.js'
import { advise } from './dialin/advise.js'
import { adviceHistory, balanceWords, bestBrew, changeLine, dialinOutcomes, nextBrew, parseClicks, toAdviceRecord } from './dialin/next.js'
import { flavourChips } from './lexicon.js'
import { recipeFromParams } from './recipe/engine.js'
import { checkRecipe } from './recipe/validate.js'
import { BrewSchema, type Brew, type Recipe } from './schemas.js'

const TODAY = new Date('2026-10-23T03:00:00Z')
const recipe = recipeFromParams({ doseG: 15, ratio: 16, tempC: 94, grind: 'medium-fine', bloomS: 40, totalS: 190, pours: 3 }, { source: 'rules' })

let n = 0
function brew(over: Partial<Brew> = {}): Brew {
  n++
  return BrewSchema.parse({ id: `b${n}`, beanId: 'bean', createdAt: new Date(Date.UTC(2026, 9, 20, 7, n)).toISOString(), method: 'v60', recipe, ...over })
}

describe('freshness (BEAN-04)', () => {
  it('places a light roast in its window', () => {
    expect(freshness({ roastDate: '2026-10-20', roastLevel: 'light' }, TODAY)).toMatchObject({ day: 3, state: 'resting', readyOn: '2026-10-27' })
    const peak = freshness({ roastDate: '2026-10-14', roastLevel: 'light' }, TODAY)!
    expect(peak).toMatchObject({ day: 9, state: 'peak', bestUntil: '2026-11-13' })
    expect(freshnessText(peak)).toBe('At its best · day 9')
    expect(freshnessText(freshness({ roastDate: '2026-10-20', roastLevel: 'light' }, TODAY)!)).toBe('Resting · ready 27 Oct')
    expect(freshness({ roastDate: '2026-08-01', roastLevel: 'light' }, TODAY)?.state).toBe('fading')
  })

  it('uses shorter windows for darker roasts, and hides without a roast date', () => {
    expect(freshness({ roastDate: '2026-10-19', roastLevel: 'dark' }, TODAY)?.state).toBe('peak')
    expect(freshness({ roastDate: '2026-10-19', roastLevel: 'light' }, TODAY)?.state).toBe('resting')
    expect(freshness({ roastDate: null, roastLevel: 'light' }, TODAY)).toBeNull()
    expect(freshness({ roastDate: '2026-10-24', roastLevel: null }, TODAY)?.day).toBe(0)
  })
})

describe('guided brew timeline (BRW-01)', () => {
  const [bloom, first] = recipe.steps

  it('says what to pour and by when', () => {
    expect(brewState(recipe, 0)).toMatchObject({ phase: 'pour', phaseLabel: 'Bloom', lead: 'Pour to', big: `${bloom.targetG} g` })
    const wait = brewState(recipe, bloom.pourEndS + 1)
    expect(wait).toMatchObject({ phase: 'wait', lead: 'Next pour in', how: 'Blooming. Let the gas escape.' })
    expect(wait.countdown).toBe(`At 0:${String(bloom.endS).padStart(2, '0')}, pour to ${first.targetG} g`)
    const pour = brewState(recipe, first.startS + 1)
    expect(pour).toMatchObject({ phase: 'pour', big: `${first.targetG} g` })
    expect(pour.phaseLabel).toMatch(/pour 2 of 4/)
  })

  it('draws down, then finishes', () => {
    const dd = recipe.steps.at(-1)!
    expect(brewState(recipe, dd.startS + 5)).toMatchObject({ phase: 'drawdown', lead: 'Wait' })
    expect(brewState(recipe, recipe.totalTimeS)).toMatchObject({ phase: 'done', big: '3:10' })
    expect(brewState(recipe, 9999).phase).toBe('done')
  })

  it('skips to the next moment something changes (BRW-04)', () => {
    expect(nextMark(recipe, 0)).toBe(bloom.pourEndS)
    expect(nextMark(recipe, bloom.pourEndS)).toBe(bloom.endS)
    expect(nextMark(recipe, recipe.totalTimeS)).toBe(recipe.totalTimeS)
  })

  it('changes its key only when the brewer has something new to do', () => {
    const keys = new Set<string>()
    for (let t = 0; t <= recipe.totalTimeS; t++) keys.add(brewState(recipe, t).key)
    // bloom pour+wait, three pours each pour+wait (the last pour has no wait), draw down, done
    expect(keys.size).toBeGreaterThanOrEqual(recipe.steps.length + 2)
  })

  it('follows the water on the scale', () => {
    expect(waterAt(recipe, 0)).toBe(0)
    expect(waterAt(recipe, bloom.pourEndS)).toBe(bloom.targetG)
    expect(waterAt(recipe, recipe.totalTimeS)).toBe(recipe.waterG)
  })

  it('holds for any recipe: progress 0–1 and the answer always present', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 30 }),
        fc.integer({ min: 13, max: 18 }),
        fc.integer({ min: 2, max: 5 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (dose, ratio, pours, f) => {
          const r = recipeFromParams({ doseG: dose, ratio, tempC: 93, grind: 'medium', bloomS: 40, totalS: 210, pours }, { source: 'rules' })
          const s = brewState(r, f * r.totalTimeS)
          return s.progress >= 0 && s.progress <= 1.0001 && s.big.length > 0 && s.next.length > 0
        },
      ),
      { numRuns: 500 },
    )
  })

  it('times by measurement, so pausing and skipping keep exact time', () => {
    let c = startClock(stoppedClock(), 1000)
    expect(elapsed(c, 6000)).toBe(5)
    c = pauseClock(c, 6000)
    expect(elapsed(c, 60_000)).toBe(5)
    c = startClock(c, 60_000)
    expect(elapsed(c, 61_000)).toBe(6)
    c = jumpClock(c, 40, 61_000)
    expect(elapsed(c, 62_000)).toBe(41)
    // 5 minutes of wall time is 300 s however often it is sampled (BRW-01 drift ≤ 1 s)
    expect(elapsed(startClock(stoppedClock(), 0), 300_000)).toBe(300)
  })
})

describe('next brew of a bag (DIAL-03, RCP-02)', () => {
  it('asks for a fresh recipe for a new bag or after legacy entries', () => {
    expect(nextBrew([])).toMatchObject({ kind: 'first', recipe: null })
    const legacy = brew({ recipe: { ...recipe, source: 'legacy' } })
    expect(nextBrew([legacy]).kind).toBe('standard')
  })

  it('applies the suggestion from the last brew, one change only', () => {
    const a = advise({ rating: 3, balance: { sourBitter: -1, strength: -1 }, recipe })
    const earlier = brew({ rating: 2 })
    const last = brew({ rating: 3, balance: { sourBitter: -1, strength: -1 }, advice: toAdviceRecord(a, null) })
    const plan = nextBrew([earlier, last])
    expect(plan.kind).toBe('dialin')
    expect(plan.recipe!.grind).toBe('medium-fine') // already at the finest V60 grind, so the coach moved to temperature
    expect(plan.recipe!.tempC).toBe(95)
    expect(plan.changed).toEqual(['tempC'])
    expect(checkRecipe(plan.recipe)).toEqual([])
  })

  it('counts grinder clicks when the user recorded them', () => {
    const a = advise({ rating: 3, balance: { sourBitter: -1, strength: -1 }, recipe, clicks: 22 })
    const plan = nextBrew([brew({ rating: 3, grindSetting: '22 clicks', advice: toAdviceRecord(a, 22) })])
    expect(plan).toMatchObject({ kind: 'dialin', clicks: 20, changed: ['grind'], title: 'Grind 2 clicks finer' })
    expect(changeLine(plan.advice!)).toBe('Change: 22 → 20 clicks')
  })

  it('keeps a liked recipe and returns to the best one otherwise', () => {
    const keep = advise({ rating: 5, balance: { sourBitter: 0, strength: 0 }, recipe })
    expect(nextBrew([brew({ rating: 5, advice: toAdviceRecord(keep, null) })]).kind).toBe('keep')
    const strong: Recipe = { ...recipe, tempC: 92 }
    const best = brew({ rating: 4, recipe: strong })
    const meh = brew({ rating: 2 })
    const plan = nextBrew([best, meh])
    expect(plan).toMatchObject({ kind: 'repeat', title: 'Go back to your best recipe' })
    expect(plan.recipe!.tempC).toBe(92)
    expect(bestBrew([best, meh])!.id).toBe(best.id)
  })

  it('tracks whether suggestions helped (DIAL-05) and feeds history back (DIAL-04)', () => {
    const a = advise({ rating: 3, balance: { sourBitter: -1, strength: 0 }, recipe })
    const b1 = brew({ rating: 3, advice: toAdviceRecord(a, null) })
    const b2 = brew({ rating: 2, appliedFrom: b1.id })
    const out = dialinOutcomes([b1, b2])
    expect(out).toEqual([{ fromId: b1.id, toId: b2.id, kind: a.primary.kind, title: a.title, ratingDelta: -1 }])
    expect(adviceHistory([b1, b2])).toEqual([{ kind: a.primary.kind, ratingDelta: -1 }])
    expect(dialinOutcomes([b2])).toEqual([])
  })

  it('reads clicks and describes balance in plain words', () => {
    expect(parseClicks('22 clicks')).toBe(22)
    expect(parseClicks('C40 · 24')).toBe(40) // the first number wins; the field help asks for clicks only
    expect(parseClicks('medium')).toBeNull()
    expect(balanceWords({ sourBitter: -1, strength: -2 })).toEqual(['a bit sour', 'very weak'])
    expect(balanceWords({ sourBitter: 0, strength: 0 })).toEqual(['balanced'])
    expect(balanceWords(null)).toEqual([])
  })
})

describe('bag numbers (BEAN-02, BEAN-03)', () => {
  it('averages ratings, counts doses left and flags a nearly empty bag', () => {
    const s = beanStats({ remainingG: 185, netWeightG: 200, status: 'active' }, [brew({ rating: 3 }), brew({ rating: 4 }), brew()], 15)
    expect(s).toMatchObject({ brewCount: 3, averageRating: 3.5, dosesLeft: 12, nearlyEmpty: false })
    expect(s.usedFraction).toBeCloseTo(0.925)
    expect(beanStats({ remainingG: 12, netWeightG: 200, status: 'active' }, [], 15).nearlyEmpty).toBe(true)
    expect(beanStats({ remainingG: null, netWeightG: null, status: 'active' }, [], 15)).toMatchObject({
      averageRating: null,
      dosesLeft: null,
      nearlyEmpty: false,
      usedFraction: null,
    })
  })
})

describe('flavour chips (LOG-03)', () => {
  it('puts the label notes first without repeats', () => {
    const chips = flavourChips(['Jasmine', 'bergamot'], 6)
    expect(chips.slice(0, 2)).toEqual(['jasmine', 'bergamot'])
    expect(chips).toHaveLength(6)
    expect(new Set(chips).size).toBe(6)
  })
})
