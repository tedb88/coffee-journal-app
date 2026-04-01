import { useState } from 'react'
import './App.css'
import LabelScanner from './components/LabelScanner.jsx'
import BrewJournal from './components/BrewJournal.jsx'
import WorldMap from './components/WorldMap.jsx'
import { IconScan, IconBook, IconGlobe, IconBean } from './components/Icons.jsx'

const TABS = [
  { id: 'scanner', label: 'Scanner', Icon: IconScan  },
  { id: 'journal', label: 'Journal', Icon: IconBook  },
  { id: 'map',     label: 'Map',     Icon: IconGlobe },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('scanner')
  const [journalVersion, setJournalVersion] = useState(0)

  function onBrewSaved() {
    setJournalVersion(v => v + 1)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-banner">
          {/* Background illustration */}
          <svg className="header-illustration" viewBox="0 0 480 90" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
            {/* Silver grid lines */}
            <line x1="0" y1="30" x2="480" y2="30" stroke="rgba(200,215,235,0.3)" strokeWidth="0.5"/>
            <line x1="0" y1="60" x2="480" y2="60" stroke="rgba(200,215,235,0.3)" strokeWidth="0.5"/>
            <line x1="80"  y1="0" x2="80"  y2="90" stroke="rgba(200,215,235,0.25)" strokeWidth="0.5"/>
            <line x1="160" y1="0" x2="160" y2="90" stroke="rgba(200,215,235,0.25)" strokeWidth="0.5"/>
            <line x1="240" y1="0" x2="240" y2="90" stroke="rgba(200,215,235,0.25)" strokeWidth="0.5"/>
            <line x1="320" y1="0" x2="320" y2="90" stroke="rgba(200,215,235,0.25)" strokeWidth="0.5"/>
            <line x1="400" y1="0" x2="400" y2="90" stroke="rgba(200,215,235,0.25)" strokeWidth="0.5"/>

            {/* Globe — right side */}
            <circle cx="420" cy="45" r="36" stroke="rgba(56,189,248,0.18)" strokeWidth="1"/>
            <circle cx="420" cy="45" r="36" stroke="url(#globeGrad)" strokeWidth="0.5" strokeDasharray="3 4"/>
            <ellipse cx="420" cy="45" rx="15" ry="36" stroke="rgba(56,189,248,0.15)" strokeWidth="0.8"/>
            <line x1="384" y1="45" x2="456" y2="45" stroke="rgba(56,189,248,0.15)" strokeWidth="0.8"/>
            <line x1="386" y1="30" x2="454" y2="30" stroke="rgba(56,189,248,0.10)" strokeWidth="0.5"/>
            <line x1="386" y1="60" x2="454" y2="60" stroke="rgba(56,189,248,0.10)" strokeWidth="0.5"/>

            {/* Circuit lines — left */}
            <path d="M0 55 H40 V25 H70" stroke="rgba(163,230,53,0.4)" strokeWidth="1" fill="none"/>
            <circle cx="70" cy="25" r="2.5" fill="rgba(163,230,53,0.6)"/>
            <path d="M0 70 H20 V40 H55 V20 H90" stroke="rgba(56,189,248,0.3)" strokeWidth="0.8" fill="none"/>
            <circle cx="90" cy="20" r="2" fill="rgba(56,189,248,0.5)"/>
            <path d="M30 90 V60 H60 V35" stroke="rgba(200,215,230,0.35)" strokeWidth="0.6" fill="none"/>
            <circle cx="60" cy="35" r="1.5" fill="rgba(200,215,230,0.6)"/>

            {/* Circuit lines — right */}
            <path d="M480 25 H460 V55 H440" stroke="rgba(163,230,53,0.3)" strokeWidth="0.8" fill="none"/>
            <path d="M480 65 H455 V35 H445" stroke="rgba(56,189,248,0.2)" strokeWidth="0.6" fill="none"/>

            {/* Floating coffee beans */}
            {/* bean 1 */}
            <g transform="translate(110,18) rotate(-20)">
              <ellipse cx="0" cy="0" rx="6" ry="9" stroke="rgba(163,230,53,0.7)" strokeWidth="1.2" fill="rgba(163,230,53,0.08)"/>
              <path d="M0 -7 C-3 -3 -3 3 0 7" stroke="rgba(163,230,53,0.5)" strokeWidth="0.8" fill="none"/>
            </g>
            {/* bean 2 */}
            <g transform="translate(340,22) rotate(15)">
              <ellipse cx="0" cy="0" rx="5" ry="7.5" stroke="rgba(56,189,248,0.6)" strokeWidth="1" fill="rgba(56,189,248,0.07)"/>
              <path d="M0 -6 C-2.5 -2.5 -2.5 2.5 0 6" stroke="rgba(56,189,248,0.4)" strokeWidth="0.7" fill="none"/>
            </g>
            {/* bean 3 */}
            <g transform="translate(200,72) rotate(-10)">
              <ellipse cx="0" cy="0" rx="4.5" ry="7" stroke="rgba(200,215,230,0.6)" strokeWidth="0.9" fill="rgba(200,215,230,0.07)"/>
              <path d="M0 -5.5 C-2 -2 -2 2 0 5.5" stroke="rgba(200,215,230,0.4)" strokeWidth="0.6" fill="none"/>
            </g>
            {/* bean 4 small */}
            <g transform="translate(370,68) rotate(30)">
              <ellipse cx="0" cy="0" rx="3.5" ry="5.5" stroke="rgba(163,230,53,0.4)" strokeWidth="0.8" fill="none"/>
              <path d="M0 -4.5 C-1.5 -1.5 -1.5 1.5 0 4.5" stroke="rgba(163,230,53,0.3)" strokeWidth="0.6" fill="none"/>
            </g>

            {/* Glow dots */}
            <circle cx="110" cy="18" r="12" fill="rgba(163,230,53,0.06)"/>
            <circle cx="340" cy="22" r="10" fill="rgba(56,189,248,0.06)"/>
            <circle cx="420" cy="45" r="38" fill="rgba(56,189,248,0.04)"/>

            {/* Sweep highlight */}
            <rect x="0" y="0" width="480" height="90" fill="url(#sweepGrad)"/>

            <defs>
              <linearGradient id="globeGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#A3E635" stopOpacity="0.6"/>
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.6"/>
              </linearGradient>
              <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stopColor="rgba(255,255,255,0.08)"/>
                <stop offset="45%"  stopColor="rgba(255,255,255,0.18)"/>
                <stop offset="100%" stopColor="rgba(255,255,255,0.0)"/>
              </linearGradient>
            </defs>
          </svg>

          {/* Title overlay */}
          <div className="header-top">
            <div className="header-logo">
              <IconBean size={18} />
            </div>
            <div>
              <div className="header-title">BrewMap</div>
              <div className="header-tagline">Scan labels · Build your brew journal · Explore origins</div>
            </div>
          </div>
        </div>
        <nav className="tab-nav" role="tablist">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              className={`tab-btn${activeTab === id ? ' active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <span className="tab-icon"><Icon size={15} /></span>
              {label}
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
