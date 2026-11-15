// The R1 dial-in coach as a decision table (DIAL-01, DIAL-02, AI-04 rules).
// Strength against extraction, as on the brewing control chart: sour or thin
// means under-extracted, bitter or harsh means over-extracted.

import { shiftGrind } from '../enums.js'
import type { Balance, Recipe } from '../schemas.js'
import { paramsOf, recipeFromParams } from '../recipe/engine.js'
import type { RecipeParams } from '../recipe/params.js'

export type ChangeKind = 'grind-finer' | 'grind-coarser' | 'hotter' | 'cooler' | 'more-water' | 'more-coffee' | 'none'

export interface Change {
  kind: ChangeKind
  /** Size: grind steps (or clicks when a grinder setting is known), °C, ratio points or grams. */
  amount: number
}

export interface Advice {
  primary: Change
  secondary: Change | null
  title: string
  detail: string
  why: string
  then: string
  /** True when the recipe should be kept as it is (balanced and liked). */
  keep: boolean
}

export interface AdviceInput {
  rating: number | null
  balance: Balance
  recipe: Recipe
  /** The grinder setting used, when it is a number of clicks. */
  clicks?: number | null
  /** Earlier changes on this bean and whether the next rating went down. */
  history?: Array<{ kind: ChangeKind; ratingDelta: number }>
}

function failed(kind: ChangeKind, history: AdviceInput['history']): boolean {
  return (history ?? []).some((h) => h.kind === kind && h.ratingDelta < 0)
}

export function advise(input: AdviceInput): Advice {
  const { balance, recipe, rating } = input
  const sour = balance.sourBitter < 0
  const bitter = balance.sourBitter > 0
  const weak = balance.strength < 0
  const strong = balance.strength > 0
  const very = Math.abs(balance.sourBitter) === 2
  const clicks = input.clicks ?? null
  const grindAmount = clicks !== null ? (very ? 4 : 2) : very ? 2 : 1

  let primary: Change
  let secondary: Change | null = null
  let why: string

  if (sour) {
    primary = { kind: 'grind-finer', amount: grindAmount }
    secondary = strong ? { kind: 'more-water', amount: 1 } : { kind: 'hotter', amount: 1 }
    why = `${weak ? 'Sour and a little weak' : strong ? 'Sour but strong' : 'Sour'} means the water did not pull enough from the coffee. A finer grind extracts more.`
  } else if (bitter) {
    primary = { kind: 'grind-coarser', amount: grindAmount }
    secondary = weak ? { kind: 'more-coffee', amount: 1 } : strong ? { kind: 'more-water', amount: 1 } : { kind: 'cooler', amount: 1 }
    why = `${strong ? 'Bitter and heavy' : weak ? 'Bitter but thin' : 'Bitter'} means too much was pulled from the coffee. A coarser grind extracts less.`
  } else if (weak) {
    primary = { kind: 'more-coffee', amount: 1 }
    why = 'The balance is right but the cup is thin, so add coffee rather than change how much you extract.'
  } else if (strong) {
    primary = { kind: 'more-water', amount: 1 }
    why = 'The balance is right but the cup is heavy, so dilute it rather than change how much you extract.'
  } else {
    const keep = (rating ?? 0) >= 4
    return {
      primary: { kind: 'none', amount: 0 },
      secondary: null,
      keep,
      title: keep ? 'Keep this recipe' : 'Brew it the same way once more',
      detail: keep ? 'Save it as your house recipe for this bag' : 'No change for the next brew',
      why: keep
        ? `Balanced, the strength is right and you rated it ${rating} of 5. Nothing to change.`
        : 'Nothing is out of balance. Repeat it once before changing anything, so you know the result is real.',
      then: keep ? 'You can still adjust it from the bag page.' : 'Rate it again next time.',
    }
  }

  // DIAL-04: never repeat a change that made the cup worse; fall back to the secondary.
  if (failed(primary.kind, input.history) && secondary && !failed(secondary.kind, input.history)) {
    ;[primary, secondary] = [secondary, null]
  }

  const p = paramsOf(recipe)
  return {
    primary,
    secondary,
    keep: false,
    title: titleOf(primary, clicks !== null),
    detail: detailOf(primary, p, clicks),
    why,
    then: secondary ? `Still ${sour ? 'sour' : bitter ? 'bitter' : 'off'} after that? ${thenOf(secondary, p)}` : 'Taste the difference, then rate it again.',
  }
}

