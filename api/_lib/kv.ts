import type { Env, Kv } from './types.js'

export function memoryKv(now: () => number = Date.now): Kv {
  const store = new Map<string, { v: number; exp: number }>()
  const live = (key: string) => {
    const e = store.get(key)
    if (e && e.exp <= now()) store.delete(key)
    return store.get(key)
  }
  return {
    async incrBy(key, by, ttlS) {
      const e = live(key)
      const v = (e?.v ?? 0) + by
      store.set(key, { v, exp: e?.exp ?? now() + ttlS * 1000 })
      return v
    },
    async get(key) {
      return live(key)?.v ?? 0
    },
    async setOnce(key, ttlS) {
      if (live(key)) return false
      store.set(key, { v: 1, exp: now() + ttlS * 1000 })
      return true
    },
  }
}

/** Upstash Redis over its REST API (no SDK). Keys carry their window, so a TTL is only for clean-up. */
export function upstashKv(url: string, token: string, fetchImpl: typeof fetch): Kv {
  const base = url.replace(/\/$/, '')
  async function pipeline(cmds: Array<Array<string | number>>): Promise<unknown[]> {
    const res = await fetchImpl(`${base}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
    })
    if (!res.ok) throw new Error(`Counter store error ${res.status}`)
    const out = (await res.json()) as Array<{ result?: unknown; error?: string }>
    const err = out.find((r) => r.error)
    if (err) throw new Error(`Counter store error: ${err.error}`)
    return out.map((r) => r.result)
  }
  return {
    async incrBy(key, by, ttlS) {
      const [v] = await pipeline([
        ['INCRBY', key, by],
        ['EXPIRE', key, ttlS],
      ])
      return Number(v)
    },
    async get(key) {
      const [v] = await pipeline([['GET', key]])
      return v === null || v === undefined ? 0 : Number(v)
    },
    async setOnce(key, ttlS) {
      const [v] = await pipeline([['SET', key, '1', 'NX', 'EX', ttlS]])
      return v === 'OK'
    },
  }
}

export function kvConfig(env: Env): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN
  return url && token ? { url, token } : null
}
