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

/*
 * Origin profiles — SCA-aligned defaults for common origins.
 * Each profile tweaks ratio, temp, grind, bloom, and timing to suit the
 * typical density, altitude, and flavour profile of that origin.
 */
const ORIGIN_PROFILES = {
  ethiopia:   { ratio: '1:17', temp: 94, grind: 'Medium-Fine',   bloom: 40, total: '3:30', coffee: 15, notes: 'Ethiopian beans are high-altitude and dense — a longer bloom and finer grind unlock floral and fruit complexity.' },
  kenya:      { ratio: '1:16', temp: 95, grind: 'Medium-Fine',   bloom: 35, total: '3:20', coffee: 15, notes: 'Kenyan AA is bright and juicy. Higher temp brings out the sparkling acidity and blackcurrant notes.' },
  colombia:   { ratio: '1:16', temp: 93, grind: 'Medium',        bloom: 30, total: '3:10', coffee: 15, notes: 'Colombian coffees are balanced and forgiving — a classic medium extraction works well.' },
  brazil:     { ratio: '1:15', temp: 91, grind: 'Medium-Coarse', bloom: 35, total: '3:00', coffee: 16, notes: 'Brazilian beans are low-acid and full-bodied. Coarser grind and lower temp emphasise chocolate and nut sweetness.' },
  guatemala:  { ratio: '1:16', temp: 93, grind: 'Medium',        bloom: 30, total: '3:10', coffee: 15, notes: 'Guatemalan coffees pair well with a balanced extraction — expect cocoa, spice, and mild fruit.' },
  honduras:   { ratio: '1:16', temp: 92, grind: 'Medium',        bloom: 30, total: '3:05', coffee: 15, notes: 'Honduran beans offer caramel sweetness — a moderate approach lets the sugars shine.' },
  mexico:     { ratio: '1:16', temp: 92, grind: 'Medium',        bloom: 30, total: '3:05', coffee: 15, notes: 'Mexican coffees tend to be mild and nutty — keep extraction even for a clean, sweet cup.' },
  costarica:  { ratio: '1:16', temp: 93, grind: 'Medium-Fine',   bloom: 30, total: '3:15', coffee: 15, notes: 'Costa Rican honey-processed lots shine with a slightly finer grind to draw out honey and stone-fruit notes.' },
  panama:     { ratio: '1:17', temp: 94, grind: 'Medium-Fine',   bloom: 40, total: '3:30', coffee: 14, notes: 'Panamanian Gesha is delicate — use more water and a longer bloom to capture jasmine and bergamot.' },
  indonesia:  { ratio: '1:14', temp: 90, grind: 'Medium-Coarse', bloom: 35, total: '2:50', coffee: 16, notes: 'Indonesian wet-hulled coffees are earthy and heavy — a shorter, coarser brew prevents muddiness.' },
  yemen:      { ratio: '1:16', temp: 94, grind: 'Medium-Fine',   bloom: 40, total: '3:25', coffee: 15, notes: 'Yemeni beans are wild and complex — a longer bloom and higher temp coax out dried-fruit and spice layers.' },
  rwanda:     { ratio: '1:16', temp: 94, grind: 'Medium-Fine',   bloom: 35, total: '3:20', coffee: 15, notes: 'Rwandan lots are bright and tea-like. A finer grind brings out red-fruit and floral sweetness.' },
}

/* Process adjustments — applied on top of origin defaults */
const PROCESS_ADJUSTMENTS = {
  natural:  { tempDelta: -1, grindShift: 1, bloomDelta: 5,  ratioShift: -1, tip: 'Natural process adds fruity sweetness — lower temp and coarser grind prevent over-extraction of fermented sugars.' },
  honey:    { tempDelta: -1, grindShift: 0, bloomDelta: 5,  ratioShift: 0,  tip: 'Honey process retains mucilage sweetness — a slightly lower temp preserves the caramel and stone-fruit character.' },
  anaerobic:{ tempDelta: -2, grindShift: 1, bloomDelta: 10, ratioShift: -1, tip: 'Anaerobic fermentation intensifies flavour — go coarser and cooler to keep the funky fruit notes in balance.' },
  washed:   { tempDelta: 0,  grindShift: 0, bloomDelta: 0,  ratioShift: 0,  tip: 'Washed process gives a clean cup — standard parameters let terroir and acidity speak clearly.' },
  wethulled:{ tempDelta: -1, grindShift: 1, bloomDelta: 0,  ratioShift: 1,  tip: 'Wet-hulled (Giling Basah) coffees are earthy — coarser grind tames the heavy body.' },
}

