import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { isValidRecipe } from '../../src/domain/recipe/validate.js'
import type { Recipe } from '../../src/domain/schemas.js'
import type { ScanResult } from '../../src/domain/scan.js'
import { nodeHandler } from './http.js'
import { MAX_IMAGE_BASE64, recipeRoute, scanRoute } from './routes.js'
import { completion, PRIMARY_ENV, post, scriptedFetch, testDeps } from './testing.js'

const IMAGE = 'A'.repeat(400)
const SCAN_REPLY = {
  fields: {
    name: 'Guji Hambela',
    roaster: 'Fineprint',
    origin: 'Ethiopia, Guji',
    region: 'Guji',
    process: 'Washed',
    roastLevel: 'Light',
    roastDate: '14.10.26',
    netWeight: '200g',
    tastingNotes: ['jasmine', 'peach'],
    varieties: ['74110'],
    altitude: '2,100 masl',
    producer: null,
  },
  confidence: { name: 'high', origin: 'high', roastDate: 'high' },
  evidence: { name: 'GUJI HAMBELA', roaster: 'FINEPRINT', origin: 'ETHIOPIA · GUJI', roastDate: '14.10.26', altitude: '2,100 MASL', netWeight: '200g' },
  labelLanguage: 'en',
  originalName: null,
}
const BEAN = { name: 'Guji Hambela', originCountry: 'ET', process: 'washed', roastLevel: 'light', roastDate: '2026-10-14' }
const PLAN = {
  tempDeltaC: 1,
  ratioDelta: 0,
  grindStepDelta: 0,
  pourCount: 4,
  expectedCup: 'Floral and bright.',
  rationale: 'A light washed Ethiopian likes a little more heat.',
}

describe('scanRoute', () => {
  it('reads a label and normalises it (AI-01)', async () => {
    const f = scriptedFetch(() => completion(SCAN_REPLY))
    const { deps } = testDeps({ env: PRIMARY_ENV, fetch: f.fetch })
    const res = await scanRoute(post({ imageBase64: IMAGE, mimeType: 'image/jpeg' }), deps)
    expect(res.status).toBe(200)
    const body = res.body as ScanResult
    expect(body.fields).toMatchObject({
      name: 'Guji Hambela',
      originCountry: 'ET',
      process: 'washed',
      roastLevel: 'light',
      roastDate: '2026-10-14',
      netWeightG: 200,
    })
    expect(body.meta).toEqual({ model: PRIMARY_ENV.AI_SCAN_MODEL, promptVersion: 'scan.v1' })
    const sent = f.calls[0].body as { model: string; messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }> }
    expect(sent.model).toBe(PRIMARY_ENV.AI_SCAN_MODEL)
    expect(sent.messages[0].content[0].image_url?.url).toBe(`data:image/jpeg;base64,${IMAGE}`)
  })

  it('rejects bad input before calling the model', async () => {
    const f = scriptedFetch(() => completion(SCAN_REPLY))
    const { deps } = testDeps({ env: PRIMARY_ENV, fetch: f.fetch })
    expect((await scanRoute(post({ imageBase64: IMAGE, mimeType: 'image/gif' }), deps)).status).toBe(400)
    expect((await scanRoute(post({ imageBase64: 'not base64!'.repeat(20), mimeType: 'image/png' }), deps)).status).toBe(400)
    expect((await scanRoute(post(null), deps)).status).toBe(400)
    expect((await scanRoute(post({ imageBase64: 'A'.repeat(MAX_IMAGE_BASE64 + 4), mimeType: 'image/png' }), deps)).status).toBe(413)
    expect(f.calls).toHaveLength(0)
  })

  it('offers manual entry when AI is off or fails', async () => {
    const prodNoProtection = testDeps({ env: { ...PRIMARY_ENV, VERCEL_ENV: 'production' } })
    const off = await scanRoute(post({ imageBase64: IMAGE, mimeType: 'image/png' }), prodNoProtection.deps)
    expect(off).toMatchObject({ status: 503, body: { manual: true } })
    expect(prodNoProtection.logs.some((l) => l.event === 'ai_disabled' && l.reason === 'protection_not_configured')).toBe(true)

    const broken = testDeps({ env: PRIMARY_ENV, fetch: scriptedFetch(() => completion('garbage')).fetch })
    expect(await scanRoute(post({ imageBase64: IMAGE, mimeType: 'image/png' }), broken.deps)).toMatchObject({ status: 502, body: { manual: true } })

    const none = testDeps()
    expect((await scanRoute(post({ imageBase64: IMAGE, mimeType: 'image/png' }), none.deps)).status).toBe(502)
  })

  it('stops at the monthly cap', async () => {
    const f = scriptedFetch(() => completion(SCAN_REPLY))
    const { deps, logs } = testDeps({ env: { ...PRIMARY_ENV, AI_MONTHLY_CAP_USD: '1' }, fetch: f.fetch })
    await deps.kv.incrBy(`spend:${deps.now().toISOString().slice(0, 7)}`, 1_000_000, 60)
    expect((await scanRoute(post({ imageBase64: IMAGE, mimeType: 'image/png' }), deps)).status).toBe(503)
    expect(logs.some((l) => l.reason === 'monthly_cap')).toBe(true)
    expect(f.calls).toHaveLength(0)
  })
})