function titleOf(c: Change, hasClicks: boolean): string {
  const unit = hasClicks ? (c.amount === 1 ? 'click' : 'clicks') : c.amount === 1 ? 'step' : 'steps'
  switch (c.kind) {
    case 'grind-finer':
      return `Grind ${c.amount} ${unit} finer`
    case 'grind-coarser':
      return `Grind ${c.amount} ${unit} coarser`
    case 'hotter':
      return `Use water ${c.amount} °C hotter`
    case 'cooler':
      return `Use water ${c.amount} °C cooler`
    case 'more-coffee':
      return 'Use 1 g more coffee'
    case 'more-water':
      return 'Add a little more water'
    default:
      return 'Keep this recipe'
  }
}

function detailOf(c: Change, p: RecipeParams, clicks: number | null): string {
  switch (c.kind) {
    case 'grind-finer':
      return clicks !== null ? `${clicks} → ${clicks - c.amount} clicks` : `${p.grind} → ${shiftGrind(p.grind, -c.amount)}`
    case 'grind-coarser':
      return clicks !== null ? `${clicks} → ${clicks + c.amount} clicks` : `${p.grind} → ${shiftGrind(p.grind, c.amount)}`
    case 'hotter':
      return `${p.tempC} → ${p.tempC + c.amount} °C`
    case 'cooler':
      return `${p.tempC} → ${p.tempC - c.amount} °C`
    case 'more-coffee':
      return `${p.doseG} g → ${p.doseG + 1} g, same ${Math.round(p.doseG * p.ratio)} g of water`
    case 'more-water':
      return `1:${p.ratio} → 1:${p.ratio + 1}, ${Math.round(p.doseG * (p.ratio + 1))} g of water`
    default:
      return ''
  }
}

function thenOf(c: Change, p: RecipeParams): string {
  switch (c.kind) {
    case 'hotter':
      return `Raise the water to ${p.tempC + 1} °C.`
    case 'cooler':
      return `Drop the water to ${p.tempC - 1} °C.`
    case 'more-water':
      return `Add water next: 1:${p.ratio + 1}, so ${Math.round(p.doseG * (p.ratio + 1))} g.`
    case 'more-coffee':
      return `Use more coffee next: ${p.doseG + 1} g for the same water.`
    default:
      return 'Change the grind again by one step.'
  }
}

/** DIAL-03: the next recipe with the primary change applied. Grind clicks live outside the recipe, so a click change keeps the descriptor. */
export function applyAdvice(recipe: Recipe, advice: Advice, opts: { clicks?: number | null } = {}): Recipe {
  const p = paramsOf(recipe)
  const c = advice.primary
  const byClicks = opts.clicks !== null && opts.clicks !== undefined
  let next: RecipeParams = p
  switch (c.kind) {
    case 'grind-finer':
      next = byClicks ? p : { ...p, grind: shiftGrind(p.grind, -c.amount) }
      break
    case 'grind-coarser':
      next = byClicks ? p : { ...p, grind: shiftGrind(p.grind, c.amount) }
      break
    case 'hotter':
      next = { ...p, tempC: p.tempC + c.amount }
      break
    case 'cooler':
      next = { ...p, tempC: p.tempC - c.amount }
      break
    case 'more-coffee':
      next = { ...p, doseG: p.doseG + 1, ratio: Math.round((p.doseG * p.ratio) / (p.doseG + 1)) }
      break
    case 'more-water':
      next = { ...p, ratio: p.ratio + 1 }
      break
    default:
      next = p
  }
  return recipeFromParams(next, { source: 'rules', rationale: advice.why })
}
