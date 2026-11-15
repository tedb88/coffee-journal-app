import { useState, useEffect, useMemo } from 'react'
import {
  IconBook, IconGlobe, IconFlame, IconGear,
  IconTrash, IconChevronDown, IconChevronUp, IconInbox,
  IconScale, IconDroplet, IconThermometer, IconClock, IconGrid, IconRuler,
  IconLightbulb, IconCalendar, IconList, IconChevronLeft, IconChevronRight, IconSearch,
} from './Icons.jsx'
import './BrewJournal.css'

const STORAGE_KEY = 'brewmap_journal'
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function loadJournal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function formatDate(isoString) {
  const d = new Date(isoString)
  return d.toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  }) + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/* ===== Calendar Grid ===== */
function CalendarView({ entries, entriesByDate, onSelectEntry, expanded, toggleExpand }) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return days
  }, [year, month])

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)); setSelectedDate(null) }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)); setSelectedDate(null) }

  function handleDayClick(day) {
    if (!day) return
    const clicked = new Date(year, month, day)
    setSelectedDate(clicked)
  }

  const selectedEntries = selectedDate
    ? entries.filter(e => isSameDay(new Date(e.savedAt), selectedDate))
    : []

  const isToday = (day) => day && isSameDay(new Date(year, month, day), today)
  const isSelected = (day) => day && selectedDate && isSameDay(new Date(year, month, day), selectedDate)
  const hasEntries = (day) => day && entriesByDate[dateKey(new Date(year, month, day))]

  return (
    <div className="cal-view">
      <div className="cal-card card">
        <div className="cal-header">
          <button className="cal-nav-btn" onClick={prevMonth} aria-label="Previous month">
            <IconChevronLeft size={16} />
          </button>
          <span className="cal-month-label">{MONTHS[month]} {year}</span>
          <button className="cal-nav-btn" onClick={nextMonth} aria-label="Next month">
            <IconChevronRight size={16} />
          </button>
        </div>

        <div className="cal-weekdays">
          {DAYS.map(d => <span key={d} className="cal-weekday">{d}</span>)}
        </div>

        <div className="cal-grid">
          {calendarDays.map((day, i) => (
            <button
              key={i}
              className={
                'cal-day' +
                (day ? '' : ' empty') +
                (isToday(day) ? ' today' : '') +
                (isSelected(day) ? ' selected' : '') +
                (hasEntries(day) ? ' has-entry' : '')
              }
              onClick={() => handleDayClick(day)}
              disabled={!day}
            >
              {day && (
                <>
                  <span className="cal-day-num">{day}</span>
                  {hasEntries(day) && (
                    <span className="cal-dot-row">
                      {entriesByDate[dateKey(new Date(year, month, day))].slice(0, 3).map((_, j) => (
                        <span key={j} className="cal-dot" />
                      ))}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Selected date entries */}
      {selectedDate && (
        <div className="cal-selected-section" style={{ animation: 'fadeUp 0.2s ease both' }}>
          <h3 className="cal-selected-label">
            {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            {selectedEntries.length > 0 && (
              <span className="cal-selected-count">{selectedEntries.length} {selectedEntries.length === 1 ? 'brew' : 'brews'}</span>
            )}
          </h3>
          {selectedEntries.length === 0 ? (
            <div className="cal-no-entry card">
              <p>No brews on this day.</p>
            </div>
          ) : (
            <ul className="journal-list">
              {selectedEntries.map(entry => (
                <EntryCard key={entry.id} entry={entry} expanded={expanded} toggleExpand={toggleExpand} onDelete={onSelectEntry} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/* ===== Log View ===== */
function LogView({ entries, expanded, toggleExpand, onDelete }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return entries
    const q = search.toLowerCase()
    return entries.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.origin || '').toLowerCase().includes(q) ||
      (e.process || '').toLowerCase().includes(q) ||
      (e.roastLevel || '').toLowerCase().includes(q) ||
      (e.tastingNotes || []).some(n => n.toLowerCase().includes(q))
    )
  }, [entries, search])

  return (
    <div className="log-view">
      <div className="log-search-bar">
        <span className="log-search-icon"><IconSearch size={14} /></span>
        <input
          type="text"
          className="log-search-input"
          placeholder="Search by origin, roast, notes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="log-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
            &times;
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="cal-no-entry card">
          <p>{search ? 'No matching brews found.' : 'No brews saved yet.'}</p>
        </div>
      ) : (
        <ul className="journal-list">
          {filtered.map(entry => (
            <EntryCard key={entry.id} entry={entry} expanded={expanded} toggleExpand={toggleExpand} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </div>
  )
}

/* ===== Entry Card (shared) ===== */
function EntryCard({ entry, expanded, toggleExpand, onDelete }) {
  return (
    <li className="journal-entry card">
      <div className="journal-entry-header">
        {entry.imageDataUrl && (
          <img src={entry.imageDataUrl} alt={entry.name} className="journal-thumb" />
        )}
        <div className="journal-entry-info">
          <div className="journal-entry-name">{entry.name || 'Unknown Coffee'}</div>
          <div className="journal-entry-meta">
            {entry.origin     && <span className="je-tag"><IconGlobe size={11} /> {entry.origin}</span>}
            {entry.roastLevel && <span className="je-tag"><IconFlame size={11} /> {entry.roastLevel}</span>}
            {entry.process    && <span className="je-tag"><IconGear size={11} /> {entry.process}</span>}
          </div>
          {entry.tastingNotes?.length > 0 && (
            <div className="journal-tasting-notes">{entry.tastingNotes.join(' · ')}</div>
          )}
          <div className="journal-entry-date">{formatDate(entry.savedAt)}</div>
        </div>
        <div className="journal-entry-actions">
          <button
            className="btn-expand"
            onClick={() => toggleExpand(entry.id)}
            aria-label={expanded[entry.id] ? 'Collapse brew guide' : 'Expand brew guide'}
          >
            {expanded[entry.id]
              ? <><IconChevronUp size={13} /> Hide</>
              : <><IconChevronDown size={13} /> Brew</>
            }
          </button>
          <button className="btn-danger" onClick={() => onDelete(entry.id)} aria-label="Delete entry">
            <IconTrash size={15} />
          </button>
        </div>
      </div>

      {expanded[entry.id] && entry.brewGuide && (
        <div className="journal-brew-guide">
          <div className="jbg-params">
            <ParamPill Icon={IconScale}       label="Coffee" value={entry.brewGuide.coffeeAmount} />
            <ParamPill Icon={IconDroplet}     label="Water"  value={entry.brewGuide.waterAmount} />
            <ParamPill Icon={IconRuler}       label="Ratio"  value={entry.brewGuide.ratio} />
            <ParamPill Icon={IconThermometer} label="Temp"   value={entry.brewGuide.waterTemp} />
            <ParamPill Icon={IconGrid}        label="Grind"  value={entry.brewGuide.grindSize} />
            <ParamPill Icon={IconClock}       label="Time"   value={entry.brewGuide.totalTime} />
          </div>

          {entry.brewGuide.steps?.length > 0 && (
            <ol className="jbg-steps">
              {entry.brewGuide.steps.map((step, i) => (
                <li key={i} className="jbg-step">
                  <div className="jbg-step-top">
                    <span className="jbg-step-num">{i + 1}</span>
                    <strong>{step.name}</strong>
                    {step.water     && <span className="jbg-chip"><IconDroplet size={10} /> {step.water}</span>}
                    {step.waitUntil && <span className="jbg-chip"><IconClock size={10} /> {step.waitUntil}</span>}
                  </div>
                  {step.notes && <p className="jbg-step-note">{step.notes}</p>}
                </li>
              ))}
            </ol>
          )}

          {entry.brewGuide.tips && (
            <div className="jbg-tip">
              <span className="jbg-tip-icon"><IconLightbulb size={14} /></span>
              {entry.brewGuide.tips}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/* ===== Main Component ===== */
export default function BrewJournal({ journalVersion, onDelete }) {
  const [entries, setEntries] = useState(loadJournal)
  const [expanded, setExpanded] = useState({})
  const [view, setView] = useState('calendar')

  useEffect(() => { setEntries(loadJournal()) }, [journalVersion])

  const entriesByDate = useMemo(() => {
    const map = {}
    entries.forEach(e => {
      const key = dateKey(new Date(e.savedAt))
      if (!map[key]) map[key] = []
      map[key].push(e)
    })
    return map
  }, [entries])

  function handleDelete(id) {
    const updated = entries.filter(e => e.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setEntries(updated)
    onDelete()
  }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <section className="journal-section">
      <h2 className="section-heading">
        <span className="section-heading-icon"><IconBook size={20} /></span>
        Brew Journal
        {entries.length > 0 && (
          <span className="journal-count">{entries.length} {entries.length === 1 ? 'brew' : 'brews'}</span>
        )}
      </h2>

      {/* View Toggle */}
      <div className="view-toggle">
        <button
          className={`view-toggle-btn${view === 'calendar' ? ' active' : ''}`}
          onClick={() => setView('calendar')}
        >
          <IconCalendar size={14} /> Calendar
        </button>
        <button
          className={`view-toggle-btn${view === 'log' ? ' active' : ''}`}
          onClick={() => setView('log')}
        >
          <IconList size={14} /> Log
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="journal-empty card">
          <div className="journal-empty-icon"><IconInbox size={36} /></div>
          <p>No brews saved yet.</p>
          <p className="journal-empty-hint">
            Head to the <strong>Scanner</strong> tab and analyse a coffee label — it will be saved here automatically.
          </p>
        </div>
      ) : view === 'calendar' ? (
        <CalendarView
          entries={entries}
          entriesByDate={entriesByDate}
          onSelectEntry={handleDelete}
          expanded={expanded}
          toggleExpand={toggleExpand}
        />
      ) : (
        <LogView
          entries={entries}
          expanded={expanded}
          toggleExpand={toggleExpand}
          onDelete={handleDelete}
        />
      )}

      <footer className="section-footer">Made by tedb88</footer>
    </section>
  )
}

function ParamPill({ Icon, label, value }) {
  if (!value) return null
  return (
    <div className="jbg-param">
      <span className="jbg-param-icon"><Icon size={12} /></span>
      <span className="jbg-param-label">{label}</span>
      <span className="jbg-param-value">{value}</span>
    </div>
  )
}
