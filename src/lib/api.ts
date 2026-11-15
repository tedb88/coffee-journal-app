// The client side of /api/scan and /api/recipe. Neither call can strand the
// user: a failed scan offers manual entry (CAP-08) and a failed recipe
// falls back to the rules engine on the device (RCP-06).

import { baselineRecipe } from '../domain/recipe/engine.js'
import { isValidRecipe } from '../domain/recipe/validate.js'
import { RecipeSchema, type BeanAttributes, type Preferences, type Recipe } from '../domain/schemas.js'
import type { ScanResult } from '../domain/scan.js'
import { deviceId } from './device.js'
import { getTurnstileToken } from './turnstile.js'

export type ScanOutcome = { ok: true; scan: ScanResult } | { ok: false; manual: boolean; message: string }

export interface RecipeOutcome {
  recipe: Recipe
  /** True when the recipe came from the rules engine rather than AI. */
  fallback: boolean
  reason: string | null
}

export interface RecipeRequest {
  bean: BeanAttributes
  doseG: number | null
  preferences: Preferences | null
}

interface Options {
  fetch?: typeof fetch
  token?: () => Promise<string | undefined>
  today?: Date
}

async function headers(opts: Options): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Device-Id': deviceId() }
  const token = await (opts.token ?? getTurnstileToken)()
  if (token) h['X-Turnstile-Token'] = token
  return h
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = await res.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function scanLabel(image: { base64: string; mimeType: string }, opts: Options = {}): Promise<ScanOutcome> {
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis)
  let res: Response
  try {
    res = await f('/api/scan', { method: 'POST', headers: await headers(opts), body: JSON.stringify({ imageBase64: image.base64, mimeType: image.mimeType }) })
  } catch {
    return {
      ok: false,
      manual: true,
      message: 'You seem to be offline, so the label could not be read. Type the details in, or try again when you are connected.',
    }
  }
  const body = await readJson(res)
  if (res.ok && body && typeof body.fields === 'object' && body.fields) return { ok: true, scan: body as unknown as ScanResult }
  const message = typeof body?.error === 'string' ? body.error : 'We could not read this label. Try a sharper photo, or type the details in.'
  return { ok: false, manual: body?.manual !== false, message }
}

export async function getRecipe(req: RecipeRequest, opts: Options = {}): Promise<RecipeOutcome> {
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis)
  const local = (reason: string): RecipeOutcome => ({
    recipe: baselineRecipe({ bean: req.bean, doseG: req.doseG, preferences: req.preferences, today: opts.today ?? new Date() }),
    fallback: true,
    reason,
  })
  let res: Response
  try {
    res = await f('/api/recipe', { method: 'POST', headers: await headers(opts), body: JSON.stringify(req) })
  } catch {
    return local('offline')
  }
  const body = await readJson(res)
  const parsed = RecipeSchema.safeParse(body?.recipe)
  // The device re-checks what the server sends; an invalid recipe is never shown (RCP-05).
  if (res.ok && parsed.success && isValidRecipe(parsed.data)) {
    return { recipe: parsed.data, fallback: body?.fallback === true, reason: typeof body?.reason === 'string' ? body.reason : null }
  }
  return local(res.ok ? 'invalid' : `http-${res.status}`)
}
