// What one journey carries from screen to screen: a scan on its way to Check the
// label, and a recipe on its way through the timer to Taste. The recipe draft
// survives a reload (sessionStorage); photo bytes stay in memory only.

import type { PhotoInput } from '../data/repositories.js'
import type { Recipe } from '../domain/schemas.js'
import type { ScanResult } from '../domain/scan.js'

export interface PendingScan {
  photo: PhotoInput | null
  previewUrl: string | null
  /** The image as sent to the API, kept so Try again does not need a new photo (CAP-08). */
  api: { base64: string; mimeType: string } | null
  result: ScanResult | null
  error: string | null
}

export interface BrewDraft {
  beanId: string
  recipe: Recipe
  brewNumber: number
  /** The brew whose suggestion this recipe applies (DIAL-03). */
  appliedFrom: string | null
  /** Grinder clicks the plan expects, to pre-fill Taste. */
  clicks: number | null
  /** Set when the timer stops: the brew time as it happened (BRW-07). */
  actualTimeS: number | null
  guided: boolean
  /** Why the recipe is a standard one, when AI was not used (RCP-06). */
  fallbackReason: string | null
}

const DRAFT_KEY = 'brewmap_brew_draft'
let scan: PendingScan | null = null
let draft: BrewDraft | null = null

export function setScan(s: PendingScan | null): void {
  if (scan?.previewUrl && scan.previewUrl !== s?.previewUrl) URL.revokeObjectURL(scan.previewUrl)
  scan = s
}
export const getScan = (): PendingScan | null => scan

export function getDraft(): BrewDraft | null {
  if (draft) return draft
  try {
    draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as BrewDraft | null
  } catch {
    draft = null
  }
  return draft
}

export function setDraft(d: BrewDraft | null): void {
  draft = d
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* private mode: the draft lives for this page only */
  }
}
