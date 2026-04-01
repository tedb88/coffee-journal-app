import { useState, useEffect } from 'react'
import {
  IconBook, IconGlobe, IconFlame, IconGear,
  IconTrash, IconChevronDown, IconChevronUp, IconInbox,
  IconScale, IconDroplet, IconThermometer, IconClock, IconGrid, IconRuler,
  IconLightbulb,
} from './Icons.jsx'
import './BrewJournal.css'

const STORAGE_KEY = 'brewmap_journal'

function loadJournal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function formatDate(isoString) {
  const d = new Date(isoString)
  return d.toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  }) + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function BrewJournal({ journalVersion, onDelete }) {
  const [entries, setEntries]   = useState(loadJournal)
  const [expanded, setExpanded] = useState({})

  useEffect(() => { setEntries(loadJournal()) }, [journalVersion])

  function handleDelete(id) {
    const updated = entries.filter(e => e.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setEntries(updated)
    onDelete()
  }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (entries.length === 0) {
    return (
      <section className="journal-section">
        <h2 className="section-heading">
          <span className="section-heading-icon"><IconBook size={20} /></span>
          Brew Journal
        </h2>
        <div className="journal-empty card">
          <div className="journal-empty-icon"><IconInbox size={36} /></div>
          <p>No brews saved yet.</p>
          <p className="journal-empty-hint">
            Head to the <strong>Scanner</strong> tab and analyse a coffee label — it will be saved here automatically.
          </p>
        </div>
        <footer className="section-footer">Made by tedb88</footer>
      </section>
    )
  }

  return (
    <section className="journal-section">
      <h2 className="section-heading">
        <span className="section-heading-icon"><IconBook size={20} /></span>
        Brew Journal
        <span className="journal-count">{entries.length} {entries.length === 1 ? 'brew' : 'brews'}</span>
      </h2>

      <ul className="journal-list">
        {entries.map(entry => (
          <li key={entry.id} className="journal-entry card">
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
                <button className="btn-danger" onClick={() => handleDelete(entry.id)} aria-label="Delete entry">
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
        ))}
      </ul>

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
