import { GRIND_SCALE, grindIndex, shiftGrind, type Grind } from '../enums.js'
import { V60 } from '../rules/index.js'

/** The decisions a recipe is made from. Waters and timings are calculated from these. */
export interface RecipeParams {
  doseG: number
  ratio: number
  tempC: number
  grind: Grind
  bloomS: number
  totalS: number
  /** Pours after the bloom. */
  pours: number
  /** Relative size of each pour after the bloom; equal when omitted. */
  pourWeights?: number[]
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function clampGrind(g: Grind): Grind {
  const b = V60.bounds.grind
  const i = clampNum(grindIndex(g), grindIndex(b.min), grindIndex(b.max))
  return GRIND_SCALE[i]
}

/** Force every parameter inside the V60 safe ranges (RCP-04). Records which ones moved. */
export function clampParams(p: RecipeParams): { params: RecipeParams; clamped: string[] } {
  const b = V60.bounds
  const clamped: string[] = []
  const pick = <T>(name: string, before: T, after: T): T => {
    if (before !== after) clamped.push(name)
    return after
  }
  const pours = pick('pours', p.pours, clampNum(Math.round(p.pours), b.pours.min, b.pours.max))
  let pourWeights = p.pourWeights
  if (pourWeights && (pourWeights.length !== pours || pourWeights.some((w) => !(w > 0) || !Number.isFinite(w)))) {
    clamped.push('pourWeights')
    pourWeights = undefined
  }
  return {
    params: {
      doseG: pick('doseG', p.doseG, clampNum(Math.round(p.doseG), b.doseG.min, b.doseG.max)),
      ratio: pick('ratio', p.ratio, clampNum(Math.round(p.ratio), b.ratio.min, b.ratio.max)),
      tempC: pick('tempC', p.tempC, clampNum(Math.round(p.tempC), b.tempC.min, b.tempC.max)),
      grind: pick('grind', p.grind, clampGrind(p.grind)),
      bloomS: pick('bloomS', p.bloomS, clampNum(Math.round(p.bloomS), b.bloomS.min, b.bloomS.max)),
      totalS: pick('totalS', p.totalS, clampNum(Math.round(p.totalS), b.totalS.min, b.totalS.max)),
      pours,
      ...(pourWeights ? { pourWeights } : {}),
    },
    clamped,
  }
}

export { shiftGrind }
