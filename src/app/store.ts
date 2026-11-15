// Screens reload their data when anything is written. One counter, bumped after each write.

import { useEffect, useState, useSyncExternalStore } from 'react'

let version = 0
const listeners = new Set<() => void>()

export function bump(): void {
  version++
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useDataVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  )
}

export interface Loaded<T> {
  data: T | undefined
  error: Error | null
  loading: boolean
}

/** Run `load` on mount, when `deps` change and after any write. Stale results are dropped. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const v = useDataVersion()
  const [state, setState] = useState<Loaded<T>>({ data: undefined, error: null, loading: true })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    load().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error: Error) => live && setState({ data: undefined, error, loading: false }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, ...deps])
  return state
}
