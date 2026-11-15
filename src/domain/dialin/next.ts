// DIAL-03, DIAL-04, DIAL-05 and RCP-02: what the next brew of a bag should be,
// from that bag's own history. No AI call: the engine alone (Solution Plan §4.4).

import type { ChangeKind } from '../enums.js'
import { label } from '../enums.js'
import type { AdviceRecord, Brew, Recipe } from '../schemas.js'
import { applyAdvice, type Advice } from './advise.js'

export type NextKind = 'first' | 'standard' | 'dialin' | 'keep' | 'repeat'

export type RecipeField = 'doseG' | 'waterG' | 'ratio' | 'tempC' | 'grind'

export interface NextBrew {
  kind: NextKind
  /** Null for a first brew or after legacy entries: the caller asks for a fresh recipe. */
  recipe: Recipe | null
  /** The brew this plan builds on. */
  from: Brew | null
  advice: AdviceRecord | null
  /** Grinder clicks for the next brew, when the last one recorded them. */
  clicks: number | null
  /** What differs from `from.recipe` (shown in water, with the old value). */
  changed: RecipeField[]
  title: string
  why: string
}

export const newestFirst = (brews: Brew[]): Brew[] => [...brews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

/** A number of clicks from what the user typed ("22", "22 clicks", "C40 22"). */
export function parseClicks(setting: string | null | undefined): number | null {
  const m = String(setting ?? '').match(/(\d{1,3})/)
  if (!m) return null
  const n = Number(m[1])
  return n > 0 && n <= 200 ? n : null
}

export function recipeChanges(before: Recipe, after: Recipe): RecipeField[] {
  return (['doseG', 'waterG', 'ratio', 'tempC', 'grind'] as const).filter((k) => before[k] !== after[k])
}

const isGrind = (k: ChangeKind) => k === 'grind-finer' || k === 'grind-coarser'

export function nextBrew(brews: Brew[]): NextBrew {
  const list = newestFirst(brews)
  const last = list[0]
  const base = { from: last ?? null, advice: null, clicks: null, changed: [] as RecipeField[] }
  if (!last) return { ...base, kind: 'first', recipe: null, title: 'First brew of a new bag', why: '' }
  if (last.recipe.source === 'legacy')
    return {
      ...base,
      kind: 'standard',
      recipe: null,
      title: 'Brew it with a new recipe',
      why: 'Your earlier brews were saved before recipes were tracked, so this starts from a fresh recipe.',
    }

  const advice = last.advice
  if (advice && !advice.keep && advice.primary.kind !== 'none') {
    const usesClicks = isGrind(advice.primary.kind) && advice.clicks !== null
    const recipe = applyAdvice(last.recipe, advice as Pick<Advice, 'primary' | 'why'>, { clicks: usesClicks ? advice.clicks : null })
    const clicks = usesClicks
      ? advice.clicks! + (advice.primary.kind === 'grind-finer' ? -advice.primary.amount : advice.primary.amount)
      : parseClicks(last.grindSetting)
    const changed = recipeChanges(last.recipe, recipe)
    if (usesClicks && !changed.includes('grind')) changed.push('grind')
    return {
      ...base,
      kind: 'dialin',
      recipe,
      advice,
      clicks,
      changed,
      title: advice.title,
      why: 'Everything else stays the same, so you can taste what this one change does.',
    }
  }

  const clicks = parseClicks(last.grindSetting)
  if (advice?.keep || (last.rating ?? 0) >= 4)
    return {
      ...base,
      kind: 'keep',
      recipe: last.recipe,
      advice,
      clicks,
      title: 'Brew it the same way',
      why: 'You liked the last cup, so the recipe stays as it is.',
    }

  // RCP-02: with no change to make, start from the best-rated recipe of this bag.
  const best = bestBrew(list)
  const from = best && (best.rating ?? 0) > (last.rating ?? 0) ? best : last
  return {
    ...base,
    from,
    kind: 'repeat',
    recipe: from.recipe,
    advice,
    clicks,
    title: from === last ? 'Brew it the same way once more' : 'Go back to your best recipe',
    why:
      from === last
        ? 'Repeat it once before changing anything, so you know the result is real.'
        : `Brew ${list.length - list.indexOf(from)} rated highest so far, so this repeats it.`,
  }
}

export function bestBrew(brews: Brew[]): Brew | null {
  const rated = brews.filter((b) => b.rating !== null)
  if (rated.length === 0) return null
  return rated.reduce((a, b) => ((b.rating ?? 0) > (a.rating ?? 0) || ((b.rating ?? 0) === (a.rating ?? 0) && b.createdAt > a.createdAt) ? b : a))
}

export interface DialinOutcome {
  fromId: string
  toId: string
  kind: ChangeKind
  title: string
  /** Rating change after applying the suggestion; null when either brew is unrated. */
  ratingDelta: number | null
}

/** DIAL-05: did following a suggestion improve the next rating? */
export function dialinOutcomes(brews: Brew[]): DialinOutcome[] {
  const byId = new Map(brews.map((b) => [b.id, b]))
  return brews.flatMap((b) => {
    const prev = b.appliedFrom ? byId.get(b.appliedFrom) : undefined
    if (!prev?.advice || prev.advice.primary.kind === 'none') return []
    const ratingDelta = b.rating !== null && prev.rating !== null ? b.rating - prev.rating : null
    return [{ fromId: prev.id, toId: b.id, kind: prev.advice.primary.kind, title: prev.advice.title, ratingDelta }]
  })
}

/** DIAL-04 input for `advise`: earlier changes on this bag and how they went. */
export function adviceHistory(brews: Brew[]): Array<{ kind: ChangeKind; ratingDelta: number }> {
  return dialinOutcomes(brews).flatMap((o) => (o.ratingDelta === null ? [] : [{ kind: o.kind, ratingDelta: o.ratingDelta }]))
}

/** "Change: grind 22 → 20 clicks" for the history list. */
export function changeLine(o: Pick<AdviceRecord, 'title' | 'detail'>): string {
  return o.detail ? `Change: ${o.detail}` : `Change: ${o.title.charAt(0).toLowerCase()}${o.title.slice(1)}`
}

export function toAdviceRecord(a: Advice, clicks: number | null): AdviceRecord {
  return { primary: a.primary, secondary: a.secondary, title: a.title, detail: a.detail, why: a.why, keep: a.keep, clicks }
}

/** Balance in the user's words, for tags: "a bit sour", "very bitter", "a bit weak". */
export function balanceWords(b: { sourBitter: number; strength: number } | null): string[] {
  if (!b) return []
  const out: string[] = []
  const sb = b.sourBitter
  if (sb !== 0) out.push(`${Math.abs(sb) === 2 ? 'very' : 'a bit'} ${sb < 0 ? 'sour' : 'bitter'}`)
  if (b.strength !== 0) out.push(`${Math.abs(b.strength) === 2 ? 'very' : 'a bit'} ${b.strength < 0 ? 'weak' : 'strong'}`)
  if (out.length === 0) out.push('balanced')
  return out
}

export { label }
