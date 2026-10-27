import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { completion, jsonResponse, PRIMARY_ENV, scriptedFetch, testDeps } from '../testing.js'
import { spentThisMonthUsd } from '../protect.js'
import { AiUnavailableError, callJson, parseJsonContent } from './gateway.js'
import { costUsd, isOpenWeightModel, resolveProviders } from './registry.js'
import { recipeSystemPrompt, SCAN_PROMPT } from './prompts.js'

describe('isOpenWeightModel (AIP-9)', () => {
  it.each([
    'Qwen/Qwen2.5-VL-72B-Instruct',
    'qwen3-vl-235b-a22b-instruct',
    'google/gemma-3-27b-it',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-120b',
    'mistralai/Mistral-Small-3.2-24B-Instruct-2506',
    'deepseek-ai/DeepSeek-V3',
    'zai-org/GLM-4.5V',
  ])('accepts %s', (m) => expect(isOpenWeightModel(m)).toBe(true))

  it.each(['qwen-vl-max', 'qwen-plus', 'qwen3-vl-plus', 'gpt-4o-mini', 'o3', 'claude-sonnet', 'gemini-2.5-flash', 'some-unknown-model'])('rejects %s', (m) =>
    expect(isOpenWeightModel(m)).toBe(false),
  )
})

describe('resolveProviders', () => {
  it('orders primary, failover, then legacy Groq', () => {
    const env = {
      ...PRIMARY_ENV,
      AI_FALLBACK_BASE_URL: 'https://fallback.example/v1/',
      AI_FALLBACK_API_KEY: 'k2',
      AI_FALLBACK_SCAN_MODEL: 'google/gemma-3-27b-it',
      GROQ_API_KEY: 'g',
    }
    const { providers } = resolveProviders('scan', env)
    expect(providers.map((p) => p.name)).toEqual(['primary', 'fallback', 'groq-legacy'])
    expect(providers[1].baseUrl).toBe('https://fallback.example/v1')
    expect(providers[1].priceInPerM).toBe(0.3)
  })

  it('drops a closed model and reports it', () => {
    const { providers, rejected } = resolveProviders('recipe', { ...PRIMARY_ENV, AI_RECIPE_MODEL: 'gpt-4o' })
    expect(providers).toHaveLength(0)
    expect(rejected).toEqual([{ name: 'primary', model: 'gpt-4o' }])
  })

  it('can switch the legacy provider off', () => {
    expect(resolveProviders('scan', { GROQ_API_KEY: 'g', AI_DISABLE_LEGACY_GROQ: 'true' }).providers).toHaveLength(0)
  })

  it('prices calls per million tokens', () => {
    const [p] = resolveProviders('scan', PRIMARY_ENV).providers
    expect(costUsd(p, 1_000_000, 500_000)).toBeCloseTo(2)
  })
})

