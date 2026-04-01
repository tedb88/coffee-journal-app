import { useState, useEffect } from 'react'
import './BrewJournal.css'

const STORAGE_KEY = 'brewmap_journal'

function loadJournal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function formatDate(isoString) {
  const d = new Date(isoString)
  return d.toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  }) + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function BrewJournal({ journalVersion, onDelete }) {
  const [entries, setEntries]     = useState(loadJournal)
  const [expanded, setExpanded]   = useState({})

  // Reload when version bumps (new brew saved from Scanner tab)
  useEffect(() => {
    setEntries(loadJournal())
  }, [journalVersion])

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
        <h2 className="section-heading"><span>📒</span> Brew Journal</h2>
        <div className="journal-empty card">
          <div className="journal-empty-icon">📭</div>
          <p>No brews saved yet.</p>
          <p className="journal-empty-hint">
            Head to the <strong>Scanner</strong> tab and analyse a coffee label — it will be saved here automatically.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="journal-section">
      <h2 className="section-heading">
        <span>📒</span> Brew Journal
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
                  {entry.origin && <span className="je-tag">🌍 {entry.origin}</span>}
                  {entry.roastLevel && <span className="je-tag">🔥 {entry.roastLevel}</span>}
                  {entry.process && <span className="je-tag">⚙️ {entry.process}</span>}
                </div>
                {entry.tastingNotes?.length > 0 && (
                  <div className="journal-tasting-notes">
                    {entry.tastingNotes.join(' · ')}
                  </div>
                )}
                <div className="journal-entry-date">{formatDate(entry.savedAt)}</div>
              </div>
              <div className="journal-entry-actions">
                <button
                  className="btn-expand"
                  onClick={() => toggleExpand(entry.id)}
                  aria-label={expanded[entry.id] ? 'Collapse brew guide' : 'Expand brew guide'}
                >
                  {expanded[entry.id] ? '▲' : '▼'} Brew Guide
                </button>
                <button
                  className="btn-danger"
                  onClick={() => handleDelete(entry.id)}
                  aria-label="Delete entry"
                >
                  🗑
                </button>
              </div>
            </div>

            {expanded[entry.id] && entry.brewGuide && (
              <div className="journal-brew-guide">
                <div className="jbg-params">
                  <ParamPill icon="⚖️" label="Coffee" value={entry.brewGuide.coffeeAmount} />
                  <ParamPill icon="💧" label="Water"  value={entry.brewGuide.waterAmount} />
                  <ParamPill icon="📐" label="Ratio"  value={entry.brewGuide.ratio} />
                  <ParamPill icon="🌡️" label="Temp"   value={entry.brewGuide.waterTemp} />
                  <ParamPill icon="🔘" label="Grind"  value={entry.brewGuide.grindSize} />
                  <ParamPill icon="⏱️" label="Time"   value={entry.brewGuide.totalTime} />
                </div>

                {entry.brewGuide.steps?.length > 0 && (
                  <ol className="jbg-steps">
                    {entry.brewGuide.steps.map((step, i) => (
                      <li key={i} className="jbg-step">
                        <div className="jbg-step-top">
                          <span className="jbg-step-num">{i + 1}</span>
                          <strong>{step.name}</strong>
                          {step.water && <span className="jbg-chip">💧 {step.water}</span>}
                          {step.waitUntil && <span className="jbg-chip">⏱ {step.waitUntil}</span>}
                        </div>
                        {step.notes && <p className="jbg-step-note">{step.notes}</p>}
                      </li>
                    ))}
                  </ol>
                )}

                {entry.brewGuide.tips && (
                  <div className="jbg-tip">💡 {entry.brewGuide.tips}</div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ParamPill({ icon, label, value }) {
  if (!value) return null
  return (
    <div className="jbg-param">
      <span>{icon}</span>
      <span className="jbg-param-label">{label}</span>
      <span className="jbg-param-value">{value}</span>
    </div>
  )
}
