// Canonical enumerations (DR-01). Stored values are lower-case slugs;
// `label()` gives the sentence-case display text.

export const PROCESSES = ['washed', 'natural', 'honey', 'anaerobic', 'wet-hulled'] as const
export type Process = (typeof PROCESSES)[number]

export const ROAST_LEVELS = ['light', 'medium-light', 'medium', 'medium-dark', 'dark'] as const
export type RoastLevel = (typeof ROAST_LEVELS)[number]

/** Grind descriptors, finest first. Shifting a grind moves along this list. */
export const GRIND_SCALE = ['fine', 'medium-fine', 'medium', 'medium-coarse', 'coarse'] as const
export type Grind = (typeof GRIND_SCALE)[number]

export const METHODS = ['v60'] as const
export type Method = (typeof METHODS)[number]

export const BEAN_STATUSES = ['active', 'finished', 'archived'] as const
export type BeanStatus = (typeof BEAN_STATUSES)[number]

export const RECIPE_SOURCES = ['ai', 'rules', 'user', 'legacy'] as const
export type RecipeSource = (typeof RECIPE_SOURCES)[number]

/** "medium-light" → "Medium-light", "wet-hulled" → "Wet-hulled". */
export function label(value: string | null | undefined): string {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function shiftGrind(grind: Grind, steps: number): Grind {
  const i = GRIND_SCALE.indexOf(grind)
  const next = Math.max(0, Math.min(GRIND_SCALE.length - 1, i + Math.round(steps)))
  return GRIND_SCALE[next]
}

export function grindIndex(grind: Grind): number {
  return GRIND_SCALE.indexOf(grind)
}
