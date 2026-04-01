import { useState, useRef, useEffect } from 'react'
import { analyzeCoffeeLabel } from '../api.js'
import {
  IconCamera, IconUpload, IconArrowRight, IconRefresh,
  IconGlobe, IconFlame, IconGear, IconLeaf, IconMountain, IconSparkle,
  IconScale, IconDroplet, IconThermometer, IconClock, IconGrid, IconRuler,
  IconLightbulb, IconCheck,
} from './Icons.jsx'
import './LabelScanner.css'

const STORAGE_KEY = 'brewmap_journal'
const MAX_DIM = 512

function isImageFile(file) {
  if (file.type.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|heic|heif|avif|tiff?|bmp)$/i.test(file.name)
}

function resizeImageForApi(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Could not process image. Please try a JPEG or PNG.')); return }
        const reader = new FileReader()
        reader.onload = e => resolve({ base64: e.target.result.split(',')[1], mimeType: 'image/jpeg' })
        reader.onerror = () => reject(new Error('Failed to read image file.'))
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.72)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
      if (isHeic) {
        reject(new Error('HEIC photos aren\'t supported by this browser. On iPhone, go to Settings → Camera → Formats → Most Compatible to save as JPEG.'))
      } else {
        reject(new Error('Could not decode this image. Please try a JPEG or PNG file.'))
      }
    }

    img.src = url
  })
}

function generateBrewGuide({ roastLevel = '', process: proc = '' }) {
  const r = roastLevel.toLowerCase()
  const isLight  = r.includes('light')
  const isDark   = r.includes('dark')
  const isNatural = /natural|honey|anaerobic/i.test(proc)

  const temp  = isLight ? '95°C'          : isDark ? '90°C'          : '93°C'
  const grind = isLight ? 'Medium-Fine'   : isDark ? 'Medium-Coarse' : 'Medium'
  const total = isLight ? '3:30'          : isDark ? '2:45'          : '3:10'

  const tips = isNatural
    ? `${proc} process coffees have natural sweetness — avoid over-extraction to preserve the fruit character.`
    : isLight
      ? 'Light roasts reward a longer bloom (up to 45 s) to unlock delicate floral and fruit notes.'
      : isDark
        ? 'Dark roasts extract quickly — watch your time closely to avoid bitterness.'
        : 'Pre-rinse your filter with hot water and use filtered water for the cleanest cup.'

  return {
    coffeeAmount: '15g', waterAmount: '240ml', ratio: '1:16',
    waterTemp: temp, grindSize: grind, totalTime: total,
    steps: [
      { name: 'Bloom',      water: '30ml',  waitUntil: '0:30', notes: 'Saturate grounds in a slow spiral. Let the bloom fully settle.' },
      { name: 'First Pour', water: '105ml', waitUntil: '1:30', notes: 'Steady circular pour from centre outward. Keep grounds submerged.' },
      { name: 'Final Pour', water: '105ml', waitUntil: total,  notes: 'Even finish pour. Aim for a flat bed as the coffee drains.' },
    ],
    tips,
  }
}

// Unique ID: timestamp + random suffix to avoid collisions
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function saveToJournal(coffeeData, imageDataUrl) {
  let existing = []
  try { existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch {}
  const entry = {
    id: uid(),
    savedAt: new Date().toISOString(),
    imageDataUrl,
    ...coffeeData,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...existing]))
}

// Persist scanner session so switching tabs doesn't lose state
const SESSION_KEY = 'brewmap_scanner_session'

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}

function persistSession(state) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)) } catch {}
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch {}
}

/* ===== Progress Bar ===== */
const STEP_LABELS = ['Scan', 'Confirm', 'Brew']

