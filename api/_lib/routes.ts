// The two AI endpoints as plain functions of (request, deps), so they can be
// tested without a server. api/scan.ts and api/recipe.ts wrap them.

import { z } from 'zod'
import { buildRecipe, baselineRecipe } from '../../src/domain/recipe/engine.js'
import { baselineParams } from '../../src/domain/recipe/baseline.js'
import { AdjustmentPlanSchema } from '../../src/domain/recipe/adjust.js'
import { BeanAttributesSchema, PreferencesSchema, type Recipe } from '../../src/domain/schemas.js'
import { normaliseScan, ScanModelOutputSchema } from '../../src/domain/scan.js'
import { RECIPE_PROMPT_VERSION, SCAN_PROMPT, SCAN_PROMPT_VERSION, recipeSystemPrompt } from './ai/prompts.js'
import { callJson } from './ai/gateway.js'
import { capReached, guard, missingProtection } from './protect.js'
import type { ApiRequest, ApiResponse, Deps } from './types.js'

export const MAX_IMAGE_BASE64 = 4_000_000
export const MAX_RECIPE_BODY = 20_000
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const ScanRequestSchema = z.object({
  imageBase64: z
    .string()
    .min(100)
    .max(MAX_IMAGE_BASE64)
    .regex(/^[A-Za-z0-9+/=]+$/, 'base64'),
  mimeType: z.enum(IMAGE_TYPES as [string, ...string[]]),
})

export const RecipeRequestSchema = z.object({
  bean: BeanAttributesSchema,
  doseG: z.number().int().min(5).max(60).nullable().optional(),
  preferences: PreferencesSchema.nullable().optional(),
  history: z
    .array(
      z.object({
        rating: z.number().int().min(1).max(5).nullable(),
        sourBitter: z.number().int().min(-2).max(2).nullable(),
        strength: z.number().int().min(-2).max(2).nullable(),
      }),
    )
    .max(3)
    .optional(),
})
export type RecipeRequest = z.infer<typeof RecipeRequestSchema>

const ok = (body: unknown): ApiResponse => ({ status: 200, body })
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ApiResponse => ({ status, body: { error, ...extra } })

async function aiBlocked(deps: Deps): Promise<string | null> {
  const missing = missingProtection(deps.env)
  if (missing.length) {
    deps.log({ event: 'ai_disabled', reason: 'protection_not_configured', missing })
    return 'protection'
  }
  if (await capReached(deps)) {
    deps.log({ event: 'ai_disabled', reason: 'monthly_cap' })
    return 'cap'
  }
  return null
}

/** AI-01 without the request checks: also what the eval harness runs. */
export async function readLabel(image: { imageBase64: string; mimeType: string }, deps: Deps) {
  const res = await callJson(
    {
      capability: 'scan',
      promptVersion: SCAN_PROMPT_VERSION,
      schema: ScanModelOutputSchema,
      temperature: 0,
      maxTokens: 700,
      timeoutMs: 25000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.imageBase64}` } },
            { type: 'text', text: SCAN_PROMPT },
          ],
        },
      ],
    },
    deps,
  )
  return { scan: normaliseScan(res.data, deps.now(), { model: res.model, promptVersion: SCAN_PROMPT_VERSION }), costUsd: res.costUsd }
}

export async function scanRoute(req: ApiRequest, deps: Deps): Promise<ApiResponse> {
  const stop = await guard(req, 'scan', deps)
  if (stop) return stop
  const parsed = ScanRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    const tooBig = parsed.error.issues.some((i) => i.code === 'too_big')
    return tooBig
      ? fail(413, 'That photo is too large. Try again: the app shrinks it before sending.')
      : fail(400, 'Send a JPEG, PNG or WebP photo of the label.')
  }
  const blocked = await aiBlocked(deps)
  if (blocked) return fail(503, 'Label reading is not available right now. Type the details in instead.', { manual: true })

  try {
    return ok((await readLabel(parsed.data, deps)).scan)
  } catch {
    return fail(502, 'We could not read this label. Try a sharper photo, or type the details in.', { manual: true })
  }
}

function recipeUserMessage(r: RecipeRequest, days: number | null, baseline: Recipe): string {
  return JSON.stringify({
    coffee: {
      origin: r.bean.originCountry,
      region: r.bean.region,
      process: r.bean.process,
      roastLevel: r.bean.roastLevel,
      varieties: r.bean.varieties,
      altitude: r.bean.altitude,
      labelNotes: r.bean.labelNotes,
      daysSinceRoast: days,
    },
    preferences: r.preferences ?? null,
    baseline: {
      doseG: baseline.doseG,
      ratio: baseline.ratio,
      tempC: baseline.tempC,
      grind: baseline.grind,
      bloomS: baseline.bloomS,
      totalTimeS: baseline.totalTimeS,
      pours: baseline.steps.filter((s) => s.kind === 'pour').length,
    },
    recentBrewsOfThisBag: r.history ?? [],
  })
}

/** AI-02 without the request checks: also what the eval harness runs. Throws when AI is unavailable. */
export async function personaliseRecipe(r: RecipeRequest, deps: Deps) {
  const input = { bean: r.bean, doseG: r.doseG ?? null, preferences: r.preferences ?? null, today: deps.now() }
  const baseline = baselineRecipe(input)
  const days = baselineParams(input).daysOffRoast
  const res = await callJson(
    {
      capability: 'recipe',
      promptVersion: RECIPE_PROMPT_VERSION,
      schema: AdjustmentPlanSchema,
      temperature: 0.25,
      maxTokens: 500,
      timeoutMs: 15000,
      messages: [
        { role: 'system', content: recipeSystemPrompt() },
        { role: 'user', content: recipeUserMessage(r, days, baseline) },
      ],
    },
    deps,
  )
  const built = buildRecipe(input, res.data, { promptVersion: RECIPE_PROMPT_VERSION, model: res.model })
  if (built.clamped.length) deps.log({ event: 'recipe_clamped', fields: built.clamped })
  return { ...built, plan: res.data, costUsd: res.costUsd }
}

export async function recipeRoute(req: ApiRequest, deps: Deps): Promise<ApiResponse> {
  const stop = await guard(req, 'recipe', deps)
  if (stop) return stop
  if (JSON.stringify(req.body ?? null).length > MAX_RECIPE_BODY) return fail(413, 'That request is too large.')
  const parsed = RecipeRequestSchema.safeParse(req.body)
  if (!parsed.success) return fail(400, 'Send the coffee’s details to build a recipe.')
  const r = parsed.data
  const input = { bean: r.bean, doseG: r.doseG ?? null, preferences: r.preferences ?? null, today: deps.now() }

  // RCP-06: the baseline is always available; the server never trusts numbers from the client.
  const baseline = baselineRecipe(input)
  const blocked = await aiBlocked(deps)
  if (blocked) return ok({ recipe: baseline, fallback: true, reason: blocked })

  try {
    const built = await personaliseRecipe(r, deps)
    return ok({ recipe: built.recipe, fallback: built.usedBaseline, ...(built.usedBaseline ? { reason: 'invalid' } : {}) })
  } catch {
    return ok({ recipe: baseline, fallback: true, reason: 'ai-error' })
  }
}
