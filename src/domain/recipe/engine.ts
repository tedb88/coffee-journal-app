// The recipe pipeline (Solution Plan §4.4):
// baseline → adjustment (AI, dial-in or user) → clamp → calculate → validate → snapshot.

import { RULES_VERSION } from '../rules/index.js'
import type { Recipe } from '../schemas.js'
import { applyAdjustment, type AdjustmentPlan } from './adjust.js'
import { baselineParams, type RecipeInput } from './baseline.js'
import { calculate } from './calculate.js'
import { clampParams, type RecipeParams } from './params.js'
import { checkRecipe } from './validate.js'

export const ENGINE_VERSION = 'engine-1.0.0'

export interface RecipeMeta {
  source: Recipe['source']
  rationale?: string | null
  expectedCup?: string | null
  promptVersion?: string | null
  model?: string | null
  stepNotes?: string[]
}

export function recipeFromParams(input: RecipeParams, meta: RecipeMeta): Recipe {
  const { params } = clampParams(input)
  const calc = calculate(params, meta.stepNotes ?? [])
  const recipe: Recipe = {
    method: 'v60',
    doseG: params.doseG,
    waterG: calc.waterG,
    ratio: params.ratio,
    tempC: params.tempC,
    grind: params.grind,
    bloomS: params.bloomS,
    totalTimeS: params.totalS,
    steps: calc.steps,
    rationale: meta.rationale ?? null,
    expectedCup: meta.expectedCup ?? null,
    source: meta.source,
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    promptVersion: meta.promptVersion ?? null,
    model: meta.model ?? null,
    legacyGuide: null,
  }
  return recipe
}

/** Read the parameters back out of a delivered recipe (for rescaling and dial-in). */
export function paramsOf(recipe: Recipe): RecipeParams {
  const pours = recipe.steps.filter((s) => s.kind === 'pour')
  return {
    doseG: recipe.doseG,
    ratio: recipe.ratio,
    tempC: recipe.tempC,
    grind: recipe.grind,
    bloomS: recipe.bloomS,
    totalS: recipe.totalTimeS,
    pours: pours.length,
    pourWeights: pours.map((s) => Math.max(1, s.amountG)),
  }
}

export interface BuildResult {
  recipe: Recipe
  /** Parameters that had to be pulled back inside the safe ranges. */
  clamped: string[]
  /** True when the AI plan was dropped and the rules baseline was used instead. */
  usedBaseline: boolean
}

/** The rules-only recipe for a bean: used offline, at the spend cap, and as the AI starting point. */
export function baselineRecipe(input: RecipeInput): Recipe {
  const base = baselineParams(input)
  return recipeFromParams(base.params, { source: 'rules', rationale: base.notes.join(' ') })
}

export function buildRecipe(input: RecipeInput, plan?: AdjustmentPlan | null, meta?: Pick<RecipeMeta, 'promptVersion' | 'model'>): BuildResult {
  const base = baselineParams(input)
  const fallback = () => recipeFromParams(base.params, { source: 'rules', rationale: base.notes.join(' ') })
  if (!plan) return { recipe: fallback(), clamped: [], usedBaseline: true }

  const adjusted = applyAdjustment(base.params, plan)
  const recipe = recipeFromParams(adjusted.params, {
    source: 'ai',
    rationale: plan.rationale,
    expectedCup: plan.expectedCup ?? null,
    stepNotes: plan.stepNotes ?? undefined,
    promptVersion: meta?.promptVersion ?? null,
    model: meta?.model ?? null,
  })
  if (checkRecipe(recipe).length > 0) return { recipe: fallback(), clamped: adjusted.clamped, usedBaseline: true }
  return { recipe, clamped: adjusted.clamped, usedBaseline: false }
}

/** Change the coffee dose and recalculate everything that depends on it (RCP-07). */
export function rescale(recipe: Recipe, doseG: number): Recipe {
  const p = paramsOf(recipe)
  const total = Math.round(p.totalS * Math.sqrt(doseG / p.doseG))
  return recipeFromParams(
    { ...p, doseG, totalS: total },
    {
      source: recipe.source === 'legacy' ? 'user' : recipe.source,
      rationale: recipe.rationale,
      expectedCup: recipe.expectedCup,
      promptVersion: recipe.promptVersion,
      model: recipe.model,
      // default notes quote gram amounts, so only a model's own technique notes carry over
      stepNotes: recipe.source === 'ai' ? recipe.steps.map((s) => s.note) : undefined,
    },
  )
}
