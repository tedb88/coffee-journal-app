// One way to call a model (ADR-03): OpenAI-compatible chat completions, JSON
// output, schema validation, one repair attempt, failover to the next
// provider, and a telemetry line per call (AIG-03). No images, prompts or
// user text are logged.

import type { z } from 'zod'
import { recordSpend } from '../protect.js'
import type { Deps } from '../types.js'
import { costUsd, resolveProviders, type Capability, type Provider } from './registry.js'

export type ChatMessage =
  | { role: 'system' | 'assistant'; content: string }
  | { role: 'user'; content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> }

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: 'no-provider' | 'all-failed',
  ) {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message)
  }
}

export function parseJsonContent(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('not JSON')
  }
}

async function complete(p: Provider, messages: ChatMessage[], opts: { temperature: number; maxTokens: number; timeoutMs: number }, deps: Deps) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs)
  try {
    const res = await deps.fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: p.model, messages, temperature: opts.temperature, max_tokens: opts.maxTokens, response_format: { type: 'json_object' } }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, res.status)
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } }
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    }
  } catch (e) {
    if (e instanceof ProviderError) throw e
    throw new ProviderError((e as Error).name === 'AbortError' ? 'timeout' : 'network', null)
  } finally {
    clearTimeout(timer)
  }
}

export interface CallOptions<T> {
  capability: Capability
  promptVersion: string
  messages: ChatMessage[]
  schema: z.ZodType<T>
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

export interface CallResult<T> {
  data: T
  provider: string
  model: string
  costUsd: number
}

export async function callJson<T>(opts: CallOptions<T>, deps: Deps): Promise<CallResult<T>> {
  const { providers, rejected } = resolveProviders(opts.capability, deps.env)
  for (const r of rejected)
    deps.log({ event: 'model_rejected', capability: opts.capability, provider: r.name, model: r.model, reason: 'not an open-weight model (AIP-9)' })
  if (providers.length === 0) throw new AiUnavailableError('No AI provider is configured.', 'no-provider')

  for (const p of providers) {
    const started = Date.now()
    let tokensIn = 0
    let tokensOut = 0
    let outcome = 'ok'
    try {
      const settings = { temperature: opts.temperature ?? 0.2, maxTokens: opts.maxTokens ?? 600, timeoutMs: opts.timeoutMs ?? 20000 }
      let reply = await complete(p, opts.messages, settings, deps)
      tokensIn += reply.tokensIn
      tokensOut += reply.tokensOut
      let parsed = tryParse(reply.content, opts.schema)
      if (!parsed.ok) {
        outcome = 'repaired'
        reply = await complete(
          p,
          [
            ...opts.messages,
            { role: 'assistant', content: reply.content.slice(0, 4000) },
            { role: 'user', content: `That reply did not match the required JSON (${parsed.problem}). Reply again with only the JSON object.` },
          ],
          settings,
          deps,
        )
        tokensIn += reply.tokensIn
        tokensOut += reply.tokensOut
        parsed = tryParse(reply.content, opts.schema)
      }
      if (!parsed.ok) {
        outcome = 'invalid'
        throw new ProviderError(`invalid output: ${parsed.problem}`, null)
      }
      const cost = costUsd(p, tokensIn, tokensOut)
      deps.log({
        event: 'ai_call',
        capability: opts.capability,
        provider: p.name,
        model: p.model,
        promptVersion: opts.promptVersion,
        latencyMs: Date.now() - started,
        tokensIn,
        tokensOut,
        costUsd: Number(cost.toFixed(6)),
        outcome,
      })
      return { data: parsed.data, provider: p.name, model: p.model, costUsd: cost }
    } catch (e) {
      if (outcome === 'ok' || outcome === 'repaired') outcome = 'error'
      deps.log({
        event: 'ai_call',
        capability: opts.capability,
        provider: p.name,
        model: p.model,
        promptVersion: opts.promptVersion,
        latencyMs: Date.now() - started,
        tokensIn,
        tokensOut,
        outcome,
        error: (e as Error).message.slice(0, 120),
      })
    } finally {
      // Tokens already spent count against the cap whether or not the call succeeded.
      await recordSpend(costUsd(p, tokensIn, tokensOut), deps)
    }
  }
  throw new AiUnavailableError('Every AI provider failed.', 'all-failed')
}

function tryParse<T>(content: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; problem: string } {
  let raw: unknown
  try {
    raw = parseJsonContent(content)
  } catch {
    return { ok: false, problem: 'not valid JSON' }
  }
  const res = schema.safeParse(raw)
  if (res.success) return { ok: true, data: res.data }
  const first = res.error.issues[0]
  return { ok: false, problem: `${first?.path.join('.') || 'root'}: ${first?.message ?? 'invalid'}` }
}