function ProgressBar({ current }) {
  return (
    <div className="scan-progress" aria-label="Progress">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1
        const done   = n < current
        const active = n === current
        return (
          <div key={label} className="scan-progress-track">
            {i > 0 && <div className={`scan-progress-line${done || active ? ' lit' : ''}`} />}
            <div className="scan-progress-step">
              <div className={`scan-dot${done ? ' done' : active ? ' active' : ''}`}>
                {done ? '✓' : n}
              </div>
              <span className={`scan-dot-label${active ? ' active' : ''}`}>{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ===== Main Component ===== */
export default function LabelScanner({ onBrewSaved }) {
  // Restore from sessionStorage so switching tabs doesn't lose progress
  const saved = loadSession()
  const [step, setStep]                   = useState(saved?.step ?? 'upload')
  const [preview, setPreview]             = useState(saved?.preview ?? null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [pendingFile, setPendingFile]     = useState(null)
  const [result, setResult]               = useState(saved?.result ?? null)
  const [error, setError]                 = useState(null)
  const [saving, setSaving]               = useState(false)  // prevent double-save
  const fileInputRef   = useRef(null)
  const cameraInputRef = useRef(null)

  // Persist step + result + preview to sessionStorage whenever they change
  useEffect(() => {
    // Don't persist loading state — restore to upload if interrupted
    const stepToSave = step === 'loading' ? 'upload' : step
    persistSession({ step: stepToSave, result, preview })
  }, [step, result, preview])

  function handleFileSelect(file) {
    if (!file) return
    if (!isImageFile(file)) {
      setError('Please upload an image file (JPEG, PNG, WEBP, HEIC, etc.)')
      return
    }
    setError(null)
    setPreviewFailed(false)
    setPendingFile(file)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  async function handleGo() {
    if (!pendingFile) return
    setError(null)
    setStep('loading')
    try {
      const { base64, mimeType } = await resizeImageForApi(pendingFile)
      const labelData  = await analyzeCoffeeLabel(base64, mimeType)
      const coffeeData = { ...labelData, brewGuide: generateBrewGuide(labelData) }
      setResult(coffeeData)
      setStep('confirm')
    } catch (e) {
      setError(e.message)
      setStep('upload')
    }
  }

  function handleNext() {
    if (saving) return   // prevent double-tap
    setSaving(true)
    if (result) {
      try {
        saveToJournal(result, preview)
        onBrewSaved()
      } catch (e) {
        console.warn('Could not save to journal:', e.message)
      }
    }
    setStep('recipe')
    setSaving(false)
  }

  function handleReset() {
    setStep('upload'); setPreview(null); setPreviewFailed(false)
    setPendingFile(null); setResult(null); setError(null); setSaving(false)
    clearSession()
    if (fileInputRef.current)   fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const progressStep = step === 'recipe' ? 3 : step === 'confirm' ? 2 : 1

  return (
    <section className="scanner-section">
      <ProgressBar current={progressStep} />

      {/* STEP 1 — Upload */}
      {step === 'upload' && (
        <>
          {!preview ? (
            <div className="upload-area">
              <div className="upload-orb-area">
                {/* 3D holographic orb */}
                <div className="upload-orb">
                  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <radialGradient id="orbBase" cx="38%" cy="32%" r="65%">
                        <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.95"/>
                        <stop offset="30%"  stopColor="#7DD3FC" stopOpacity="0.85"/>
                        <stop offset="60%"  stopColor="#2563EB" stopOpacity="0.9"/>
                        <stop offset="85%"  stopColor="#06B6D4" stopOpacity="0.95"/>
                        <stop offset="100%" stopColor="#0E7490" stopOpacity="1"/>
                      </radialGradient>
                      <radialGradient id="orbShine" cx="30%" cy="25%" r="40%">
                        <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.9"/>
                        <stop offset="60%"  stopColor="#FFFFFF" stopOpacity="0.15"/>
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0"/>
                      </radialGradient>
                      <radialGradient id="orbGloss" cx="65%" cy="70%" r="35%">
                        <stop offset="0%"   stopColor="#06B6D4" stopOpacity="0.5"/>
                        <stop offset="100%" stopColor="#06B6D4" stopOpacity="0"/>
                      </radialGradient>
                      <filter id="orbBlur">
                        <feGaussianBlur stdDeviation="1.5"/>
                      </filter>
                    </defs>
                    {/* Glow halo */}
                    <circle cx="60" cy="60" r="58" fill="rgba(6,182,212,0.12)" filter="url(#orbBlur)"/>
                    <circle cx="60" cy="60" r="52" fill="rgba(37,99,235,0.1)"  filter="url(#orbBlur)"/>
                    {/* Main sphere */}
                    <circle cx="60" cy="60" r="48" fill="url(#orbBase)"/>
                    {/* Glass shine */}
                    <circle cx="60" cy="60" r="48" fill="url(#orbShine)"/>
                    {/* Lower gloss */}
                    <circle cx="60" cy="60" r="48" fill="url(#orbGloss)"/>
                    {/* Specular highlight */}
                    <ellipse cx="44" cy="38" rx="14" ry="9" fill="white" opacity="0.55" transform="rotate(-20 44 38)"/>
                    <ellipse cx="40" cy="35" rx="6"  ry="3.5" fill="white" opacity="0.8" transform="rotate(-20 40 35)"/>
                    {/* Rim light */}
                    <circle cx="60" cy="60" r="48" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" fill="none"/>
                    {/* Bean silhouette inside orb */}
                    <g transform="translate(60,60)" opacity="0.2">
                      <ellipse cx="0" cy="0" rx="12" ry="18" stroke="white" strokeWidth="1.5" fill="none" transform="rotate(-15)"/>
                      <path d="M0 -16 C-5 -6 -5 6 0 16" stroke="white" strokeWidth="1" fill="none" transform="rotate(-15)"/>
                    </g>
                  </svg>
                </div>
                <p className="upload-hint">
                  Point your camera at a coffee bag label or upload a photo.
                  <br />
                  <span className="upload-hint-small">AI will extract details and build your brew guide.</span>
                </p>
              </div>
              <div className="upload-action-row">
                <span className="upload-action-label">Choose an option</span>
                <div className="upload-btn-row">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                    <button className="btn-circle primary" onClick={() => cameraInputRef.current?.click()}>
                      <IconCamera size={22} />
                    </button>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Camera</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                    <button className="btn-circle" onClick={() => fileInputRef.current?.click()}>
                      <IconUpload size={20} />
                    </button>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Upload</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="preview-card card">
              {previewFailed ? (
                <div className="preview-placeholder">
                  <IconCamera size={36} style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
                  <p>{pendingFile?.name ?? 'Image selected'}</p>
                  <p className="preview-placeholder-hint">Preview unavailable — tap Analyse to continue</p>
                </div>
              ) : (
                <img src={preview} alt="Coffee label preview" className="label-preview"
                  onError={() => setPreviewFailed(true)} />
              )}
              <div className="preview-footer">
                <button className="btn-go" onClick={handleGo}>
                  Analyse Label <IconArrowRight size={16} />
                </button>
                <button className="btn-secondary" onClick={handleReset}>
                  <IconRefresh size={15} /> Retake
                </button>
              </div>
            </div>
          )}

          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
            className="sr-only" onChange={e => handleFileSelect(e.target.files?.[0])} />
          <input ref={fileInputRef} type="file" accept="image/*"
            className="sr-only" onChange={e => handleFileSelect(e.target.files?.[0])} />
        </>
      )}

      {/* LOADING */}
      {step === 'loading' && (
        <div className="spinner-wrap card">
          <div className="spinner" />
          <p className="spinner-label">
            Analysing label…<br />
            <span style={{ fontSize: '0.8rem' }}>This takes about 5–10 seconds</span>
          </p>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      {/* STEP 2 — Confirm */}
      {step === 'confirm' && result && (
        <ConfirmCard data={result} preview={preview} onNext={handleNext} onReset={handleReset} saving={saving} />
      )}

      {/* STEP 3 — Recipe */}
      {step === 'recipe' && result && (
        <RecipeCard data={result} preview={preview} onReset={handleReset} />
      )}

      <footer className="section-footer">Made by tedb88</footer>
    </section>
  )
}

/* ===== Step 2: Confirm ===== */
function ConfirmCard({ data, preview, onNext, onReset, saving }) {
  const { name, origin, region, roastLevel, process, tastingNotes, variety, altitude } = data

  const fields = [
    origin      && { Icon: IconGlobe,    label: 'Origin',        value: origin + (region ? ` · ${region}` : '') },
    roastLevel  && { Icon: IconFlame,    label: 'Roast',         value: roastLevel },
    process     && { Icon: IconGear,     label: 'Process',       value: process },
    variety     && { Icon: IconLeaf,     label: 'Variety',       value: variety },
    altitude    && { Icon: IconMountain, label: 'Altitude',      value: altitude },
    tastingNotes?.length > 0 && { Icon: IconSparkle, label: 'Tasting Notes', value: tastingNotes.join(' · ') },
  ].filter(Boolean)

  return (
    <article className="confirm-card card" style={{ animation: 'fadeUp 0.22s ease both' }}>
      <div className="confirm-header">
        {preview && <img src={preview} alt={name} className="confirm-thumb" />}
        <div className="confirm-header-text">
          <span className="confirm-extracted-tag">Extracted from label</span>
          <h2 className="confirm-name">{name || 'Unknown Coffee'}</h2>
        </div>
      </div>

      <ul className="confirm-fields">
        {fields.map(({ Icon, label, value }) => (
          <li key={label} className="confirm-field">
            <span className="confirm-field-icon"><Icon size={14} /></span>
            <div className="confirm-field-body">
              <span className="confirm-field-label">{label}</span>
              <span className="confirm-field-value">{value}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="confirm-footer">
        <p className="confirm-question">Does this look correct?</p>
        <div className="confirm-actions">
          <button className="btn-primary" onClick={onNext} disabled={saving}>
            Confirm &amp; see recipe <IconArrowRight size={15} />
          </button>
          <button className="btn-secondary" onClick={onReset}>
            <IconRefresh size={14} /> Start over
          </button>
        </div>
      </div>
    </article>
  )
}

/* ===== Step 3: Recipe ===== */
function RecipeCard({ data, preview, onReset }) {
  const { name, brewGuide } = data

  return (
    <article className="brew-guide-card card" style={{ animation: 'fadeUp 0.22s ease both' }}>
      <div className="brew-guide-header">
        {preview && <img src={preview} alt={name} className="brew-guide-thumb" />}
        <div className="brew-guide-meta">
          <div className="saved-inline-badge"><IconCheck size={12} /> Saved to Journal</div>
          <h2 className="brew-guide-name">{name || 'Unknown Coffee'}</h2>
          <p className="brew-recipe-subtitle">Your personalised pour-over guide</p>
        </div>
      </div>

      {brewGuide && (
        <div className="brew-guide-body">
          <h3 className="brew-section-title">Hand-Drip Brew Guide</h3>

          <div className="brew-params">
            {[
              { Icon: IconScale,       label: 'Coffee',     value: brewGuide.coffeeAmount },
              { Icon: IconDroplet,     label: 'Water',      value: brewGuide.waterAmount },
              { Icon: IconRuler,       label: 'Ratio',      value: brewGuide.ratio },
              { Icon: IconThermometer, label: 'Temp',       value: brewGuide.waterTemp },
              { Icon: IconGrid,        label: 'Grind',      value: brewGuide.grindSize },
              { Icon: IconClock,       label: 'Total Time', value: brewGuide.totalTime },
            ].map(({ Icon, label, value }) => value ? (
              <div key={label} className="brew-param">
                <span className="brew-param-icon"><Icon size={15} /></span>
                <span className="brew-param-label">{label}</span>
                <span className="brew-param-value">{value}</span>
              </div>
            ) : null)}
          </div>

          {brewGuide.steps?.length > 0 && (
            <div className="pour-steps">
              <h4 className="pour-steps-title">Pour Steps</h4>
              <ol className="steps-list">
                {brewGuide.steps.map((s, i) => (
                  <li key={i} className="step-item">
                    <div className="step-header">
                      <span className="step-number">{i + 1}</span>
                      <span className="step-name">{s.name}</span>
                      <span className="step-meta">
                        {s.water     && <span className="step-water"><IconDroplet size={11} /> {s.water}</span>}
                        {s.waitUntil && <span className="step-time"><IconClock size={11} /> until {s.waitUntil}</span>}
                      </span>
                    </div>
                    {s.notes && <p className="step-notes">{s.notes}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {brewGuide.tips && (
            <div className="brew-tip">
              <span className="brew-tip-icon"><IconLightbulb size={15} /></span>
              <span>{brewGuide.tips}</span>
            </div>
          )}
        </div>
      )}

      <div className="brew-guide-actions">
        <button className="btn-secondary" onClick={onReset}>
          <IconCamera size={15} /> Scan Another Label
        </button>
      </div>
    </article>
  )
}
