// Hash routes, so the static host serves one page and deep links still work.

import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'today' }
  | { name: 'beans' }
  | { name: 'bean'; id: string }
  | { name: 'bean-edit'; id: string }
  | { name: 'journal' }
  | { name: 'map' }
  | { name: 'scan' }
  | { name: 'review' }
  | { name: 'recipe'; beanId: string }
  | { name: 'brew' }
  | { name: 'taste' }
  | { name: 'log'; beanId: string }
  | { name: 'brew-edit'; id: string }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent)
  const [a, b, c] = parts
  if (!a) return { name: 'today' }
  if (a === 'beans' && b && c === 'edit') return { name: 'bean-edit', id: b }
  if (a === 'beans' && b) return { name: 'bean', id: b }
  if (a === 'beans') return { name: 'beans' }
  if (a === 'journal') return { name: 'journal' }
  if (a === 'map') return { name: 'map' }
  if (a === 'scan') return { name: 'scan' }
  if (a === 'review') return { name: 'review' }
  if (a === 'recipe' && b) return { name: 'recipe', beanId: b }
  if (a === 'brew') return { name: 'brew' }
  if (a === 'taste') return { name: 'taste' }
  if (a === 'log' && b) return { name: 'log', beanId: b }
  if (a === 'brews' && b && c === 'edit') return { name: 'brew-edit', id: b }
  return { name: 'today' }
}

export const href = {
  today: () => '#/',
  beans: () => '#/beans',
  bean: (id: string) => `#/beans/${encodeURIComponent(id)}`,
  beanEdit: (id: string) => `#/beans/${encodeURIComponent(id)}/edit`,
  journal: () => '#/journal',
  map: () => '#/map',
  scan: () => '#/scan',
  review: () => '#/review',
  recipe: (beanId: string) => `#/recipe/${encodeURIComponent(beanId)}`,
  brew: () => '#/brew',
  taste: () => '#/taste',
  log: (beanId: string) => `#/log/${encodeURIComponent(beanId)}`,
  brewEdit: (id: string) => `#/brews/${encodeURIComponent(id)}/edit`,
}

export function go(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) {
    history.replaceState(null, '', to)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else window.location.hash = to
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
}