/* Roast-level adjustments — applied on top of origin + process */
const ROAST_ADJUSTMENTS = {
  light:       { tempDelta: 2,  grindShift: -1, timeDelta: 15 },
  mediumlight: { tempDelta: 1,  grindShift: 0,  timeDelta: 5 },
  medium:      { tempDelta: 0,  grindShift: 0,  timeDelta: 0 },
  mediumdark:  { tempDelta: -1, grindShift: 1,  timeDelta: -10 },
  dark:        { tempDelta: -3, grindShift: 2,  timeDelta: -20 },
}

const GRIND_SCALE = ['Fine', 'Medium-Fine', 'Medium', 'Medium-Coarse', 'Coarse']

function shiftGrind(base, delta) {
  const idx = GRIND_SCALE.indexOf(base)
  if (idx === -1) return base
  return GRIND_SCALE[Math.max(0, Math.min(GRIND_SCALE.length - 1, idx + delta))]
}

function parseRatio(r) {
  const m = r.match(/1:(\d+)/)
  return m ? parseInt(m[1], 10) : 16
}

function addSeconds(timeStr, deltaSec) {
  const [m, s] = timeStr.split(':').map(Number)
  const totalSec = Math.max(120, m * 60 + s + deltaSec)
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
}

function generateBrewGuide({ origin = '', roastLevel = '', process: proc = '' }) {
  // 1. Look up origin profile (fall back to generic Colombia-like defaults)
  const originKey = origin.toLowerCase().replace(/\s+/g, '')
  const base = ORIGIN_PROFILES[originKey] || {
    ratio: '1:16', temp: 93, grind: 'Medium', bloom: 30, total: '3:10', coffee: 15,
    notes: 'Pre-rinse your filter with hot water and use filtered water for the cleanest cup.',
  }

  // 2. Apply process adjustment
  const procKey = proc.toLowerCase().replace(/[\s-]+/g, '')
  const pa = PROCESS_ADJUSTMENTS[procKey] || PROCESS_ADJUSTMENTS.washed

  let temp  = base.temp + pa.tempDelta
  let grind = shiftGrind(base.grind, pa.grindShift)
  let bloom = base.bloom + pa.bloomDelta
  let ratio = parseRatio(base.ratio) + pa.ratioShift
  let totalTime = base.total
  let coffee = base.coffee

  // 3. Apply roast adjustment
  const roastKey = roastLevel.toLowerCase().replace(/[\s-]+/g, '')
  const ra = ROAST_ADJUSTMENTS[roastKey] || ROAST_ADJUSTMENTS.medium

  temp  = Math.max(85, Math.min(98, temp + ra.tempDelta))
  grind = shiftGrind(grind, ra.grindShift)
  totalTime = addSeconds(totalTime, ra.timeDelta)

  // 4. Compute water amounts from ratio + coffee
  const totalWater = coffee * ratio
  const bloomWater = Math.round(coffee * 2)
  const remaining  = totalWater - bloomWater
  const firstPour  = Math.round(remaining * 0.5)
  const finalPour  = totalWater - bloomWater - firstPour

  // 5. Compute step timings
  const bloomEnd   = `0:${String(bloom).padStart(2, '0')}`
  const [totalM, totalS] = totalTime.split(':').map(Number)
  const totalSec   = totalM * 60 + totalS
  const firstEnd   = `${Math.floor((bloom + (totalSec - bloom) * 0.45) / 60)}:${String(Math.round((bloom + (totalSec - bloom) * 0.45) % 60)).padStart(2, '0')}`

  // 6. Build tips — combine process tip + origin note
  const tips = pa.tip + ' ' + base.notes

  return {
    coffeeAmount: `${coffee}g`,
    waterAmount:  `${totalWater}ml`,
    ratio:        `1:${ratio}`,
    waterTemp:    `${temp}°C`,
    grindSize:    grind,
    totalTime,
    steps: [
      { name: 'Bloom',      water: `${bloomWater}ml`, waitUntil: bloomEnd,  notes: `Saturate grounds in a slow spiral. Let CO₂ release for ${bloom} seconds.` },
      { name: 'First Pour', water: `${firstPour}ml`,  waitUntil: firstEnd,  notes: 'Steady circular pour from centre outward. Keep the slurry level even.' },
      { name: 'Final Pour', water: `${finalPour}ml`,  waitUntil: totalTime, notes: 'Gentle finish pour. Aim for a flat, even bed as the last drops drain through.' },
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
  const data = [entry, ...existing]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Quota exceeded — retry without images to ensure recipe data is saved
    const slim = data.map(({ imageDataUrl: _img, ...rest }) => rest)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
    } catch {
      // Still failing — drop oldest entries until it fits
      const trimmed = slim.slice(0, Math.max(1, slim.length - 5))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    }
  }
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
                {/* 3D holographic coffee bean */}
                <div className="upload-orb">
                  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <radialGradient id="beanBase" cx="35%" cy="30%" r="70%">
                        <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.95"/>
                        <stop offset="25%"  stopColor="#FCA5A5" stopOpacity="0.9"/>
                        <stop offset="55%"  stopColor="#DC2626" stopOpacity="0.92"/>
                        <stop offset="82%"  stopColor="#F97316" stopOpacity="0.96"/>
                        <stop offset="100%" stopColor="#9A3412" stopOpacity="1"/>
                      </radialGradient>
                      <radialGradient id="beanShine" cx="28%" cy="22%" r="42%">
                        <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.92"/>
                        <stop offset="55%"  stopColor="#FFFFFF" stopOpacity="0.18"/>
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0"/>
                      </radialGradient>
                      <radialGradient id="beanGloss" cx="68%" cy="72%" r="38%">
                        <stop offset="0%"   stopColor="#F97316" stopOpacity="0.55"/>
                        <stop offset="100%" stopColor="#F97316" stopOpacity="0"/>
                      </radialGradient>
                      <filter id="beanBlur">
                        <feGaussianBlur stdDeviation="2"/>
                      </filter>
                    </defs>
                    {/* Outer glow halo */}
                    <ellipse cx="60" cy="60" rx="44" ry="54" fill="rgba(249,115,22,0.14)" filter="url(#beanBlur)" transform="rotate(-18 60 60)"/>
                    <ellipse cx="60" cy="60" rx="36" ry="46" fill="rgba(220,38,38,0.10)" filter="url(#beanBlur)" transform="rotate(-18 60 60)"/>
                    {/* Main bean body — rotated ellipse */}
                    <g transform="rotate(-18 60 60)">
                      <ellipse cx="60" cy="60" rx="26" ry="42" fill="url(#beanBase)"/>
                      <ellipse cx="60" cy="60" rx="26" ry="42" fill="url(#beanShine)"/>
                      <ellipse cx="60" cy="60" rx="26" ry="42" fill="url(#beanGloss)"/>
                      {/* Centre crease — the defining coffee bean line */}
                      <path d="M60 19 C52 35, 68 58, 60 78 C55 90, 60 101, 60 101"
                        stroke="rgba(120,15,15,0.45)" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      {/* Specular highlight top-left */}
                      <ellipse cx="48" cy="38" rx="11" ry="6" fill="white" opacity="0.58" transform="rotate(-22 48 38)"/>
                      <ellipse cx="45" cy="34" rx="5" ry="2.8" fill="white" opacity="0.82" transform="rotate(-22 45 34)"/>
                      {/* Rim */}
                      <ellipse cx="60" cy="60" rx="26" ry="42" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" fill="none"/>
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
