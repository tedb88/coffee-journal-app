// Today answers "What should I brew this morning?" (UX design §2): the bag to
// brew next, chosen from the shelf by freshness, then by what was brewed last.

import { freshness } from '../domain/beans/freshness.js'
import type { Bean, Brew } from '../domain/schemas.js'

const RANK = { peak: 0, none: 1, resting: 2, fading: 3 } as const

export function onShelf(beans: Bean[]): Bean[] {
  return beans.filter((b) => b.status === 'active' && (b.remainingG === null || b.remainingG > 0))
}

export function pickNextBean(beans: Bean[], brews: Brew[], today: Date): Bean | null {
  const lastBrewAt = new Map<string, string>()
  for (const b of brews) if ((lastBrewAt.get(b.beanId) ?? '') < b.createdAt) lastBrewAt.set(b.beanId, b.createdAt)
  const shelf = onShelf(beans)
  if (shelf.length === 0) return null
  const rank = (b: Bean) => RANK[freshness(b, today)?.state ?? 'none']
  return [...shelf].sort((a, b) => rank(a) - rank(b) || (lastBrewAt.get(b.id) ?? b.createdAt).localeCompare(lastBrewAt.get(a.id) ?? a.createdAt))[0]
}
