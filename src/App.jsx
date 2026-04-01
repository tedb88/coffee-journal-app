import { useState } from 'react'
import './App.css'
import LabelScanner from './components/LabelScanner.jsx'
import BrewJournal from './components/BrewJournal.jsx'
import WorldMap from './components/WorldMap.jsx'

const TABS = [
  { id: 'scanner', label: 'Scanner',     icon: '📷' },
  { id: 'journal', label: 'Journal',     icon: '📒' },
  { id: 'map',     label: 'World Map',   icon: '🗺️' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('scanner')
  // Lift journal state so WorldMap and BrewJournal stay in sync without re-reading localStorage
  const [journalVersion, setJournalVersion] = useState(0)

  function onBrewSaved() {
    setJournalVersion(v => v + 1)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <span className="header-logo">☕</span>
          <div>
            <div className="header-title">BrewMap</div>
            <div className="header-tagline">Scan labels · Build your brew journal · Explore origins</div>
          </div>
        </div>
        <nav className="tab-nav" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {activeTab === 'scanner' && <LabelScanner onBrewSaved={onBrewSaved} />}
        {activeTab === 'journal' && <BrewJournal journalVersion={journalVersion} onDelete={() => setJournalVersion(v => v + 1)} />}
        {activeTab === 'map'     && <WorldMap journalVersion={journalVersion} />}
      </main>
    </div>
  )
}
