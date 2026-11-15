// Check the label: "Did it read my bag correctly?" (UX design §2, screen 3).
// Every field is editable (CAP-03), unsure fields say why (CAP-04), a failed
// scan lands here with the photo kept (CAP-08), and the same form is manual
// entry (CAP-06) and bag editing (LOG-05).

import { useState } from 'react'
import { getBean, saveBean, updateBean } from '../../data/repositories.js'
import { PROCESSES, ROAST_LEVELS, label } from '../../domain/enums.js'
import { COUNTRIES } from '../../domain/normalise/country.js'
import { splitNotes } from '../../domain/normalise/text.js'
import type { ScanResult } from '../../domain/scan.js'
import {
  EMPTY_FORM,
  FORM_TO_SCAN,
  beanDraftFromForm,
  beanPatchFromForm,
  formFromBean,
  formFromScan,
  type BeanForm,
  type FormField,
} from '../../lib/beanForm.js'
import { fullDate } from '../../lib/display.js'
import { BagThumb, Button, Chip, Field, IconButton, Spinner } from '../../ui/components.js'
import { useToast } from '../App.js'
import { getScan, setScan } from '../flow.js'
import { go, href } from '../router.js'
import { bump, useLoad } from '../store.js'
import { readPendingScan } from './Scan.js'

const COUNTRY_OPTIONS = [
  { value: '', label: 'Not sure' },
  ...[...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.code, label: c.name })),
]
const PROCESS_OPTIONS = [{ value: '', label: 'Not sure' }, ...PROCESSES.map((p) => ({ value: p, label: label(p) }))]
const ROAST_OPTIONS = [{ value: '', label: 'Not sure' }, ...ROAST_LEVELS.map((r) => ({ value: r, label: label(r) }))]
const WEIGHT_PRESETS = [100, 200, 250]

const LANGUAGES: Record<string, string> = {
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  nl: 'Dutch',
  ru: 'Russian',
  ar: 'Arabic',
  tr: 'Turkish',
}
function translatedHint(code: string | null | undefined): string | null {
  const c = (code ?? '').trim().toLowerCase().split(/[-_]/)[0]
  if (!c || c === 'en' || c === 'unknown') return null
  return `Read from a label in ${LANGUAGES[c] ?? c.toUpperCase()} and put into English.`
}

export function ReviewScreen({ editId }: { editId?: string }) {
  const editing = useLoad(async () => (editId ? ((await getBean(editId)) ?? null) : null), [editId])
  if (editId && editing.loading) return <Spinner label="Opening the bag" />
  if (editId && !editing.data)
    return (
      <main className="screen">
        <div className="empty">
          <p className="heading">This bag is no longer on this device.</p>
          <a className="bm-btn bm-btn-secondary bm-btn-md" href={href.beans()}>
            Back to Beans
          </a>
        </div>
      </main>
    )
  return <ReviewForm key={editId ?? 'new'} edit={editing.data ?? null} />
}

