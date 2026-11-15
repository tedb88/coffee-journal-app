export type Env = Record<string, string | undefined>

export interface ApiRequest {
  method: string
  headers: Record<string, string | undefined>
  body: unknown
  ip: string
}

export interface ApiResponse {
  status: number
  body: unknown
  headers?: Record<string, string>
}

/** A tiny counter store: Upstash Redis in production, memory in tests and local dev. */
export interface Kv {
  incrBy(key: string, by: number, ttlS: number): Promise<number>
  get(key: string): Promise<number>
  /** Set once; true when this call set it. */
  setOnce(key: string, ttlS: number): Promise<boolean>
}

export type LogEvent = Record<string, unknown> & { event: string }

export interface Deps {
  env: Env
  fetch: typeof fetch
  kv: Kv
  now: () => Date
  log: (e: LogEvent) => void
}
