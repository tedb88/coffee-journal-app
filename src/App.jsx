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

  function onBrewSaved() { setJournalVersion(v => v + 1) }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-banner">
          <svg className="header-illustration" viewBox="0 0 480 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="bgrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#DC2626" stopOpacity="0.7"/>
                <stop offset="100%" stopColor="#F97316" stopOpacity="0.7"/>
              </linearGradient>
              <linearGradient id="bgradSoft" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#DC2626" stopOpacity="0.15"/>
                <stop offset="100%" stopColor="#F97316" stopOpacity="0.15"/>
              </linearGradient>
              <radialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#F97316" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="#DC2626" stopOpacity="0"/>
              </radialGradient>
              <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="rgba(255,255,255,0.0)"/>
                <stop offset="40%"  stopColor="rgba(255,255,255,0.22)"/>
                <stop offset="100%" stopColor="rgba(255,255,255,0.0)"/>
              </linearGradient>
            </defs>

            {/* Soft grid */}
            {[80,160,240,320,400].map(x => (
              <line key={x} x1={x} y1="0" x2={x} y2="88" stroke="rgba(220,38,38,0.07)" strokeWidth="0.5"/>
            ))}
            {[22,44,66].map(y => (
              <line key={y} x1="0" y1={y} x2="480" y2={y} stroke="rgba(220,38,38,0.07)" strokeWidth="0.5"/>
            ))}

            {/* Globe wireframe — right */}
            <circle cx="422" cy="44" r="38" stroke="rgba(249,115,22,0.15)" strokeWidth="1"/>
            <circle cx="422" cy="44" r="38" stroke="url(#bgrad)" strokeWidth="0.6" strokeDasharray="4 5"/>
            <ellipse cx="422" cy="44" rx="16" ry="38" stroke="rgba(220,38,38,0.12)" strokeWidth="0.7"/>
            <line x1="384" y1="44" x2="460" y2="44" stroke="rgba(249,115,22,0.12)" strokeWidth="0.7"/>
            <line x1="386" y1="28" x2="458" y2="28" stroke="rgba(249,115,22,0.08)" strokeWidth="0.5"/>
            <line x1="386" y1="60" x2="458" y2="60" stroke="rgba(249,115,22,0.08)" strokeWidth="0.5"/>
            {/* Globe glow */}
            <circle cx="422" cy="44" r="42" fill="url(#orbGlow)"/>

            {/* Circuit traces — left */}
            <path d="M0 52 H38 V22 H68" stroke="rgba(220,38,38,0.35)" strokeWidth="1.2" fill="none"/>
            <circle cx="68" cy="22" r="2.5" fill="rgba(220,38,38,0.5)"/>
            <circle cx="68" cy="22" r="5" fill="rgba(220,38,38,0.08)"/>
            <path d="M0 68 H18 V38 H52 V18 H88" stroke="rgba(249,115,22,0.25)" strokeWidth="0.8" fill="none"/>
            <circle cx="88" cy="18" r="2" fill="rgba(249,115,22,0.45)"/>
            <path d="M28 88 V58 H58 V32" stroke="rgba(220,38,38,0.18)" strokeWidth="0.6" fill="none"/>
            <circle cx="58" cy="32" r="1.5" fill="rgba(220,38,38,0.35)"/>

            {/* Circuit traces — right */}
            <path d="M480 22 H462 V52 H442" stroke="rgba(249,115,22,0.25)" strokeWidth="0.8" fill="none"/>
            <path d="M480 68 H458 V38 H448" stroke="rgba(220,38,38,0.18)" strokeWidth="0.6" fill="none"/>

            {/* Floating coffee beans */}
            <g transform="translate(112,16) rotate(-22)">
              <ellipse cx="0" cy="0" rx="6" ry="9.5" stroke="url(#bgrad)" strokeWidth="1.3" fill="rgba(220,38,38,0.06)"/>
              <path d="M0 -8 C-3 -3 -3 3 0 8" stroke="rgba(220,38,38,0.4)" strokeWidth="0.8" fill="none"/>
              <circle cx="0" cy="0" r="13" fill="rgba(220,38,38,0.04)"/>
            </g>
            <g transform="translate(342,20) rotate(18)">
              <ellipse cx="0" cy="0" rx="5" ry="8" stroke="rgba(249,115,22,0.6)" strokeWidth="1.1" fill="rgba(249,115,22,0.06)"/>
              <path d="M0 -6.5 C-2.5 -2.5 -2.5 2.5 0 6.5" stroke="rgba(249,115,22,0.4)" strokeWidth="0.7" fill="none"/>
            </g>
            <g transform="translate(204,70) rotate(-12)">
              <ellipse cx="0" cy="0" rx="4.5" ry="7" stroke="rgba(220,38,38,0.4)" strokeWidth="0.9" fill="rgba(220,38,38,0.04)"/>
              <path d="M0 -5.5 C-2 -2 -2 2 0 5.5" stroke="rgba(220,38,38,0.3)" strokeWidth="0.6" fill="none"/>
            </g>
            <g transform="translate(372,66) rotate(28)">
              <ellipse cx="0" cy="0" rx="3.5" ry="5.5" stroke="rgba(249,115,22,0.35)" strokeWidth="0.8" fill="none"/>
              <path d="M0 -4.5 C-1.5 -1.5 -1.5 1.5 0 4.5" stroke="rgba(249,115,22,0.25)" strokeWidth="0.6" fill="none"/>
            </g>

            {/* Glowing dot accents */}
            <circle cx="145" cy="70" r="2.5" fill="rgba(249,115,22,0.45)"/>
            <circle cx="145" cy="70" r="6" fill="rgba(249,115,22,0.1)"/>
            <circle cx="290" cy="14" r="2" fill="rgba(220,38,38,0.4)"/>
            <circle cx="290" cy="14" r="5" fill="rgba(220,38,38,0.08)"/>

            {/* Silver sweep */}
            <rect x="0" y="0" width="480" height="88" fill="url(#sweepGrad)"/>
          </svg>

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
