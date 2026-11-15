// Adapts a route function to the Node request/response pair that both Vercel
// functions and the Vite dev server provide.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { kvConfig, memoryKv, upstashKv } from './kv.js'
import type { ApiRequest, ApiResponse, Deps, Kv } from './types.js'

let localKv: Kv | null = null

export function defaultDeps(): Deps {
  const env = process.env
  const cfg = kvConfig(env)
  if (!cfg && !localKv) localKv = memoryKv()
  return {
    env,
    fetch: globalThis.fetch.bind(globalThis),
    kv: cfg ? upstashKv(cfg.url, cfg.token, globalThis.fetch.bind(globalThis)) : localKv!,
    now: () => new Date(),
    log: (e) => console.log(JSON.stringify(e)),
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 5_000_000) return null
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')
  } catch {
    return null
  }
}

export function nodeHandler(route: (req: ApiRequest, deps: Deps) => Promise<ApiResponse>, deps: () => Deps = defaultDeps) {
  return async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void> {
    const headers: Record<string, string | undefined> = {}
    for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v
    const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
    const body = req.body !== undefined ? req.body : await readBody(req)
    let out: ApiResponse
    try {
      out = await route({ method: req.method ?? 'GET', headers, body, ip }, deps())
    } catch (e) {
      console.log(JSON.stringify({ event: 'route_error', error: (e as Error).message.slice(0, 200) }))
      out = { status: 500, body: { error: 'Something went wrong on our side. Try again.' } }
    }
    res.statusCode = out.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v)
    res.end(JSON.stringify(out.body))
  }
}
