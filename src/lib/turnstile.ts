// Cloudflare Turnstile (OPS-01). Off when VITE_TURNSTILE_SITE_KEY is not set,
// so local development needs no account. Tokens are single-use, so each AI
// request gets a fresh one from a widget that is removed afterwards.

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string
  remove(id: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('Bot check could not load'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export function turnstileSiteKey(): string | undefined {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined
}

/** A fresh token, or undefined when Turnstile is off or did not answer in time. */
export async function getTurnstileToken(siteKey = turnstileSiteKey(), timeoutMs = 10_000): Promise<string | undefined> {
  if (!siteKey || typeof document === 'undefined') return undefined
  try {
    await loadScript()
  } catch {
    return undefined
  }
  const api = window.turnstile
  if (!api) return undefined
  return new Promise((resolve) => {
    const el = document.createElement('div')
    el.className = 'turnstile-slot'
    document.body.appendChild(el)
    let id: string | null = null
    let settled = false
    const done = (token?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        if (id) api.remove(id)
      } catch {
        /* already gone */
      }
      el.remove()
      resolve(token)
    }
    const timer = setTimeout(() => done(undefined), timeoutMs)
    id = api.render(el, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      callback: (token: string) => done(token),
      'error-callback': () => done(undefined),
      'expired-callback': () => done(undefined),
    })
  })
}