describe('parseJsonContent', () => {
  it('reads plain, fenced and wrapped JSON', () => {
    expect(parseJsonContent('{"a":1}')).toEqual({ a: 1 })
    expect(parseJsonContent('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseJsonContent('Here you go: {"a":1} hope it helps')).toEqual({ a: 1 })
    expect(() => parseJsonContent('nothing here')).toThrow()
  })
})

const Schema = z.object({ answer: z.number() })
const call = (deps: ReturnType<typeof testDeps>['deps']) =>
  callJson({ capability: 'recipe', promptVersion: 'test.v1', schema: Schema, messages: [{ role: 'user', content: 'hi' }] }, deps)

describe('callJson', () => {
  it('returns validated data, sends JSON mode and records spend', async () => {
    const f = scriptedFetch(() => completion({ answer: 42 }))
    const { deps, logs } = testDeps({ env: PRIMARY_ENV, fetch: f.fetch })
    const res = await call(deps)
    expect(res).toMatchObject({ data: { answer: 42 }, provider: 'primary', model: 'Qwen/Qwen3-32B' })
    expect(f.calls[0].url).toBe('https://primary.example/v1/chat/completions')
    expect(f.calls[0].body).toMatchObject({ model: 'Qwen/Qwen3-32B', response_format: { type: 'json_object' } })
    expect(res.costUsd).toBeCloseTo((1000 * 1 + 200 * 2) / 1e6)
    expect(await spentThisMonthUsd(deps.kv, deps.now())).toBeCloseTo(res.costUsd, 6)
    const line = logs.find((l) => l.event === 'ai_call')
    expect(line).toMatchObject({ outcome: 'ok', promptVersion: 'test.v1', tokensIn: 1000 })
    expect(JSON.stringify(logs)).not.toContain('hi')
  })

  it('repairs one invalid reply on the same provider', async () => {
    const f = scriptedFetch((_u, _b, n) => (n === 1 ? completion('{"answer":"forty-two"}') : completion({ answer: 42 })))
    const { deps, logs } = testDeps({ env: PRIMARY_ENV, fetch: f.fetch })
    expect((await call(deps)).data.answer).toBe(42)
    expect(f.calls).toHaveLength(2)
    const repairMsg = (f.calls[1].body as { messages: Array<{ content: string }> }).messages.at(-1)!.content
    expect(repairMsg).toContain('answer')
    expect(logs.find((l) => l.event === 'ai_call')?.outcome).toBe('repaired')
  })

  it('fails over when the primary errors or stays invalid', async () => {
    const env = {
      ...PRIMARY_ENV,
      AI_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      AI_FALLBACK_API_KEY: 'k2',
      AI_FALLBACK_RECIPE_MODEL: 'google/gemma-3-27b-it',
    }
    const f = scriptedFetch((url) => (url.startsWith('https://primary') ? jsonResponse({ error: 'overloaded' }, 503) : completion({ answer: 1 })))
    const { deps, logs } = testDeps({ env, fetch: f.fetch })
    const res = await call(deps)
    expect(res.provider).toBe('fallback')
    expect(logs.filter((l) => l.event === 'ai_call').map((l) => l.outcome)).toEqual(['error', 'ok'])

    const g = scriptedFetch((url) => (url.startsWith('https://primary') ? completion('not json at all') : completion({ answer: 2 })))
    const t2 = testDeps({ env, fetch: g.fetch })
    expect((await call(t2.deps)).data.answer).toBe(2)
    expect(t2.logs.filter((l) => l.event === 'ai_call').map((l) => l.outcome)).toEqual(['invalid', 'ok'])
    // The two wasted primary calls still count against the cap.
    expect(await spentThisMonthUsd(t2.deps.kv, t2.deps.now())).toBeGreaterThan(0.0028)
  })

  it('counts spent tokens even when the repair call fails', async () => {
    const f = scriptedFetch((_u, _b, n) => {
      if (n === 1) return completion('{}')
      throw new Error('socket hang up')
    })
    const { deps } = testDeps({ env: PRIMARY_ENV, fetch: f.fetch })
    await expect(call(deps)).rejects.toBeInstanceOf(AiUnavailableError)
    expect(await spentThisMonthUsd(deps.kv, deps.now())).toBeCloseTo(0.0014, 6)
  })

  it('throws AiUnavailableError when nothing is configured or all fail', async () => {
    await expect(call(testDeps().deps)).rejects.toMatchObject({ reason: 'no-provider' })
    const f = scriptedFetch(() => {
      throw new Error('offline')
    })
    await expect(call(testDeps({ env: PRIMARY_ENV, fetch: f.fetch }).deps)).rejects.toMatchObject({ reason: 'all-failed' })
  })

  it('logs a rejected closed model', async () => {
    const { deps, logs } = testDeps({ env: { ...PRIMARY_ENV, AI_RECIPE_MODEL: 'gemini-2.5-pro' } })
    await expect(call(deps)).rejects.toBeInstanceOf(AiUnavailableError)
    expect(logs[0]).toMatchObject({ event: 'model_rejected', model: 'gemini-2.5-pro' })
  })
})

describe('prompts', () => {
  it('tell the scan model not to guess and to quote evidence', () => {
    expect(SCAN_PROMPT).toMatch(/Never guess/)
    expect(SCAN_PROMPT).toMatch(/evidence/)
  })
  it('carry the rules engine bounds into the recipe prompt', () => {
    const p = recipeSystemPrompt()
    expect(p).toMatch(/V60/)
    expect(p).toMatch(/never write numbers of grams/)
  })
})
