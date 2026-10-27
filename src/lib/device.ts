// An anonymous per-install id, sent as X-Device-Id so rate limits can tell
// apart devices that share one address (OPS-01). It identifies nothing else.

import { newId } from '../data/db.js'

export const DEVICE_KEY = 'brewmap_device'

interface KeyValue {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

let memo: string | null = null

export function deviceId(storage: KeyValue | null = typeof localStorage === 'undefined' ? null : localStorage): string {
  if (memo) return memo
  try {
    memo = storage?.getItem(DEVICE_KEY) ?? null
    if (!memo) {
      memo = newId()
      storage?.setItem(DEVICE_KEY, memo)
    }
  } catch {
    memo = newId()
  }
  return memo
}

/** Tests only. */
export function resetDeviceId(): void {
  memo = null
}
