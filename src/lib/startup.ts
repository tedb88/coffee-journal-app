// Runs once per launch: move the old localStorage journal into IndexedDB
// (JRN-05), ask the browser to keep our data, and check storage (DR-05).

import { migrateLegacy, legacyBackup } from '../data/legacy-import.js'
import { exportAll } from '../data/export.js'
import { estimateUsage, requestPersistence } from '../data/storage.js'

export interface StartupReport {
  migrated: number
  /** Entries that could not be moved; the backup keeps them. */
  failed: number
  storageFull: boolean
  nearlyFull: boolean
}

let running: Promise<StartupReport> | null = null

/** Runs once per page, however many times it is called. */
export function startUp(storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage): Promise<StartupReport> {
  running ??= runStartUp(storage)
  return running
}

/** Tests only. */
export function resetStartUp(): void {
  running = null
}

async function runStartUp(storage: Storage | null): Promise<StartupReport> {
  const report: StartupReport = { migrated: 0, failed: 0, storageFull: false, nearlyFull: false }
  try {
    const res = await migrateLegacy(storage)
    report.migrated = res.migrated
    report.failed = res.failed
  } catch (e) {
    if ((e as Error).name === 'StorageFullError') report.storageFull = true
    else report.failed = Math.max(1, report.failed)
  }
  await requestPersistence()
  report.nearlyFull = (await estimateUsage())?.nearlyFull ?? false
  return report
}

function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadLegacyBackup(): Promise<boolean> {
  const backup = await legacyBackup()
  if (!backup) return false
  download('brewmap-backup-before-upgrade.json', backup.raw)
  return true
}

export async function downloadExport(): Promise<void> {
  const data = await exportAll({ includePhotos: false })
  download(`brewmap-journal-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2))
}