function ReviewForm({ edit }: { edit: Awaited<ReturnType<typeof getBean>> | null }) {
  const toast = useToast()
  const manualOnly = !edit && window.location.hash.includes('manual')
  const [pending, setPending] = useState(() => (manualOnly ? null : getScan()))
  const scan: ScanResult | null = edit ? null : (pending?.result ?? null)
  const [form, setForm] = useState<BeanForm>(() => (edit ? formFromBean(edit) : scan ? formFromScan(scan) : EMPTY_FORM))
  const [confirmed, setConfirmed] = useState<Set<FormField>>(new Set())
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const set = (k: FormField) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setConfirmed((c) => new Set(c).add(k)) // editing a field answers its Check
  }
  const flag = (k: FormField): string | null => {
    const key = FORM_TO_SCAN[k]
    return scan && key && !confirmed.has(k) ? (scan.flags[key] ?? null) : null
  }
  const notes = splitNotes(form.labelNotes)
  const setNotes = (list: string[]) => setForm((f) => ({ ...f, labelNotes: list.join(', ') }))

  async function retry() {
    setRetrying(true)
    await readPendingScan()
    const next = getScan()
    setPending(next)
    if (next?.result) setForm(formFromScan(next.result))
    setRetrying(false)
  }

  async function save(then: 'recipe' | 'later') {
    if (!form.name.trim()) {
      setProblem('Give the coffee a name, so you can find it on your shelf.')
      document.getElementById('bean-name-field')?.querySelector('input')?.focus()
      return
    }
    setSaving(true)
    setProblem(null)
    try {
      if (edit) {
        await updateBean(edit.id, beanPatchFromForm(form, edit))
        bump()
        toast('Bag updated')
        go(href.bean(edit.id), { replace: true })
        return
      }
      const bean = await saveBean({ bean: beanDraftFromForm(form, scan), photo: pending?.photo ?? null })
      setScan(null)
      bump()
      if (then === 'recipe') go(href.recipe(bean.id), { replace: true })
      else {
        toast('Bag saved to your shelf')
        go(href.today(), { replace: true })
      }
    } catch (e) {
      setProblem((e as Error).name === 'StorageFullError' ? (e as Error).message : 'This bag could not be saved. Try again.')
      setSaving(false)
    }
  }

  if (retrying) return <Spinner label="Reading the label" />
  const hint = translatedHint(scan?.labelLanguage)
  const failed = !edit && pending && !pending.result ? pending.error : null

  return (
    <main className="screen">
      <div className="topbar">
        <IconButton icon="back" label={edit ? 'Back to the bag' : 'Back to camera'} onClick={() => go(edit ? href.bean(edit.id) : href.scan())} />
        <span className="topbar-title">{edit ? edit.name : 'New bag'}</span>
      </div>
      <div className="screen-scroll">
        <div className="heading-block">
          <h1 className="title" tabIndex={-1}>
            {edit ? 'Edit the bag' : scan ? 'Check the label' : 'Add a bag'}
          </h1>
          <p className="muted">
            {edit
              ? 'Change anything that is wrong.'
              : scan
                ? 'Read from your photo. Tap any field to fix it.'
                : 'Type in what the bag says. Only the name is needed.'}
          </p>
          {hint ? <p className="meta">{hint}</p> : null}
        </div>

        {failed ? (
          <div className="banner" role="alert">
            <span>{failed}</span>
            <div className="banner-actions">
              {pending?.api ? (
                <Button variant="secondary" onClick={retry}>
                  Try again
                </Button>
              ) : null}
              <span>Or type the details in below.</span>
            </div>
          </div>
        ) : null}

        <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-4)' }}>
          <div className="stack" style={{ flex: 'none', alignItems: 'center', gap: 6 }}>
            {pending?.previewUrl ? (
              <img className="bm-photo" src={pending.previewUrl} alt="Your photo of the bag" style={{ width: 72, height: 96 }} />
            ) : (
              <BagThumb size="lg" />
            )}
            {!edit ? (
              <a className="meta" href={href.scan()} style={{ fontWeight: 500, color: 'var(--ink)' }}>
                {pending?.previewUrl ? 'Retake' : 'Add photo'}
              </a>
            ) : null}
          </div>
          <div className="stack" style={{ flex: 1, minWidth: 0 }}>
            <div id="bean-name-field">
              <Field label="Coffee name" value={form.name} onChange={set('name')} flag={flag('name')} maxLength={120} placeholder="As printed on the bag" />
            </div>
            <Field label="Roaster" value={form.roaster} onChange={set('roaster')} flag={flag('roaster')} maxLength={120} />
          </div>
        </div>

        <div className="grid-2">
          <Field label="Origin" value={form.originCountry} onChange={set('originCountry')} options={COUNTRY_OPTIONS} flag={flag('originCountry')} />
          <Field label="Region" value={form.region} onChange={set('region')} flag={flag('region')} maxLength={120} />
          <Field label="Process" value={form.process} onChange={set('process')} options={PROCESS_OPTIONS} flag={flag('process')} />
          <Field label="Roast" value={form.roastLevel} onChange={set('roastLevel')} options={ROAST_OPTIONS} flag={flag('roastLevel')} />
          <Field label="Variety" value={form.varieties} onChange={set('varieties')} flag={flag('varieties')} maxLength={200} />
          <Field label="Altitude" value={form.altitude} onChange={set('altitude')} flag={flag('altitude')} placeholder="1,950–2,200 m" maxLength={40} />
          <div className="span-2 stack" style={{ gap: 6 }}>
            <div className="grid-2">
              <Field
                label="Roast date"
                type="date"
                value={form.roastDate}
                onChange={set('roastDate')}
                max={new Date().toISOString().slice(0, 10)}
                flag={flag('roastDate')}
                flagHelp={false}
              />
              <Field label="Net weight (g)" value={form.netWeightG} onChange={set('netWeightG')} inputMode="numeric" flag={flag('netWeightG')} maxLength={5} />
            </div>
            {flag('roastDate') ? (
              <div className="notice-line">
                <span className="notice-text">{flag('roastDate')}</span>
                <Button variant="secondary" onClick={() => setConfirmed((c) => new Set(c).add('roastDate'))}>
                  That's right
                </Button>
              </div>
            ) : form.roastDate ? (
              <span className="meta">Roasted {fullDate(form.roastDate)}</span>
            ) : null}
            <div className="bm-chips" role="group" aria-label="Common bag weights">
              {WEIGHT_PRESETS.map((g) => (
                <Chip key={g} selected={form.netWeightG === String(g)} onClick={() => setForm((f) => ({ ...f, netWeightG: String(g) }))}>
                  {`${g} g`}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <span className="bm-field-label" id="notes-label">
            Tasting notes on the label
          </span>
          <div className="bm-chips" role="group" aria-labelledby="notes-label">
            {notes.map((n) => (
              <Chip key={n} onRemove={() => setNotes(notes.filter((x) => x !== n))}>
                {n}
              </Chip>
            ))}
            <input
              className="bm-input bm-chip-add"
              aria-label="Add a tasting note"
              placeholder="Add a note"
              value={newNote}
              maxLength={40}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const v = newNote.trim().toLowerCase()
                if (v && !notes.includes(v)) setNotes([...notes, v])
                setNewNote('')
              }}
              onBlur={() => {
                const v = newNote.trim().toLowerCase()
                if (v && !notes.includes(v)) setNotes([...notes, v])
                setNewNote('')
              }}
            />
          </div>
        </div>

        <Field
          label="Producer or farm"
          value={form.producer}
          onChange={set('producer')}
          placeholder={scan ? 'Not on the label' : undefined}
          flag={flag('producer')}
          maxLength={120}
        />
        {problem ? (
          <p className="error-text" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
      <div className="pinned">
        {edit ? (
          <Button full onClick={() => save('later')} disabled={saving}>
            Save changes
          </Button>
        ) : (
          <>
            <Button full onClick={() => save('recipe')} disabled={saving}>
              Save bag and make recipe
            </Button>
            <Button variant="text" full onClick={() => save('later')} disabled={saving}>
              Save for later
            </Button>
          </>
        )}
      </div>
    </main>
  )
}
