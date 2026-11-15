// BEAN-02 and BEAN-03: the numbers a bag page shows.

import type { Bean, Brew } from '../schemas.js'
import { bestBrew } from '../dialin/next.js'

export interface BeanStats {
  brewCount: number
  /** Mean of the rated brews, one decimal; null when none is rated. */
  averageRating: number | null
  best: Brew | null
  /** Whole doses left at this dose; null when the bag weight is unknown. */
  dosesLeft: number | null
  /** BEAN-03: at most one dose left, so offer to mark the bag finished. */
  nearlyEmpty: boolean
  usedFraction: number | null
}

export function beanStats(bean: Pick<Bean, 'remainingG' | 'netWeightG' | 'status'>, brews: Brew[], doseG: number): BeanStats {
  const rated = brews.filter((b) => b.rating !== null)
  const avg = rated.length ? Math.round((rated.reduce((n, b) => n + (b.rating ?? 0), 0) / rated.length) * 10) / 10 : null
  const left = bean.remainingG
  return {
    brewCount: brews.length,
    averageRating: avg,
    best: bestBrew(brews),
    dosesLeft: left === null ? null : Math.floor(left / Math.max(1, doseG)),
    nearlyEmpty: bean.status === 'active' && left !== null && left <= doseG,
    usedFraction: left !== null && bean.netWeightG ? Math.max(0, Math.min(1, left / bean.netWeightG)) : null,
  }
}
