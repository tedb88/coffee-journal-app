// OPS-01, OPS-02, NFR-07: bot check, rate limits and the monthly AI spend cap.

import { createHash } from 'node:crypto'
import { kvConfig } from './kv.js'
import type { ApiRequest, ApiResponse, Deps, Env, Kv } from './types.js'

export type Route = 'scan' | 'recipe'

export const LIMITS: Record<Route, Array<{ name: string; windowS: number; max: number }>> = {
  scan: [
    { name: 'hour', windowS: 3600, max: 10 },
    { name: 'day', windowS: 86400, max: 30 },
  ],
  recipe: [
    { name: 'hour', windowS: 3600, max: 30 },
    { name: 'day', windowS: 86400, max: 100 },
  ],
}
export const GLOBAL_DAILY_AI_CALLS = 2000
/** D12: US$20 a month, unless overridden. */
export const DEFAULT_MONTHLY_CAP_USD = 20
export const ALERT_LEVELS = [0.5, 0.8, 1]

export function isProduction(env: Env): boolean {
  return env.VERCEL_ENV === 'production'
}

/**
 * What is missing before AI may run in production. Without bot protection and
 * a shared counter store, limits and the cap cannot hold across instances, so
 * AI stays off (the app falls back to manual entry and rules recipes) unless
 * the owner sets ALLOW_UNPROTECTED_AI=true on purpose.
 */
export function missingProtection(env: Env): string[] {
  if (!isProduction(env) || env.ALLOW_UNPROTECTED_AI === 'true') return []
  const missing: string[] = []
  if (!env.TURNSTILE_SECRET_KEY) missing.push('TURNSTILE_SECRET_KEY')
  if (!kvConfig(env)) missing.push('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN')
  return missing
}

export function clientKey(req: ApiRequest): string {
  const device = (req.headers['x-device-id'] ?? '').slice(0, 64)
  return createHash('sha256').update(`${req.ip}|${device}`).digest('hex').slice(0, 32)
}

export async function verifyTurnstile(token: string | undefined, ip: string, deps: Deps): Promise<boolean> {
  const secret = deps.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false
  try {
    const res = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}

function windowKey(prefix: string, windowS: number, now: Date): string {
  return `${prefix}:${windowS}:${Math.floor(now.getTime() / 1000 / windowS)}`
}

const json = (status: number, body: unknown, headers?: Record<string, string>): ApiResponse => ({ status, body, headers })

/** Method, bot check and rate limits. Returns a response to send when the request must stop here. */
export async function guard(req: ApiRequest, route: Route, deps: Deps): Promise<ApiResponse | null> {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' }, { Allow: 'POST' })

  if (!(await verifyTurnstile(req.headers['x-turnstile-token'], req.ip, deps))) {
    deps.log({ event: 'bot_check_failed', route })
    return json(403, { error: 'We could not confirm this request came from the BrewMap app. Reload the page and try again.' })
  }

  const key = clientKey(req)
  const now = deps.now()
  for (const lim of LIMITS[route]) {
    const count = await deps.kv.incrBy(windowKey(`rl:${route}:${key}`, lim.windowS, now), 1, lim.windowS)
    if (count > lim.max) {
      deps.log({ event: 'rate_limited', route, window: lim.name })
      const retry = lim.windowS - (Math.floor(now.getTime() / 1000) % lim.windowS)
      return json(
        429,
        {
          error:
            route === 'scan'
              ? `That is a lot of scans in one ${lim.name}. Wait a while, or type the details in.`
              : `That is a lot of recipes in one ${lim.name}. Wait a while and try again.`,
        },
        { 'Retry-After': String(retry) },
      )
    }
  }
  const global = await deps.kv.incrBy(windowKey('rl:global', 86400, now), 1, 86400)
  if (global > GLOBAL_DAILY_AI_CALLS) {
    deps.log({ event: 'global_limit', route })
    return json(429, { error: 'BrewMap is very busy today. Try again tomorrow.' })
  }
  return null
}

export function monthlyCapUsd(env: Env): number {
  const v = Number(env.AI_MONTHLY_CAP_USD)
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MONTHLY_CAP_USD
}

function monthKey(now: Date): string {
  return `spend:${now.toISOString().slice(0, 7)}`
}

export async function spentThisMonthUsd(kv: Kv, now: Date): Promise<number> {
  return (await kv.get(monthKey(now))) / 1_000_000
}

export async function capReached(deps: Deps): Promise<boolean> {
  return (await spentThisMonthUsd(deps.kv, deps.now())) >= monthlyCapUsd(deps.env)
}

/** Add a call's cost and raise each alert level once a month (50%, 80%, 100%). */
export async function recordSpend(costUsd: number, deps: Deps): Promise<void> {
  if (!(costUsd > 0)) return
  const now = deps.now()
  const micros = await deps.kv.incrBy(monthKey(now), Math.ceil(costUsd * 1_000_000), 40 * 86400)
  const cap = monthlyCapUsd(deps.env)
  const spent = micros / 1_000_000
  for (const level of ALERT_LEVELS) {
    if (spent >= cap * level && (await deps.kv.setOnce(`${monthKey(now)}:alert:${level}`, 40 * 86400))) {
      const alert = { event: 'spend_alert', level, spentUsd: Number(spent.toFixed(4)), capUsd: cap, month: now.toISOString().slice(0, 7) }
      deps.log(alert)
      const hook = deps.env.ALERT_WEBHOOK_URL
      if (hook) {
        try {
          await deps.fetch(hook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `BrewMap AI spend has reached ${Math.round(level * 100)}% of the US$${cap} monthly cap (US$${spent.toFixed(2)}).`,
              ...alert,
            }),
          })
        } catch {
          deps.log({ event: 'alert_webhook_failed' })
        }
      }
    }
  }
}
