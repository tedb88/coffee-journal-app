// Waters and timings from parameters. Arithmetic lives here, never in a model:
// every pour sums exactly to the total and times always move forward (RCP-04).

import { V60 } from '../rules/index.js'
import type { Step } from '../schemas.js'
import type { RecipeParams } from './params.js'

const POUR_NAMES = ['First pour', 'Second pour', 'Third pour', 'Fourth pour', 'Fifth pour']

export interface Calculated {
  waterG: number
  bloomG: number
  steps: Step[]
}

/** Split `total` into integer parts in proportion to `weights`, summing exactly to `total`. */
export function splitExact(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map((w) => (w / sum) * total)
  const parts = raw.map(Math.floor)
  let left = total - parts.reduce((a, b) => a + b, 0)
  // hand the remainder to the largest fractional parts, earliest first on ties
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k].i]++
  return parts
}

export function calculate(params: RecipeParams, stepNotes: string[] = []): Calculated {
  const { doseG, ratio, bloomS, totalS, pours } = params
  const waterG = Math.round(doseG * ratio)
  const bloomG = Math.min(Math.round(doseG * V60.bloomWaterPerGram), Math.floor(waterG / 3))
  const amounts = splitExact(waterG - bloomG, params.pourWeights ?? Array(pours).fill(1))

  let window = V60.pourWindowS
  let gap = V60.pourGapS
  let slot = window + gap
  if (totalS - (bloomS + pours * slot - gap) < V60.minDrawdownS) {
    slot = Math.floor((totalS - V60.minDrawdownS - bloomS) / pours)
    window = Math.max(8, Math.floor((slot * 2) / 3))
    gap = Math.max(0, slot - window)
  }

  const steps: Step[] = [
    {
      kind: 'bloom',
      label: 'Bloom',
      startS: 0,
      pourEndS: Math.min(V60.bloomPourS, bloomS),
      endS: bloomS,
      amountG: bloomG,
      targetG: bloomG,
      note: stepNotes[0] ?? `Pour ${bloomG} g to wet every ground, swirl once, then wait.`,
    },
  ]
  let target = bloomG
  for (let i = 0; i < pours; i++) {
    const startS = bloomS + i * slot
    const pourEndS = startS + window
    target += amounts[i]
    const last = i === pours - 1
    steps.push({
      kind: 'pour',
      label: last && pours > 1 ? 'Last pour' : POUR_NAMES[i],
      startS,
      pourEndS,
      endS: last ? pourEndS : startS + slot,
      amountG: amounts[i],
      targetG: target,
      note: stepNotes[i + 1] ?? (last ? 'Finish the circles, then one gentle swirl.' : 'Slow circles from the centre out. Keep off the paper.'),
    })
  }
  const drawStart = steps[steps.length - 1].pourEndS
  steps.push({
    kind: 'drawdown',
    label: 'Draw down',
    startS: drawStart,
    pourEndS: drawStart,
    endS: totalS,
    amountG: 0,
    targetG: waterG,
    note: stepNotes[pours + 1] ?? 'Hands off. It is done when the bed is flat.',
  })
  return { waterG, bloomG, steps }
}
