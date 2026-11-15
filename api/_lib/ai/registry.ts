// AIP-6 and AIP-9: providers come from configuration, in order (primary,
// failover, then the legacy Groq setup kept running until the migration),
// and only open-weight models are accepted.

import type { Env } from '../types.js'

export type Capability = 'scan' | 'recipe'

export interface Provider {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  /** US$ per million tokens, used for the spend cap. */
  priceInPerM: number
  priceOutPerM: number
}

/** Hosted-only tiers of otherwise open families, and closed model families. */
const HOSTED_ONLY = [/qwen[\w.-]*[-_](plus|max|turbo|flash|long)(\b|$)/i, /^(gpt-(?!oss)|o\d|claude|gemini)/i]
const OPEN_FAMILIES = [
  /qwen/i,
  /gemma/i,
  /llama/i,
  /gpt-oss/i,
  /mistral|mixtral|ministral|pixtral/i,
  /deepseek/i,
  /glm/i,
  /internvl/i,
  /minicpm/i,
  /paddleocr/i,
  /kimi/i,
  /phi-\d/i,
]

export function isOpenWeightModel(model: string): boolean {
  const name = model.split('/').pop() ?? model
  if (HOSTED_ONLY.some((r) => r.test(name))) return false
  return OPEN_FAMILIES.some((r) => r.test(model))
}

export const LEGACY_GROQ = {
  baseUrl: 'https://api.groq.com/openai/v1',
  models: { scan: 'meta-llama/llama-4-scout-17b-16e-instruct', recipe: 'llama-3.3-70b-versatile' } as Record<Capability, string>,
  prices: { scan: [0.11, 0.34], recipe: [0.59, 0.79] } as Record<Capability, [number, number]>,
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export interface Resolution {
  providers: Provider[]
  rejected: Array<{ name: string; model: string }>
}

export function resolveProviders(cap: Capability, env: Env): Resolution {
  const candidates: Provider[] = []
  const key = cap === 'scan' ? 'SCAN' : 'RECIPE'
  for (const prefix of ['AI', 'AI_FALLBACK']) {
    const baseUrl = env[`${prefix}_BASE_URL`]
    const apiKey = env[`${prefix}_API_KEY`]
    const model = env[`${prefix}_${key}_MODEL`]
    if (baseUrl && apiKey && model) {
      candidates.push({
        name: env[`${prefix}_PROVIDER_NAME`] ?? (prefix === 'AI' ? 'primary' : 'fallback'),
        baseUrl: baseUrl.replace(/\/$/, ''),
        apiKey,
        model,
        // Conservative defaults (the high end of Solution Plan §7.1) until real prices are set.
        priceInPerM: num(env[`${prefix}_PRICE_IN_PER_M`], 0.3),
        priceOutPerM: num(env[`${prefix}_PRICE_OUT_PER_M`], 1.2),
      })
    }
  }
  if (env.GROQ_API_KEY && env.AI_DISABLE_LEGACY_GROQ !== 'true') {
    const [pin, pout] = LEGACY_GROQ.prices[cap]
    candidates.push({
      name: 'groq-legacy',
      baseUrl: LEGACY_GROQ.baseUrl,
      apiKey: env.GROQ_API_KEY,
      model: LEGACY_GROQ.models[cap],
      priceInPerM: pin,
      priceOutPerM: pout,
    })
  }
  const rejected = candidates.filter((p) => !isOpenWeightModel(p.model)).map((p) => ({ name: p.name, model: p.model }))
  return { providers: candidates.filter((p) => isOpenWeightModel(p.model)), rejected }
}

export function costUsd(p: Provider, tokensIn: number, tokensOut: number): number {
  return (tokensIn * p.priceInPerM + tokensOut * p.priceOutPerM) / 1_000_000
}
