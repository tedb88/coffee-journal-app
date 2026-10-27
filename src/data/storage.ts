// Ask the browser to keep BrewMap's data (iOS can clear storage of sites that
// are not installed, BRD C2) and report how full storage is (DR-05).

export const STORAGE_WARN_RATIO = 0.8

interface StorageManagerLike {
  persisted?: () => Promise<boolean>
  persist?: () => Promise<boolean>
  estimate?: () => Promise<{ usage?: number; quota?: number }>
}

function manager(): StorageManagerLike | null {
  return (globalThis.navigator as { storage?: StorageManagerLike } | undefined)?.storage ?? null
}

export async function requestPersistence(sm: StorageManagerLike | null = manager()): Promise<boolean> {
  try {
    if (!sm?.persist) return false
    if (sm.persisted && (await sm.persisted())) return true
    return await sm.persist()
  } catch {
    return false
  }
}

export interface UsageEstimate {
  usage: number
  quota: number
  ratio: number
  nearlyFull: boolean
}

export async function estimateUsage(sm: StorageManagerLike | null = manager()): Promise<UsageEstimate | null> {
  try {
    if (!sm?.estimate) return null
    const { usage = 0, quota = 0 } = await sm.estimate()
    const ratio = quota > 0 ? usage / quota : 0
    return { usage, quota, ratio, nearlyFull: ratio >= STORAGE_WARN_RATIO }
  } catch {
    return null
  }
}
