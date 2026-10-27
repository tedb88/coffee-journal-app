// Deterministic recipe checks (AI-03). Replaces the LLM verifier: a recipe
// that fails is rebuilt from its own clamped parameters, so no invalid recipe
// is ever delivered.

import { grindIndex } from '../enums.js'
import { V60 } from '../rules/index.js'
import { RecipeSchema, type Recipe } from '../schemas.js'

export function checkRecipe(recipe: unknown): string[] {
  const parsed = RecipeSchema.safeParse(recipe)
  if (!parsed.success) return parsed.error.issues.map((i) => `schema: ${i.path.join('.')} ${i.message}`)
  const r = parsed.data
  if (r.source === 'legacy') return [] // historical entries are shown as they were saved
  const issues: string[] = []
  const b = V60.bounds

  if (r.doseG < b.doseG.min || r.doseG > b.doseG.max) issues.push(`dose ${r.doseG} g outside ${b.doseG.min}-${b.doseG.max}`)
  if (r.ratio < b.ratio.min || r.ratio > b.ratio.max) issues.push(`ratio 1:${r.ratio} outside 1:${b.ratio.min}-1:${b.ratio.max}`)
  if (r.tempC < b.tempC.min || r.tempC > b.tempC.max) issues.push(`temperature ${r.tempC} °C outside ${b.tempC.min}-${b.tempC.max}`)
  const g = grindIndex(r.grind)
  if (g < grindIndex(b.grind.min) || g > grindIndex(b.grind.max)) issues.push(`grind ${r.grind} outside ${b.grind.min} to ${b.grind.max}`)
  if (r.bloomS < b.bloomS.min || r.bloomS > b.bloomS.max) issues.push(`bloom ${r.bloomS} s outside ${b.bloomS.min}-${b.bloomS.max}`)
  if (r.totalTimeS < b.totalS.min || r.totalTimeS > b.totalS.max) issues.push(`total time ${r.totalTimeS} s outside ${b.totalS.min}-${b.totalS.max}`)
  if (r.waterG !== Math.round(r.doseG * r.ratio)) issues.push(`water ${r.waterG} g is not dose × ratio (${Math.round(r.doseG * r.ratio)} g)`)

  const pours = r.steps.filter((s) => s.kind === 'pour').length
  if (pours < b.pours.min || pours > b.pours.max) issues.push(`${pours} pours outside ${b.pours.min}-${b.pours.max}`)
  if (r.steps[0]?.kind !== 'bloom') issues.push('first step is not the bloom')
  if (r.steps[r.steps.length - 1]?.kind !== 'drawdown') issues.push('last step is not the drawdown')
  if (r.steps[0] && r.steps[0].endS !== r.bloomS) issues.push('bloom does not end at bloomS')

  const sum = r.steps.reduce((a, s) => a + s.amountG, 0)
  if (sum !== r.waterG) issues.push(`step waters sum to ${sum} g, not ${r.waterG} g`)

  let running = 0
  r.steps.forEach((s, i) => {
    running += s.amountG
    if (s.targetG !== running) issues.push(`step ${i + 1} target ${s.targetG} g should be ${running} g`)
    if (s.pourEndS < s.startS || s.endS < s.pourEndS) issues.push(`step ${i + 1} times run backwards`)
    const next = r.steps[i + 1]
    if (next && next.startS < s.pourEndS) issues.push(`step ${i + 2} starts before step ${i + 1} finishes pouring`)
    if (next && next.startS <= s.startS) issues.push(`step ${i + 2} does not start after step ${i + 1}`)
  })
  const last = r.steps[r.steps.length - 1]
  if (last && last.endS !== r.totalTimeS) issues.push(`last step ends at ${last.endS} s, not ${r.totalTimeS} s`)
  if (r.rationale && r.rationale.length > 400) issues.push('rationale over 400 characters')
  return issues
}

export function isValidRecipe(recipe: unknown): recipe is Recipe {
  return checkRecipe(recipe).length === 0
}
