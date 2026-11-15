import { label } from '../enums.js'
import type { Recipe } from '../schemas.js'

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function parseTime(text: string | null | undefined): number | null {
  const m = String(text ?? '').match(/(\d+):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** The display shape the current screens render (Recipe card, journal). */
export interface RecipeDisplay {
  coffeeAmount: string
  waterAmount: string
  ratio: string
  waterTemp: string
  grindSize: string
  totalTime: string
  steps: Array<{ name: string; water: string; waitUntil: string; notes: string }>
  tips: string
}

export function formatRecipe(recipe: Recipe): RecipeDisplay {
  if (recipe.source === 'legacy' && recipe.legacyGuide) return recipe.legacyGuide as unknown as RecipeDisplay
  return {
    coffeeAmount: `${recipe.doseG} g`,
    waterAmount: `${recipe.waterG} g`,
    ratio: `1:${recipe.ratio}`,
    waterTemp: `${recipe.tempC} °C`,
    grindSize: label(recipe.grind),
    totalTime: formatTime(recipe.totalTimeS),
    steps: recipe.steps.map((s) => ({
      name: s.label,
      water: s.kind === 'drawdown' ? '' : `to ${s.targetG} g`,
      waitUntil: formatTime(s.kind === 'drawdown' ? s.endS : s.pourEndS),
      notes: s.note,
    })),
    tips: [recipe.rationale, recipe.expectedCup].filter(Boolean).join(' '),
  }
}
