// Test helpers for the API layer: in-memory deps and a scripted fetch.

import { memoryKv } from './kv.js'
import type { ApiRequest, Deps, Env, LogEvent } from './types.js'

export type FetchCall = { url: string; init: RequestInit | undefined; body: unknown }
export type FetchHandler = (url: string, body: unknown, call: number) => Response | Promise<Response>

export const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** An OpenAI-compatible chat completion carrying `content`. */
export const completion = (content: unknown, usage = { prompt_tokens: 1000, completion_tokens: 200 }) =>
  jsonResponse({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }], usage })

export function scriptedFetch(handler: FetchHandler) {
  const calls: FetchCall[] = []
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    let body: unknown = init?.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        /* keep the raw string */
      }
    }
    calls.push({ url, init, body })
    return handler(url, body, calls.length)
  }) as typeof fetch
  return { fetch: fn, calls }
}

export function testDeps(opts: { env?: Env; fetch?: typeof fetch; now?: Date } = {}) {
  let now = opts.now ?? new Date('2026-10-20T03:00:00Z')
  const logs: LogEvent[] = []
  const deps: Deps = {
    env: opts.env ?? {},
    fetch:
      opts.fetch ??
      ((async () => {
        throw new Error('unexpected fetch')
      }) as typeof fetch),
    kv: memoryKv(() => now.getTime()),
    now: () => now,
    log: (e) => logs.push(e),
  }
  return {
    deps,
    logs,
    setNow: (d: Date) => {
      now = d
    },
  }
}

export const post = (body: unknown, headers: Record<string, string> = {}, ip = '203.0.113.7'): ApiRequest => ({ method: 'POST', headers, body, ip })

/** A primary open-weight provider, configured the way the README describes. */
export const PRIMARY_ENV: Env = {
  AI_BASE_URL: 'https://primary.example/v1',
  AI_API_KEY: 'k1',
  AI_SCAN_MODEL: 'Qwen/Qwen2.5-VL-72B-Instruct',
  AI_RECIPE_MODEL: 'Qwen/Qwen3-32B',
  AI_PROVIDER_NAME: 'primary',
  AI_PRICE_IN_PER_M: '1',
  AI_PRICE_OUT_PER_M: '2',
}