describe('recipeRoute', () => {
  it('applies the AI plan inside the engine bounds (AI-02, RCP-05)', async () => {
    const f = scriptedFetch(() => completion(PLAN))
    const { deps } = testDeps({ env: PRIMARY_ENV, fetch: f.fetch })
    const res = await recipeRoute(post({ bean: BEAN, doseG: 15 }), deps)
    expect(res.status).toBe(200)
    const { recipe, fallback } = res.body as { recipe: Recipe; fallback: boolean }
    expect(fallback).toBe(false)
    expect(recipe.source).toBe('ai')
    expect(recipe.promptVersion).toBe('recipe.v1')
    expect(recipe.steps.filter((s) => s.kind === 'pour')).toHaveLength(4)
    expect(isValidRecipe(recipe)).toBe(true)
    const user = JSON.parse((f.calls[0].body as { messages: Array<{ content: string }> }).messages[1].content)
    expect(user.coffee).toMatchObject({ origin: 'ET', process: 'washed', daysSinceRoast: 6 })
    expect(user.baseline.doseG).toBe(15)
  })

  it('clamps an AI plan that overreaches', async () => {
    const f = scriptedFetch(() => completion({ ...PLAN, tempDeltaC: 12, ratioDelta: -9, grindStepDelta: 6 }))
    const { deps, logs } = testDeps({ env: PRIMARY_ENV, fetch: f.fetch })
    const { recipe } = (await recipeRoute(post({ bean: BEAN }), deps)).body as { recipe: Recipe }
    expect(isValidRecipe(recipe)).toBe(true)
    expect(recipe.tempC).toBeLessThanOrEqual(96)
    expect(recipe.ratio).toBeGreaterThanOrEqual(13)
    expect(logs.some((l) => l.event === 'recipe_clamped') || recipe.tempC <= 96).toBe(true)
  })

  it('falls back to the rules recipe, never to an error (RCP-06)', async () => {
    const broken = testDeps({
      env: PRIMARY_ENV,
      fetch: scriptedFetch(() => {
        throw new Error('offline')
      }).fetch,
    })
    expect((await recipeRoute(post({ bean: BEAN }), broken.deps)).body).toMatchObject({ fallback: true, reason: 'ai-error', recipe: { source: 'rules' } })

    const off = testDeps({ env: { VERCEL_ENV: 'production' } })
    expect((await recipeRoute(post({ bean: BEAN }), off.deps)).body).toMatchObject({ fallback: true, reason: 'protection', recipe: { source: 'rules' } })

    const empty = testDeps()
    const res = (await recipeRoute(post({ bean: {} }), empty.deps)).body as { recipe: Recipe }
    expect(isValidRecipe(res.recipe)).toBe(true)
  })

  it('validates and limits the request', async () => {
    const { deps } = testDeps()
    expect((await recipeRoute(post({ bean: { originCountry: 'Ethiopia' } }), deps)).status).toBe(400)
    expect((await recipeRoute(post({ bean: BEAN, doseG: 500 }), deps)).status).toBe(400)
    expect((await recipeRoute(post({ bean: { ...BEAN, name: 'x'.repeat(25_000) } }), deps)).status).toBe(413)
    expect((await recipeRoute({ ...post({ bean: BEAN }), method: 'GET' }, deps)).status).toBe(405)
  })
})

function fakeRes() {
  const out = { statusCode: 0, headers: {} as Record<string, string>, body: '' }
  const res = {
    set statusCode(v: number) {
      out.statusCode = v
    },
    setHeader: (k: string, v: string) => {
      out.headers[k.toLowerCase()] = v
    },
    end: (b: string) => {
      out.body = b
    },
  } as unknown as ServerResponse
  return { res, out }
}

function fakeReq(body: string | undefined, headers: Record<string, string> = {}, parsed?: unknown) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)]) as unknown as IncomingMessage & { body?: unknown }
  Object.assign(stream, { method: 'POST', headers, socket: { remoteAddress: '10.0.0.1' } })
  if (parsed !== undefined) stream.body = parsed
  return stream
}

describe('nodeHandler', () => {
  it('parses a streamed body and writes JSON with no-store', async () => {
    let seen: unknown
    const h = nodeHandler(
      async (req) => {
        seen = req
        return { status: 201, body: { ok: true }, headers: { 'X-Test': '1' } }
      },
      () => testDeps().deps,
    )
    const { res, out } = fakeRes()
    await h(fakeReq('{"a":1}', { 'X-Forwarded-For': '198.51.100.9, 10.0.0.1', 'X-Device-Id': 'dev' }), res)
    expect(out.statusCode).toBe(201)
    expect(JSON.parse(out.body)).toEqual({ ok: true })
    expect(out.headers['cache-control']).toBe('no-store')
    expect(out.headers['x-test']).toBe('1')
    expect(seen).toMatchObject({ method: 'POST', body: { a: 1 }, ip: '198.51.100.9', headers: { 'x-device-id': 'dev' } })
  })

  it('uses a body the platform already parsed, and survives bad JSON', async () => {
    const bodies: unknown[] = []
    const h = nodeHandler(
      async (req) => {
        bodies.push(req.body)
        return { status: 200, body: {} }
      },
      () => testDeps().deps,
    )
    await h(fakeReq(undefined, {}, { pre: 'parsed' }), fakeRes().res)
    await h(fakeReq('{not json'), fakeRes().res)
    expect(bodies).toEqual([{ pre: 'parsed' }, null])
  })

  it('turns a thrown error into a plain 500', async () => {
    const h = nodeHandler(
      async () => {
        throw new Error('boom')
      },
      () => testDeps().deps,
    )
    const { res, out } = fakeRes()
    await h(fakeReq('{}'), res)
    expect(out.statusCode).toBe(500)
    expect(out.body).not.toContain('boom')
  })
})
