import { useState, useRef, useEffect, useMemo } from 'react'
import { scanLabel, getRecipe } from '../lib/api.ts'
import { prepareImage, rejectReason } from '../lib/image.ts'
import { EMPTY_FORM, FORM_TO_SCAN, attributesFromForm, beanDraftFromForm, formFromScan } from '../lib/beanForm.ts'
import { saveScannedBrew } from '../data/repositories.ts'
import { COUNTRIES } from '../domain/normalise/country.ts'
import { PROCESSES, ROAST_LEVELS, label } from '../domain/enums.ts'
import { defaultDose } from '../domain/recipe/baseline.ts'
import { baselineRecipe } from '../domain/recipe/engine.ts'
import { formatRecipe } from '../domain/recipe/format.ts'
import { POURS_BY_TASTE, V60 } from '../domain/rules/index.ts'
import {
  IconCamera, IconUpload, IconArrowRight, IconRefresh,
  IconScale, IconDroplet, IconThermometer, IconClock, IconGrid, IconRuler,
  IconLightbulb, IconCheck,
} from './Icons.jsx'
import './LabelScanner.css'

const COUNTRY_OPTIONS = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))
const EMPTY_FLAVOR = { taste: null, body: null, acidity: null }

// Keep progress through a reload (photos stay in memory only).
const SESSION_KEY = 'brewmap_scanner_session'

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}

function persistSession(state) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)) } catch { /* private mode */ }
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* private mode */ }
}

function fallbackMessage(reason) {
  if (reason === 'offline') return 'You are offline, so this recipe comes from BrewMap’s brewing rules.'
  return 'AI personalisation is not available right now, so this recipe comes from BrewMap’s brewing rules.'
}

/* ===== Progress Bar ===== */
const STEP_LABELS = ['Scan', 'Confirm', 'Customize', 'Brew']

