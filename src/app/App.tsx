// The app shell: routes, the bottom nav on top-level screens, start-up notices
// and the toast that carries Undo (LOG-05).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { restore, type Snapshot } from '../data/repositories.js'
import { downloadExport, downloadLegacyBackup, startUp, type StartupReport } from '../lib/startup.js'
import { BottomNav, Button, Toast } from '../ui/components.js'
import { parseRoute, useHash, type Route } from './router.js'
import { bump } from './store.js'
import { BeanScreen } from './screens/Bean.js'
import { BeansScreen } from './screens/Beans.js'
import { BrewScreen } from './screens/Brew.js'
import { JournalScreen } from './screens/Journal.js'
import { MapScreen } from './screens/Map.js'
import { RecipeScreen } from './screens/Recipe.js'
import { ReviewScreen } from './screens/Review.js'
import { ScanScreen } from './screens/Scan.js'
import { TasteScreen } from './screens/Taste.js'
import { TodayScreen } from './screens/Today.js'

interface ToastState {
  id: number
  message: string
  undo?: Snapshot
}

const ToastContext = createContext<(message: string, undo?: Snapshot) => void>(() => {})
export const useToast = () => useContext(ToastContext)

const NAV_FOR: Partial<Record<Route['name'], string>> = { today: 'today', beans: 'beans', bean: 'beans', journal: 'journal', map: 'map' }

function screenFor(route: Route): ReactNode {
  switch (route.name) {
    case 'today':
      return <TodayScreen />
    case 'beans':
      return <BeansScreen />
    case 'bean':
      return <BeanScreen id={route.id} />
    case 'bean-edit':
      return <ReviewScreen editId={route.id} />
    case 'journal':
      return <JournalScreen />
    case 'map':
      return <MapScreen />
    case 'scan':
      return <ScanScreen />
    case 'review':
      return <ReviewScreen />
    case 'recipe':
      return <RecipeScreen beanId={route.beanId} />
    case 'brew':
      return <BrewScreen />
    case 'taste':
      return <TasteScreen mode="guided" />
    case 'log':
      return <TasteScreen mode="manual" beanId={route.beanId} />
    case 'brew-edit':
      return <TasteScreen mode="edit" brewId={route.id} />
  }
}

export default function App() {
  const route = parseRoute(useHash())
  const [toast, setToast] = useState<ToastState | null>(null)
  const [startup, setStartup] = useState<StartupReport | null>(null)

  useEffect(() => {
    let live = true
    startUp().then((r) => {
      if (!live) return
      setStartup(r)
      if (r.migrated > 0) bump()
    })
    return () => {
      live = false
    }
  }, [])

  // Each screen starts at the top and says what it is to screen readers.
  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
  }, [route.name])

  const show = useCallback((message: string, undo?: Snapshot) => setToast({ id: Date.now(), message, undo }), [])
  const clear = useCallback(() => setToast(null), [])
  const nav = NAV_FOR[route.name]

  return (
    <ToastContext.Provider value={show}>
      <div className="app">
        <StartupNotice report={startup} onDismiss={() => setStartup(null)} />
        {screenFor(route)}
        {nav ? <BottomNav active={nav} /> : null}
        {toast ? (
          <Toast
            key={toast.id}
            message={toast.message}
            actionLabel={toast.undo ? 'Undo' : undefined}
            onAction={async () => {
              if (toast.undo) await restore(toast.undo)
              setToast(null)
              bump()
            }}
            onDone={clear}
          />
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}

function StartupNotice({ report, onDismiss }: { report: StartupReport | null; onDismiss: () => void }) {
  if (!report) return null
  const problem = report.failed > 0 || report.storageFull
  if (!problem && !report.nearlyFull) return null
  return (
    <div className="banner" role="status" style={{ margin: 'var(--space-3) var(--space-5) 0' }}>
      <span>
        {report.storageFull
          ? 'Your phone is out of space, so some of your earlier journal could not be moved to the new format. Nothing was deleted.'
          : problem
            ? 'Some earlier journal entries could not be moved to the new format. They are kept in a backup on this device.'
            : 'Storage on this device is nearly full. Export your journal to keep a copy.'}
      </span>
      <div className="banner-actions">
        {problem ? (
          <Button variant="secondary" onClick={() => downloadLegacyBackup()}>
            Download backup
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => downloadExport()}>
            Export journal
          </Button>
        )}
        <Button variant="text" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
