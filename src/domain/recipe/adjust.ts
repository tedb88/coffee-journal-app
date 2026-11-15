// The bounded adjustment plan an AI model may propose (AI-02). The model
// chooses; code clamps and calculates.

import { z } from 'zod'
import { shiftGrind } from '../enums.js'
import { AI_ADJUSTMENT_BOUNDS, V60 } from '../rules/index.js'
import { clampParams, type RecipeParams } from './params.js'

export const AdjustmentPlanSchema = z.object({
  tempDeltaC: z.number().default(0),
  ratioDelta: z.number().default(0),
  grindStepDelta: z.number().default(0),
  bloomS: z.number().nullable().optional(),
  pourCount: z.number().nullable().optional(),
  pourWeights: z.array(z.number()).nullable().optional(),
  stepNotes: z.array(z.string().max(160)).max(8).nullable().optional(),
  expectedCup: z.string().max(200).nullable().optional(),
  rationale: z.string().max(400),
})
export type AdjustmentPlan = z.infer<typeof AdjustmentPlanSchema>

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, Math.round(v)))

export function applyAdjustment(base: RecipeParams, plan: AdjustmentPlan): { params: RecipeParams; clamped: string[] } {
  const b = AI_ADJUSTMENT_BOUNDS
  const clamped: string[] = []
  const t = clamp(plan.tempDeltaC, b.tempC)
  const r = clamp(plan.ratioDelta, b.ratio)
  const g = clamp(plan.grindStepDelta, b.grindSteps)
  if (t !== Math.round(plan.tempDeltaC)) clamped.push('tempDeltaC')
  if (r !== Math.round(plan.ratioDelta)) clamped.push('ratioDelta')
  if (g !== Math.round(plan.grindStepDelta)) clamped.push('grindStepDelta')

  const pours = plan.pourCount ?? base.pours
  const weights = plan.pourWeights && plan.pourWeights.length === pours ? plan.pourWeights : undefined
  const next: RecipeParams = {
    ...base,
    tempC: base.tempC + t,
    ratio: base.ratio + r,
    grind: shiftGrind(base.grind, g),
    bloomS: plan.bloomS ?? base.bloomS,
    pours,
    ...(weights ? { pourWeights: weights } : { pourWeights: undefined }),
  }
  if (plan.pourWeights && !weights) clamped.push('pourWeights')
  const res = clampParams(next)
  return { params: res.params, clamped: [...clamped, ...res.clamped] }
}

export const PLAN_LIMITS = { ...AI_ADJUSTMENT_BOUNDS, bloomS: V60.bounds.bloomS, pours: V60.bounds.pours }
