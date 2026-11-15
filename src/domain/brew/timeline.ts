// Guided brew (BRW-01, BRW-04, BRW-07): what the brewer does at each second of
// a recipe. Pure, so the timer only supplies elapsed seconds.

import { formatTime } from '../recipe/format.js'
import type { Recipe, Step } from '../schemas.js'

export type BrewPhase = 'pour' | 'wait' | 'drawdown' | 'done'

export interface BrewState {
  phase: BrewPhase
  /** Index into recipe.steps of the current step. */
  stepIndex: number
  /** Changes whenever the brewer has to do something new; drives the step cue (BRW-03). */
  key: string
  phaseLabel: string
  lead: string
  /** The answer, read at arm's length: the weight to pour to, or the time left. */
  big: string
  how: string
  countdown: string
  /** 0–1 through the current phase. */
  progress: number
  /** Preview of the upcoming step (BRW-01). */
  next: string
}

const fmt = (s: number) => formatTime(Math.max(0, Math.ceil(s)))

function pourNumber(steps: Step[], i: number): { n: number; of: number } {
  const pours = steps.filter((s) => s.kind !== 'drawdown')
  return { n: pours.indexOf(steps[i]) + 1, of: pours.length }
}

function stepPreview(steps: Step[], i: number, total: number): string {
  const s = steps[i]
  if (!s) return 'Rate the cup and get one change for the next brew.'
  if (s.kind === 'drawdown') return `Next at ${formatTime(s.startS)}: let it draw down until ${formatTime(total)}.`
  return `Next at ${formatTime(s.startS)}: pour to ${s.targetG} g.`
}

export function brewState(recipe: Recipe, elapsedS: number): BrewState {
  const steps = recipe.steps
  const total = recipe.totalTimeS
  const t = Math.max(0, Math.min(total, elapsedS))

  if (t >= total) {
    return {
      phase: 'done',
      stepIndex: steps.length - 1,
      key: 'done',
      phaseLabel: 'Brew finished',
      lead: 'Done at',
      big: formatTime(total),
      how: 'Give the cup a swirl and taste it while it is hot, then again as it cools.',
      countdown: 'Rate it next. It takes 15 seconds.',
      progress: 1,
      next: 'Rate the cup and get one change for the next brew.',
    }
  }

  let i = 0
  for (let j = 0; j < steps.length; j++) if (t >= steps[j].startS) i = j
  const s = steps[i]

  if (s.kind === 'drawdown') {
    return {
      phase: 'drawdown',
      stepIndex: i,
      key: `${i}:drawdown`,
      phaseLabel: 'Draw down',
      lead: 'Wait',
      big: fmt(total - t),
      how: s.note || 'Hands off. It is done when the bed is flat.',
      countdown: `Finishes at ${formatTime(total)}`,
      progress: (t - s.startS) / Math.max(1, total - s.startS),
      next: 'Rate the cup and get one change for the next brew.',
    }
  }

  const { n, of } = pourNumber(steps, i)
  if (t < s.pourEndS) {
    return {
      phase: 'pour',
      stepIndex: i,
      key: `${i}:pour`,
      phaseLabel: s.kind === 'bloom' ? 'Bloom' : `${s.label} · pour ${n} of ${of}`,
      lead: 'Pour to',
      big: `${s.targetG} g`,
      how: s.note,
      countdown: `${Math.ceil(s.pourEndS - t)} s left for this pour`,
      progress: (t - s.startS) / Math.max(1, s.pourEndS - s.startS),
      next: stepPreview(steps, i + 1, total),
    }
  }

  const after = steps[i + 1]
  return {
    phase: 'wait',
    stepIndex: i,
    key: `${i}:wait`,
    phaseLabel: `${s.label} · wait`,
    lead: after && after.kind !== 'drawdown' ? 'Next pour in' : 'Draw down in',
    big: fmt(s.endS - t),
    how: s.kind === 'bloom' ? 'Blooming. Let the gas escape.' : 'Let the water drop to just above the bed.',
    countdown: after && after.kind !== 'drawdown' ? `At ${formatTime(s.endS)}, pour to ${after.targetG} g` : `At ${formatTime(s.endS)}, let it draw down`,
    progress: (t - s.pourEndS) / Math.max(1, s.endS - s.pourEndS),
    next: stepPreview(steps, i + 1, total),
  }
}

/** BRW-04 skip: the next moment something changes (end of a pour, start of the next step, the end). */
export function nextMark(recipe: Recipe, elapsedS: number): number {
  const marks = recipe.steps.flatMap((s) => [s.startS, s.pourEndS, s.endS]).concat(recipe.totalTimeS)
  const later = marks.filter((m) => m > elapsedS + 0.01)
  return later.length ? Math.min(...later) : recipe.totalTimeS
}

/** Cumulative water on the scale at a moment, for the pour chart's "now" mark. */
export function waterAt(recipe: Recipe, elapsedS: number): number {
  let water = 0
  for (const s of recipe.steps) {
    if (elapsedS >= s.pourEndS) water = s.targetG
    else if (elapsedS > s.startS && s.amountG > 0) return Math.round(water + ((elapsedS - s.startS) / Math.max(1, s.pourEndS - s.startS)) * s.amountG)
  }
  return water
}

/** A tiny timer that cannot drift: elapsed time is measured, not counted (BRW-01, Solution Plan §4.5). */
export interface Clock {
  running: boolean
  /** Seconds banked before the current run. */
  base: number
  /** Timestamp (ms) the current run started. */
  since: number
}

export const stoppedClock = (base = 0): Clock => ({ running: false, base, since: 0 })
export const elapsed = (c: Clock, nowMs: number): number => c.base + (c.running ? (nowMs - c.since) / 1000 : 0)
export const startClock = (c: Clock, nowMs: number): Clock => (c.running ? c : { running: true, base: c.base, since: nowMs })
export const pauseClock = (c: Clock, nowMs: number): Clock => (c.running ? stoppedClock(elapsed(c, nowMs)) : c)
export const jumpClock = (c: Clock, toS: number, nowMs: number): Clock => (c.running ? { running: true, base: toS, since: nowMs } : stoppedClock(toS))
export { fmt as formatCountdown }
