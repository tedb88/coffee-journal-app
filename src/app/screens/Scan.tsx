// Scan a bag: "Is the label in frame?" (UX design §2, screen 2; CAP-01). The
// phone's own camera opens from the shutter; Photos picks from the library.

import { useRef, useState } from 'react'
import { scanLabel } from '../../lib/api.js'
import { prepareImage, rejectReason } from '../../lib/image.js'
import { Icon, IconButton, Spinner } from '../../ui/components.js'
import { getScan, setScan } from '../flow.js'
import { go, href } from '../router.js'

export async function readPendingScan(): Promise<void> {
  const pending = getScan()
  if (!pending?.api) return
  const res = await scanLabel(pending.api)
  setScan({ ...pending, result: res.ok ? res.scan : null, error: res.ok ? null : res.message })
}

export function ScanScreen() {
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    const reason = rejectReason(file)
    if (reason) {
      setError(reason)
      return
    }
    setError(null)
    setBusy('Preparing the photo')
    try {
      const img = await prepareImage(file)
      setScan({ photo: img.photo, previewUrl: img.previewUrl, api: img.api, result: null, error: null })
    } catch (e) {
      // CAP-08: a photo the browser cannot open still leads to manual entry.
      setScan({ photo: null, previewUrl: null, api: null, result: null, error: (e as Error).message })
      go(href.review())
      return
    }
    setBusy('Reading the label')
    await readPendingScan()
    go(href.review())
  }

  return (
    <main className="screen" data-theme="dark">
      <div className="topbar">
        <IconButton icon="back" label="Back to Today" onClick={() => go(href.today())} />
        <h1 className="topbar-title topbar-title-strong" tabIndex={-1}>
          Scan a bag
        </h1>
      </div>

      {busy ? (
        <Spinner label={busy} />
      ) : (
        <div className="screen-scroll" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div className="camera-frame">
            <svg width="62%" viewBox="0 0 230 330" aria-hidden="true">
              <path d="M18 34h194v282a10 10 0 0 1-10 10H28a10 10 0 0 1-10-10z" fill="var(--raised)" />
              <path d="M12 6h206v32H12z" fill="var(--control)" />
              <rect x="44" y="120" width="142" height="118" rx="6" fill="var(--ground)" />
            </svg>
            <svg className="camera-corners" viewBox="0 0 350 440" preserveAspectRatio="none" aria-hidden="true">
              <path d="M60 120v-24h24M266 96h24v24M290 300v24h-24M84 324H60v-24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="stack" style={{ gap: 'var(--space-1)' }}>
            <p className="heading">Fit the front label inside the frame</p>
            <p className="muted">Labels in any language are read into English. You can check every field next.</p>
            {error ? (
              <p className="error-text" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      )}

      <div className="camera-bar">
        <button type="button" className="camera-side" style={{ justifySelf: 'start' }} onClick={() => library.current?.click()} disabled={!!busy}>
          <Icon name="photos" size={24} />
          Photos
        </button>
        <button type="button" className="shutter" aria-label="Take photo" onClick={() => camera.current?.click()} disabled={!!busy}>
          <span />
        </button>
        <button
          type="button"
          className="camera-side"
          style={{ justifySelf: 'end' }}
          disabled={!!busy}
          onClick={() => {
            setScan(null)
            go(href.review())
          }}
        >
          <Icon name="keyboard" size={24} />
          Type it in
        </button>
      </div>

      <input
        ref={camera}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take a photo of the label"
        tabIndex={-1}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <input
        ref={library}
        className="sr-only"
        type="file"
        accept="image/*"
        aria-label="Choose a photo of the label"
        tabIndex={-1}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </main>
  )
}