function ProgressBar({ current }) {
  return (
    <div className="scan-progress" aria-label="Progress">
      {STEP_LABELS.map((stepLabel, i) => {
        const n = i + 1
        const done   = n < current
        const active = n === current
        return (
          <div key={stepLabel} className="scan-progress-track">
            {i > 0 && <div className={`scan-progress-line${done || active ? ' lit' : ''}`} />}
            <div className="scan-progress-step">
              <div className={`scan-dot${done ? ' done' : active ? ' active' : ''}`}>
                {done ? '✓' : n}
              </div>
              <span className={`scan-dot-label${active ? ' active' : ''}`}>{stepLabel}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ===== Main Component ===== */
export default function LabelScanner({ onBrewSaved }) {
  const [saved] = useState(loadSession)
  const [step, setStep]                   = useState(saved?.step ?? 'upload')
  const [image, setImage]                 = useState(null)   // PreparedImage, kept in memory
  const [previewFailed, setPreviewFailed] = useState(false)
  const [scan, setScan]                   = useState(saved?.scan ?? null)
  const [form, setForm]                   = useState(saved?.form ?? EMPTY_FORM)
  const [coffeeDose, setCoffeeDose]       = useState(saved?.coffeeDose ?? 15)
  const [flavorProfile, setFlavorProfile] = useState(saved?.flavorProfile ?? EMPTY_FLAVOR)
  const [outcome, setOutcome]             = useState(saved?.outcome ?? null) // { recipe, fallback, reason }
  const [saveState, setSaveState]         = useState(saved?.saveState ?? null) // 'saved' | error message
  const [error, setError]                 = useState(null)
  const [scanFailed, setScanFailed]       = useState(false)
  const [preparing, setPreparing]         = useState(false)
  const [busy, setBusy]                   = useState(false)
  const fileInputRef   = useRef(null)
  const cameraInputRef = useRef(null)

  useEffect(() => {
    const stepToSave = step === 'loading' ? 'upload' : step === 'flavor' ? 'confirm' : step
    persistSession({ step: stepToSave, scan, form, coffeeDose, flavorProfile, outcome, saveState })
  }, [step, scan, form, coffeeDose, flavorProfile, outcome, saveState])

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.previewUrl) }, [image])

  async function handleFileSelect(file) {
    if (!file) return
    const reason = rejectReason(file)
    if (reason) { setError(reason); return }
    setError(null)
    setScanFailed(false)
    setPreviewFailed(false)
    setPreparing(true)
    try {
      setImage(await prepareImage(file))
    } catch (e) {
      setError(e.message)
      setScanFailed(true)
    } finally {
      setPreparing(false)
    }
  }

  async function handleGo() {
    if (!image) return
    setError(null)
    setScanFailed(false)
    setStep('loading')
    const res = await scanLabel(image.api)
    if (res.ok) {
      setScan(res.scan)
      setForm(formFromScan(res.scan))
      setCoffeeDose(defaultDose({ originCountry: res.scan.fields.originCountry }))
      setStep('confirm')
    } else {
      // CAP-08: no dead ends. Keep the photo; offer retry and manual entry.
      setError(res.message)
      setScanFailed(true)
      setStep('upload')
    }
  }

  function handleManual() {
    setError(null)
    setScan(null)
    setForm(EMPTY_FORM)
    setCoffeeDose(15)
    setStep('confirm')
  }

  async function handleGenerate() {
    if (busy) return
    setBusy(true)
    const result = await getRecipe({ bean: attributesFromForm(form), doseG: coffeeDose, preferences: flavorProfile })
    let state = 'saved'
    try {
      await saveScannedBrew({ bean: beanDraftFromForm(form, scan), recipe: result.recipe, photo: image?.photo ?? null })
      onBrewSaved()
    } catch (e) {
      state = e.name === 'StorageFullError' ? e.message : 'This brew could not be saved to your journal. Your recipe is below.'
    }
    setOutcome(result)
    setSaveState(state)
    setStep('recipe')
    setBusy(false)
  }

  function handleReset() {
    setStep('upload'); setImage(null); setPreviewFailed(false)
    setScan(null); setForm(EMPTY_FORM); setError(null); setScanFailed(false); setBusy(false); setCoffeeDose(15)
    setFlavorProfile(EMPTY_FLAVOR); setOutcome(null); setSaveState(null)
    clearSession()
    if (fileInputRef.current)   fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const progressStep = step === 'recipe' ? 4 : step === 'flavor' ? 3 : step === 'confirm' ? 2 : 1
  const preview = image?.previewUrl ?? null

  return (
    <section className="scanner-section">
      <ProgressBar current={progressStep} />

      {/* STEP 1 — Upload */}
      {step === 'upload' && (
        <>
          {!image ? (
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
                  <span className="upload-hint-small">BrewMap reads the details and builds your V60 recipe.</span>
                </p>
              </div>
              <div className="upload-action-row">
                <span className="upload-action-label">Choose an option</span>
                <div className="upload-btn-row">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                    <button className="btn-circle primary" aria-label="Take a photo" onClick={() => cameraInputRef.current?.click()}>
                      <IconCamera size={22} />
                    </button>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Camera</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                    <button className="btn-circle" aria-label="Upload a photo" onClick={() => fileInputRef.current?.click()}>
                      <IconUpload size={20} />
                    </button>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Upload</span>
                  </div>
                </div>
                <button className="btn-link" onClick={handleManual}>No photo? Type the details in</button>
              </div>
            </div>
          ) : (
            <div className="preview-card card">
              {previewFailed ? (
                <div className="preview-placeholder">
                  <IconCamera size={36} style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
                  <p className="preview-placeholder-hint">Preview unavailable. Tap Analyse to continue.</p>
                </div>
              ) : (
                <img src={preview} alt="Coffee label preview" className="label-preview"
                  onError={() => setPreviewFailed(true)} />
              )}
              <div className="preview-footer">
                <button className="btn-go" onClick={handleGo}>
                  {scanFailed ? 'Try again' : 'Analyse label'} <IconArrowRight size={16} />
                </button>
                {scanFailed ? (
                  <button className="btn-secondary" onClick={handleManual}>Type the details in</button>
                ) : (
                  <button className="btn-secondary" onClick={handleReset}>
                    <IconRefresh size={15} /> Retake
                  </button>
                )}
              </div>
            </div>
          )}

          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
            className="sr-only" aria-label="Take a photo of the label" onChange={e => handleFileSelect(e.target.files?.[0])} />
          <input ref={fileInputRef} type="file" accept="image/*"
            className="sr-only" aria-label="Choose a photo of the label" onChange={e => handleFileSelect(e.target.files?.[0])} />
        </>
      )}

      {preparing && (
        <div className="spinner-wrap card">
          <div className="spinner" />
          <p className="spinner-label">Preparing the photo…</p>
        </div>
      )}

      {/* LOADING — label reading */}
      {step === 'loading' && (
        <div className="spinner-wrap card">
          <div className="spinner" />
          <p className="spinner-label">
            Reading label (any language, output in English)…<br />
            <span style={{ fontSize: '0.8rem' }}>This takes about 5–10 seconds</span>
          </p>
        </div>
      )}

      {/* LOADING — recipe */}
      {busy && (
        <div className="spinner-wrap card">
          <div className="spinner" />
          <p className="spinner-label">
            Building your recipe…<br />
            <span style={{ fontSize: '0.8rem' }}>Dialling in the parameters</span>
          </p>
        </div>
      )}

      {error && (
        <div className="error-box" role="alert">
          {error}
          {scanFailed && !image && (
            <div className="error-actions">
              <button className="btn-secondary" onClick={handleManual}>Type the details in</button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — Confirm and edit, choose a dose */}
      {step === 'confirm' && !busy && (
        <ConfirmCard scan={scan} form={form} setForm={setForm} preview={preview}
          onNext={() => setStep('flavor')} onReset={handleReset}
          coffeeDose={coffeeDose} setCoffeeDose={setCoffeeDose} />
      )}

      {/* STEP 3 — Flavor profile */}
      {step === 'flavor' && !busy && (
        <FlavorCard
          flavorProfile={flavorProfile}
          setFlavorProfile={setFlavorProfile}
          onGenerate={handleGenerate}
          onBack={() => setStep('confirm')}
          busy={busy}
        />
      )}

      {/* STEP 4 — Recipe */}
      {step === 'recipe' && outcome && (
        <RecipeCard name={form.name} outcome={outcome} saveState={saveState} preview={preview} onReset={handleReset} />
      )}

      <footer className="section-footer">Made by tedb88</footer>
    </section>
  )
}

/* ===== Dose Presets ===== */
const DOSE_PRESETS = [
  { label: '1 cup',   grams: 15 },
  { label: '2 cups',  grams: 25 },
  { label: 'Strong',  grams: 18 },
  { label: 'Light',   grams: 12 },
]

/** ISO 639-1 → English name for UI; returns null if no hint needed */
function labelLanguageHint(code) {
  if (!code || typeof code !== 'string') return null
  const norm = code.trim().toLowerCase().split(/[-_]/)[0]
  if (!norm || norm === 'en' || norm === 'unknown') return null
  const NAMES = {
    ja: 'Japanese', ko: 'Korean', zh: 'Chinese', es: 'Spanish', fr: 'French', de: 'German',
    it: 'Italian', pt: 'Portuguese', th: 'Thai', vi: 'Vietnamese', id: 'Indonesian',
    nl: 'Dutch', pl: 'Polish', ru: 'Russian', ar: 'Arabic', tr: 'Turkish', sv: 'Swedish',
    da: 'Danish', fi: 'Finnish', no: 'Norwegian', cs: 'Czech', hu: 'Hungarian',
    hi: 'Hindi', uk: 'Ukrainian', he: 'Hebrew', el: 'Greek',
  }
  const name = NAMES[norm] || norm.toUpperCase()
  return `Extracted text was translated to English (detected: ${name}).`
}

const TEXT_FIELDS = [
  { key: 'name',       label: 'Coffee name', placeholder: 'e.g. Guji Hambela' },
  { key: 'roaster',    label: 'Roaster' },
  { key: 'region',     label: 'Region',        placeholder: 'e.g. Yirgacheffe' },
  { key: 'producer',   label: 'Farm or producer' },
  { key: 'varieties',  label: 'Varieties',     placeholder: 'e.g. Heirloom, 74110' },
  { key: 'altitude',   label: 'Altitude',      placeholder: 'e.g. 1,900–2,100 m' },
  { key: 'labelNotes', label: 'Tasting notes', placeholder: 'e.g. jasmine, peach' },
  { key: 'netWeightG', label: 'Bag weight (g)', inputMode: 'numeric' },
]

function Field({ id, fieldLabel, flag, children }) {
  return (
    <li className={`confirm-field edit${flag ? ' flagged' : ''}`}>
      <div className="confirm-field-body">
        <label className="confirm-field-label" htmlFor={id}>{fieldLabel}</label>
        {children}
        {flag && <span className="field-flag" id={`${id}-flag`}>{flag}</span>}
      </div>
    </li>
  )
}

/* ===== Step 2: Confirm ===== */
function ConfirmCard({ scan, form, setForm, preview, onNext, onReset, coffeeDose, setCoffeeDose }) {
  const translateHint = labelLanguageHint(scan?.labelLanguage)
  const flags = scan?.flags ?? {}
  const flagFor = (key) => flags[FORM_TO_SCAN[key]] ?? null
  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))
  const today = new Date().toISOString().slice(0, 10)

  // The live preview uses the same engine as the recipe (RCP-05).
  const live = useMemo(() => baselineRecipe({ bean: attributesFromForm(form), doseG: coffeeDose }), [form, coffeeDose])

  function handleDoseChange(e) {
    const v = parseInt(e.target.value, 10)
    if (!isNaN(v) && v >= V60.bounds.doseG.min && v <= V60.bounds.doseG.max) setCoffeeDose(v)
  }

  const fieldProps = (key) => ({
    id: `bean-${key}`,
    className: `field-input${flagFor(key) ? ' flagged' : ''}`,
    value: form[key],
    onChange: set(key),
    'aria-describedby': flagFor(key) ? `bean-${key}-flag` : undefined,
  })

  return (
    <article className="confirm-card card" style={{ animation: 'fadeUp 0.22s ease both' }}>
      <div className="confirm-header">
        {preview && <img src={preview} alt="" className="confirm-thumb" />}
        <div className="confirm-header-text">
          <span className="confirm-extracted-tag">{scan ? 'Extracted from label · check and edit' : 'Enter the details from the bag'}</span>
          {translateHint && <p className="confirm-translate-hint">{translateHint}</p>}
          <h2 className="confirm-name">{form.name || (scan ? 'Unknown coffee' : 'New coffee')}</h2>
        </div>
      </div>

      <ul className="confirm-fields">
        <Field id="bean-name" fieldLabel="Coffee name" flag={flagFor('name')}>
          <input type="text" maxLength={120} placeholder="e.g. Guji Hambela" {...fieldProps('name')} />
        </Field>
        <Field id="bean-roaster" fieldLabel="Roaster" flag={flagFor('roaster')}>
          <input type="text" maxLength={120} {...fieldProps('roaster')} />
        </Field>
        <Field id="bean-originCountry" fieldLabel="Origin country" flag={flagFor('originCountry')}>
          <select {...fieldProps('originCountry')}>
            <option value="">Not sure</option>
            {COUNTRY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field id="bean-process" fieldLabel="Process" flag={flagFor('process')}>
          <select {...fieldProps('process')}>
            <option value="">Not sure</option>
            {PROCESSES.map(p => <option key={p} value={p}>{label(p)}</option>)}
          </select>
        </Field>
        <Field id="bean-roastLevel" fieldLabel="Roast level" flag={flagFor('roastLevel')}>
          <select {...fieldProps('roastLevel')}>
            <option value="">Not sure</option>
            {ROAST_LEVELS.map(r => <option key={r} value={r}>{label(r)}</option>)}
          </select>
        </Field>
        <Field id="bean-roastDate" fieldLabel="Roast date" flag={flagFor('roastDate')}>
          <input type="date" max={today} {...fieldProps('roastDate')} />
        </Field>
        {TEXT_FIELDS.slice(2).map(f => (
          <Field key={f.key} id={`bean-${f.key}`} fieldLabel={f.label} flag={flagFor(f.key)}>
            <input type="text" maxLength={f.key === 'labelNotes' ? 300 : 120} placeholder={f.placeholder} inputMode={f.inputMode} {...fieldProps(f.key)} />
          </Field>
        ))}
      </ul>

      {/* Dose picker */}
      <div className="dose-picker">
        <div className="dose-picker-label">
          <IconScale size={14} />
          <span>How much coffee?</span>
        </div>

        <div className="dose-presets">
          {DOSE_PRESETS.map(p => (
            <button
              key={p.label}
              className={`dose-preset-btn${coffeeDose === p.grams ? ' active' : ''}`}
              onClick={() => setCoffeeDose(p.grams)}
            >
              {p.label}
              <span className="dose-preset-g">{p.grams}g</span>
            </button>
          ))}
        </div>

        <div className="dose-custom-row">
          <div className="dose-slider-wrap">
            <input
              type="range"
              min={V60.bounds.doseG.min}
              max={V60.bounds.doseG.max}
              step="1"
              value={coffeeDose}
              onChange={handleDoseChange}
              className="dose-slider"
              aria-label="Coffee dose in grams"
            />
          </div>
          <div className="dose-display">
            <input
              type="number"
              min={V60.bounds.doseG.min}
              max={V60.bounds.doseG.max}
              value={coffeeDose}
              onChange={handleDoseChange}
              className="dose-input"
              aria-label="Coffee dose in grams"
            />
            <span className="dose-unit">g</span>
          </div>
        </div>

        <p className="dose-water-preview">
          <IconDroplet size={12} /> {live.waterG} g water (1:{live.ratio} ratio)
        </p>
      </div>

      <div className="confirm-footer">
        <div className="confirm-actions">
          <button className="btn-primary" onClick={onNext}>
            Customize <IconArrowRight size={15} />
          </button>
          <button className="btn-secondary" onClick={onReset}>
            <IconRefresh size={14} /> Start over
          </button>
        </div>
      </div>
    </article>
  )
}

/* ===== Step 3: Flavor Profile ===== */
const poursHint = (taste) => `${POURS_BY_TASTE[taste]} pours`

const FLAVOR_SECTIONS = [
  {
    key: 'taste',
    label: 'Taste profile',
    options: [
      { value: 'fruity',     label: 'Fruity',           hint: poursHint('fruity') },
      { value: 'floral',     label: 'Floral',           hint: poursHint('floral') },
      { value: 'chocolatey', label: 'Chocolatey/Nutty', hint: poursHint('chocolatey') },
      { value: 'balanced',   label: 'Balanced',         hint: poursHint('balanced') },
    ],
  },
  {
    key: 'body',
    label: 'Body & strength',
    options: [
      { value: 'light',        label: 'Light & delicate' },
      { value: 'medium',       label: 'Medium body' },
      { value: 'strong',       label: 'Full & strong' },
      { value: 'concentrated', label: 'Concentrated' },
    ],
  },
  {
    key: 'acidity',
    label: 'Acidity',
    options: [
      { value: 'bright',   label: 'Bright & sparkling' },
      { value: 'smooth',   label: 'Mild & smooth' },
      { value: 'lowacid',  label: 'Low acid' },
    ],
  },
]

function FlavorCard({ flavorProfile, setFlavorProfile, onGenerate, onBack, busy }) {
  function toggle(key, value) {
    setFlavorProfile(prev => ({ ...prev, [key]: prev[key] === value ? null : value }))
  }

  return (
    <article className="flavor-card card" style={{ animation: 'fadeUp 0.22s ease both' }}>
      <div className="flavor-card-header">
        <h2 className="flavor-card-title">How do you like your coffee?</h2>
        <p className="flavor-card-sub">All optional — skip any you don't mind</p>
      </div>

      {FLAVOR_SECTIONS.map(({ key, label: sectionLabel, options }) => (
        <div key={key} className="flavor-section" role="group" aria-label={sectionLabel}>
          <p className="flavor-section-label">{sectionLabel}</p>
          <div className="flavor-options">
            {options.map(({ value, label: optLabel, hint }) => (
              <button
                key={value}
                className={`flavor-btn${flavorProfile[key] === value ? ' active' : ''}`}
                aria-pressed={flavorProfile[key] === value}
                onClick={() => toggle(key, value)}
              >
                {optLabel}
                {hint && <span className="flavor-btn-hint">{hint}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flavor-footer">
        <div className="confirm-actions">
          <button className="btn-primary" onClick={onGenerate} disabled={busy}>
            Generate recipe <IconArrowRight size={15} />
          </button>
          <button className="btn-secondary" onClick={onBack}>
            <IconArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back
          </button>
        </div>
      </div>
    </article>
  )
}

/* ===== Step 4: Recipe ===== */
function RecipeCard({ name, outcome, saveState, preview, onReset }) {
  const brewGuide = formatRecipe(outcome.recipe)

  return (
    <article className="brew-guide-card card" style={{ animation: 'fadeUp 0.22s ease both' }}>
      <div className="brew-guide-header">
        {preview && <img src={preview} alt="" className="brew-guide-thumb" />}
        <div className="brew-guide-meta">
          {saveState === 'saved'
            ? <div className="saved-inline-badge"><IconCheck size={12} /> Saved to Journal</div>
            : <div className="save-error" role="alert">{saveState}</div>}
          <h2 className="brew-guide-name">{name || 'Unnamed coffee'}</h2>
          <p className="brew-recipe-subtitle">Your personalised pour-over guide</p>
        </div>
      </div>

      <div className="brew-guide-body">
        <h3 className="brew-section-title">V60 Brew Guide</h3>

        {outcome.fallback && <p className="recipe-source-note">{fallbackMessage(outcome.reason)}</p>}

        <div className="brew-params">
          {[
            { Icon: IconScale,       label: 'Coffee',     value: brewGuide.coffeeAmount },
            { Icon: IconDroplet,     label: 'Water',      value: brewGuide.waterAmount },
            { Icon: IconRuler,       label: 'Ratio',      value: brewGuide.ratio },
            { Icon: IconThermometer, label: 'Temp',       value: brewGuide.waterTemp },
            { Icon: IconGrid,        label: 'Grind',      value: brewGuide.grindSize },
            { Icon: IconClock,       label: 'Total Time', value: brewGuide.totalTime },
          ].map(({ Icon, label: paramLabel, value }) => value ? (
            <div key={paramLabel} className="brew-param">
              <span className="brew-param-icon"><Icon size={15} /></span>
              <span className="brew-param-label">{paramLabel}</span>
              <span className="brew-param-value">{value}</span>
            </div>
          ) : null)}
        </div>

        {brewGuide.steps.length > 0 && (
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

      <div className="brew-guide-actions">
        <button className="btn-secondary" onClick={onReset}>
          <IconCamera size={15} /> Scan Another Label
        </button>
      </div>
    </article>
  )
}
