import { describe, expect, it } from 'vitest'
import { memoryKv, upstashKv, kvConfig } from './kv.js'
import { capReached, clientKey, guard, LIMITS, missingProtection, monthlyCapUsd, recordSpend, spentThisMonthUsd, verifyTurnstile } from './protect.js'
import { jsonResponse, post, scriptedFetch, testDeps } from './testing.js'

describe('memoryKv', () => {
  it('counts, expires and sets once', async () => {
    let t = 0
    const kv = memoryKv(() => t)
    expect(await kv.incrBy('a', 2, 10)).toBe(2)
    expect(await kv.incrBy('a', 3, 10)).toBe(5)
    expect(await kv.get('a')).toBe(5)
    t = 10_000
    expect(await kv.get('a')).toBe(0)
    expect(await kv.setOnce('b', 5)).toBe(true)
    expect(await kv.setOnce('b', 5)).toBe(false)
  })
})

describe('upstashKv', () => {
  it('speaks the REST pipeline and surfaces errors', async () => {
    const { fetch, calls } = scriptedFetch((_url, body) => {
      const cmd = (body as string[][])[0][0]
      if (cmd === 'INCRBY') return jsonResponse([{ result: 7 }, { result: 1 }])
      if (cmd === 'GET') return jsonResponse([{ result: null }])
      if (cmd === 'SET') return jsonResponse([{ result: 'OK' }])
      return jsonResponse([{ error: 'ERR' }])
    })
    const kv = upstashKv('https://kv.example/', 'tok', fetch)
    expect(await kv.incrBy('k', 1, 60)).toBe(7)
    expect(await kv.get('k')).toBe(0)
    expect(await kv.setOnce('k', 60)).toBe(true)
    expect(calls[0].url).toBe('https://kv.example/pipeline')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(calls[0].body).toEqual([
      ['INCRBY', 'k', 1],
      ['EXPIRE', 'k', 60],
    ])

    const broken = upstashKv('https://kv.example', 'tok', scriptedFetch(() => jsonResponse([{ error: 'WRONGTYPE' }])).fetch)
    await expect(broken.get('k')).rejects.toThrow(/WRONGTYPE/)
    const down = upstashKv('https://kv.example', 'tok', scriptedFetch(() => jsonResponse({}, 500)).fetch)
    await expect(down.get('k')).rejects.toThrow(/500/)
  })

  it('reads either naming of the store settings', () => {
    expect(kvConfig({ UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' })).toEqual({ url: 'u', token: 't' })
    expect(kvConfig({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' })).toEqual({ url: 'u', token: 't' })
    expect(kvConfig({ KV_REST_API_URL: 'u' })).toBeNull()
  })
})

describe('missingProtection (fail closed in production)', () => {
  it('asks for nothing outside production', () => {
    expect(missingProtection({})).toEqual([])
    expect(missingProtection({ VERCEL_ENV: 'preview' })).toEqual([])
  })
  it('lists what production lacks', () => {
    expect(missingProtection({ VERCEL_ENV: 'production' })).toHaveLength(2)
    expect(missingProtection({ VERCEL_ENV: 'production', TURNSTILE_SECRET_KEY: 's', UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' })).toEqual([])
  })
  it('lets the owner opt out on purpose', () => {
    expect(missingProtection({ VERCEL_ENV: 'production', ALLOW_UNPROTECTED_AI: 'true' })).toEqual([])
  })
})

describe('clientKey', () => {
  it('is stable, opaque and separates devices behind one address', () => {
    const a = clientKey(post({}, { 'x-device-id': 'd1' }))
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(clientKey(post({}, { 'x-device-id': 'd1' }))).toBe(a)
    expect(clientKey(post({}, { 'x-device-id': 'd2' }))).not.toBe(a)
    expect(a).not.toContain('203.0.113.7')
  })
})

describe('verifyTurnstile', () => {
  it('passes when no secret is configured', async () => {
    expect(await verifyTurnstile(undefined, 'ip', testDeps().deps)).toBe(true)
  })
  it('requires a token and a successful siteverify', async () => {
    const ok = scriptedFetch(() => jsonResponse({ success: true }))
    const env = { TURNSTILE_SECRET_KEY: 'sec' }
    expect(await verifyTurnstile(undefined, 'ip', testDeps({ env, fetch: ok.fetch }).deps)).toBe(false)
    expect(await verifyTurnstile('tok', 'ip', testDeps({ env, fetch: ok.fetch }).deps)).toBe(true)
    expect(ok.calls[0].url).toContain('siteverify')
    const no = scriptedFetch(() => jsonResponse({ success: false }))
    expect(await verifyTurnstile('tok', 'ip', testDeps({ env, fetch: no.fetch }).deps)).toBe(false)
    const down = scriptedFetch(() => {
      throw new Error('offline')
    })
    expect(await verifyTurnstile('tok', 'ip', testDeps({ env, fetch: down.fetch }).deps)).toBe(false)
  })
})

describe('guard', () => {
  it('only accepts POST', async () => {
    const res = await guard({ ...post({}), method: 'GET' }, 'scan', testDeps().deps)
    expect(res?.status).toBe(405)
    expect(res?.headers?.Allow).toBe('POST')
  })

  it('stops requests that fail the bot check', async () => {
    const { deps, logs } = testDeps({ env: { TURNSTILE_SECRET_KEY: 's' }, fetch: scriptedFetch(() => jsonResponse({ success: false })).fetch })
    expect((await guard(post({}, { 'x-turnstile-token': 'bad' }), 'scan', deps))?.status).toBe(403)
    expect(logs.some((l) => l.event === 'bot_check_failed')).toBe(true)
  })

  it('limits scans per hour per client, with Retry-After', async () => {
    const { deps, logs } = testDeps()
    const max = LIMITS.scan[0].max
    for (let i = 0; i < max; i++) expect(await guard(post({}), 'scan', deps)).toBeNull()
    const res = await guard(post({}), 'scan', deps)
    expect(res?.status).toBe(429)
    expect(Number(res?.headers?.['Retry-After'])).toBeGreaterThan(0)
    expect(logs.at(-1)).toMatchObject({ event: 'rate_limited', route: 'scan', window: 'hour' })
    // Another client is unaffected.
    expect(await guard(post({}, {}, '198.51.100.1'), 'scan', deps)).toBeNull()
  })

  it('opens again in the next hour, until the daily limit', async () => {
    const t = testDeps({ now: new Date('2026-10-20T00:00:00Z') })
    let allowed = 0
    for (let hour = 0; hour < 5; hour++) {
      t.setNow(new Date(Date.UTC(2026, 9, 20, hour, 5)))
      for (let i = 0; i < 10; i++) if ((await guard(post({}), 'scan', t.deps)) === null) allowed++
    }
    expect(allowed).toBe(LIMITS.scan[1].max)
  })

  it('applies a global daily ceiling across clients', async () => {
    const { deps } = testDeps()
    await deps.kv.incrBy(`rl:global:86400:${Math.floor(deps.now().getTime() / 1000 / 86400)}`, 2000, 86400)
    const res = await guard(post({}), 'recipe', deps)
    expect(res?.status).toBe(429)
  })
})

describe('spend cap (D12)', () => {
  it('defaults to US$20 and accepts an override', () => {
    expect(monthlyCapUsd({})).toBe(20)
    expect(monthlyCapUsd({ AI_MONTHLY_CAP_USD: '5' })).toBe(5)
    expect(monthlyCapUsd({ AI_MONTHLY_CAP_USD: 'nonsense' })).toBe(20)
  })

  it('adds spend, alerts once per level and stops at the cap', async () => {
    const hook = scriptedFetch(() => jsonResponse({ ok: true }))
    const { deps, logs } = testDeps({ env: { AI_MONTHLY_CAP_USD: '10', ALERT_WEBHOOK_URL: 'https://hooks.example/x' }, fetch: hook.fetch })
    await recordSpend(4, deps)
    expect(logs.filter((l) => l.event === 'spend_alert')).toHaveLength(0)
    await recordSpend(1.5, deps)
    await recordSpend(0.1, deps)
    expect(logs.filter((l) => l.event === 'spend_alert').map((l) => l.level)).toEqual([0.5])
    expect(await capReached(deps)).toBe(false)
    await recordSpend(5, deps)
    expect(logs.filter((l) => l.event === 'spend_alert').map((l) => l.level)).toEqual([0.5, 0.8, 1])
    expect(await capReached(deps)).toBe(true)
    expect(await spentThisMonthUsd(deps.kv, deps.now())).toBeCloseTo(10.6, 5)
    expect(hook.calls).toHaveLength(3)
    expect(String((hook.calls[0].body as { text: string }).text)).toContain('50%')
  })

  it('starts each month afresh', async () => {
    const t = testDeps({ env: { AI_MONTHLY_CAP_USD: '1' } })
    await recordSpend(2, t.deps)
    expect(await capReached(t.deps)).toBe(true)
    t.setNow(new Date('2026-11-01T00:00:00Z'))
    expect(await capReached(t.deps)).toBe(false)
  })

  it('ignores zero and survives a failing webhook', async () => {
    const { deps, logs } = testDeps({
      env: { AI_MONTHLY_CAP_USD: '1', ALERT_WEBHOOK_URL: 'https://hooks.example/x' },
      fetch: scriptedFetch(() => {
        throw new Error('down')
      }).fetch,
    })
    await recordSpend(0, deps)
    expect(await spentThisMonthUsd(deps.kv, deps.now())).toBe(0)
    await recordSpend(1, deps)
    expect(logs.some((l) => l.event === 'alert_webhook_failed')).toBe(true)
  })
})
