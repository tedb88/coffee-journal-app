// Journal: every brew, as a list or a calendar (JRN-01), searchable and filtered
// by rating (JRN-02), with export and import (JRN-04).

import { useRef, useState } from 'react'
import { importAll } from '../../data/export.js'
import { listJournal, type JournalEntry } from '../../data/repositories.js'
import { parseClicks } from '../../domain/dialin/next.js'
import { beanMeta, recipeLine, whenText } from '../../lib/display.js'
import { downloadCsv, downloadExport } from '../../lib/startup.js'
import { BagThumb, Button, Chip, Field, IconButton, Spinner, Tag, bagTone } from '../../ui/components.js'
import { useToast } from '../App.js'
import { href } from '../router.js'
import { bump, useLoad } from '../store.js'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function JournalScreen() {
  const toast = useToast()
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [q, setQ] = useState('')
  const [minRating, setMinRating] = useState(0)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [day, setDay] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const { data, loading } = useLoad(() => listJournal(), [])

  const term = q.trim().toLowerCase()
  const filtered = (data ?? []).filter(
    (e) =>
      (minRating === 0 || (e.brew.rating ?? 0) >= minRating) &&
      (!term ||
        [e.bean.name, e.bean.roaster ?? '', beanMeta(e.bean), e.brew.notes, ...e.brew.descriptors, ...e.bean.labelNotes].some((s) =>
          s.toLowerCase().includes(term),
        )),
  )
  const byDay = new Map<string, JournalEntry[]>()
  for (const e of filtered) {
    const k = dayKey(new Date(e.brew.createdAt))
    byDay.set(k, [...(byDay.get(k) ?? []), e])
  }

  async function onImport(f: File | undefined) {
    if (!f) return
    try {
      const res = await importAll(JSON.parse(await f.text()))
      bump()
      toast(`Imported ${res.beans} ${res.beans === 1 ? 'bag' : 'bags'} and ${res.brews} ${res.brews === 1 ? 'brew' : 'brews'}`)
    } catch (e) {
      toast(e instanceof SyntaxError ? 'That file is not a BrewMap export.' : (e as Error).message)
    }
    if (file.current) file.current.value = ''
  }

  const shown = view === 'calendar' ? (day ? (byDay.get(day) ?? []) : []) : filtered

  return (
    <main className="screen">
      <div className="home-bar">
        <h1 className="title" tabIndex={-1}>
          Journal
        </h1>
        <span className="muted">
          {data?.length ?? 0} {data?.length === 1 ? 'brew' : 'brews'}
        </span>
      </div>
      <div className="screen-scroll" style={{ paddingTop: 'var(--space-4)' }}>
        <div className="stack">
          <div className="bm-chips" role="group" aria-label="View">
            <Chip selected={view === 'list'} onClick={() => setView('list')}>
              List
            </Chip>
            <Chip selected={view === 'calendar'} onClick={() => setView('calendar')}>
              Calendar
            </Chip>
          </div>
          <div className="grid-2">
            <Field label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Coffee or flavour" />
            <Field
              label="Rating"
              value={String(minRating)}
              onChange={(e) => setMinRating(Number(e.target.value))}
              options={[
                { value: '0', label: 'Any rating' },
                { value: '4', label: '4 and up' },
                { value: '3', label: '3 and up' },
              ]}
            />
          </div>
        </div>

        {view === 'calendar' ? (
          <section className="bm-card bm-card-pad stack" aria-label="Calendar">
            <div className="cal-head">
              <IconButton icon="back" label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
              <span className="heading">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
              <span style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}>
                <IconButton icon="back" label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
              </span>
            </div>
            <div className="cal-grid">
              {DOW.map((d) => (
                <span key={d} className="cal-dow">
                  {d}
                </span>
              ))}
              {Array.from({ length: (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7 }, (_, i) => (
                <span key={`pad${i}`} />
              ))}
              {Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, i) => {
                const d = new Date(month.getFullYear(), month.getMonth(), i + 1)
                const k = dayKey(d)
                const count = byDay.get(k)?.length ?? 0
                const isToday = k === dayKey(new Date())
                return (
                  <button
                    key={k}
                    type="button"
                    className="cal-day"
                    aria-pressed={day === k ? 'true' : 'false'}
                    aria-label={`${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${count ? `, ${count} ${count === 1 ? 'brew' : 'brews'}` : ''}`}
                    onClick={() => setDay(day === k ? null : k)}
                  >
                    <span className={isToday ? 'cal-today' : undefined}>{i + 1}</span>
                    {count ? <span className="cal-dot" aria-hidden="true" /> : <span style={{ height: 5 }} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}

        {loading && !data ? (
          <Spinner label="Opening your journal" />
        ) : (data ?? []).length === 0 ? (
          <div className="bm-card empty">
            <p className="heading">No brews yet</p>
            <p className="muted">Brews you rate or log appear here, newest first.</p>
            <a className="bm-btn bm-btn-secondary bm-btn-md" href={href.today()}>
              Go to Today
            </a>
          </div>
        ) : view === 'calendar' && !day ? (
          <p className="muted">Pick a day to see its brews.</p>
        ) : shown.length === 0 ? (
          <p className="muted">{view === 'calendar' ? 'No brews on this day.' : 'No brews match.'}</p>
        ) : (
          <div className="bm-card bm-list">
            {shown.map(({ brew, bean }) => (
              <a key={brew.id} className="bm-row" href={href.bean(bean.id)}>
                <BagThumb tone={bagTone(bean.id)} size="sm" />
                <span className="bm-row-main">
                  <span className="bm-row-name">{bean.name}</span>
                  <span className="bm-row-meta num">{recipeLine(brew.recipe, parseClicks(brew.grindSetting), brew.actualTimeS)}</span>
                  <span className="bm-row-meta">{whenText(brew.createdAt)}</span>
                </span>
                <span className="bm-row-end">{brew.rating !== null ? <Tag tone="ink">{`${brew.rating} of 5`}</Tag> : <Tag>Not rated</Tag>}</span>
              </a>
            ))}
          </div>
        )}

        <section className="section" aria-labelledby="data">
          <h2 id="data" className="heading">
            Your data
          </h2>
          <p className="muted">Everything stays on this phone. Export a copy to keep it safe or move it to another phone.</p>
          <div className="toolbar">
            <Button variant="secondary" onClick={() => downloadExport()}>
              Export journal
            </Button>
            <Button variant="secondary" onClick={() => downloadCsv()}>
              Brews as CSV
            </Button>
            <Button variant="secondary" onClick={() => file.current?.click()}>
              Import
            </Button>
          </div>
          <input
            ref={file}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            aria-label="Import a BrewMap export"
            tabIndex={-1}
            onChange={(e) => onImport(e.target.files?.[0])}
          />
        </section>
      </div>
    </main>
  )
}
