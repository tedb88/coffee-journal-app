import { useEffect, useState, useRef } from 'react'
import { IconGlobe, IconMapPin } from './Icons.jsx'
import './WorldMap.css'

const STORAGE_KEY = 'brewmap_journal'

const COUNTRY_COORDS = {
  'Ethiopia':             [9.145,  40.489],
  'Colombia':             [4.571,  -74.297],
  'Brazil':               [-14.235, -51.925],
  'Guatemala':            [15.783, -90.230],
  'Honduras':             [15.200, -86.241],
  'Mexico':               [23.634, -102.552],
  'Kenya':                [-0.023,  37.906],
  'Tanzania':             [-6.369,  34.888],
  'Rwanda':               [-1.940,  29.874],
  'Uganda':               [1.373,   32.290],
  'Burundi':              [-3.373,  29.918],
  'DR Congo':             [-4.038,  21.759],
  'Democratic Republic of the Congo': [-4.038, 21.759],
  'Congo':                [-4.038,  21.759],
  'Yemen':                [15.552,  48.516],
  'Indonesia':            [-0.789,  113.921],
  'Vietnam':              [14.058,  108.277],
  'Myanmar':              [16.871,  96.195],
  'Thailand':             [15.870,  100.992],
  'India':                [20.594,  78.963],
  'Papua New Guinea':     [-6.314,  143.956],
  'Philippines':          [12.879,  121.774],
  'Jamaica':              [18.109,  -77.297],
  'Haiti':                [18.971,  -72.285],
  'Dominican Republic':   [18.735,  -70.162],
  'Peru':                 [-9.190,  -75.015],
  'Bolivia':              [-16.290, -63.589],
  'Ecuador':              [-1.831,  -78.183],
  'Panama':               [8.538,   -80.782],
  'Costa Rica':           [9.748,   -83.753],
  'El Salvador':          [13.794,  -88.896],
  'Nicaragua':            [12.865,  -85.207],
  'Cuba':                 [21.521,  -77.781],
  'China':                [35.861,  104.195],
  'Taiwan':               [23.698,  120.961],
  'Laos':                 [19.856,  102.495],
  'Timor-Leste':          [-8.874,  125.727],
  'East Timor':           [-8.874,  125.727],
  'Zimbabwe':             [-19.015,  29.154],
  'Zambia':               [-13.133,  27.849],
  'Malawi':               [-13.254,  34.301],
  'Cameroon':             [3.848,   11.502],
  'Nigeria':              [9.082,    8.675],
  'Togo':                 [8.620,    0.825],
  'Côte d\'Ivoire':       [7.540,   -5.547],
  'Ivory Coast':          [7.540,   -5.547],
  'Ghana':                [7.946,   -1.023],
  'Nepal':                [28.394,  84.124],
  'Sri Lanka':            [7.873,   80.772],
  'Madagascar':           [-18.766, 46.869],
  'Galapagos':            [-0.952,  -90.961],
}

function normalizeCountry(raw) {
  if (!raw) return null
  const trimmed = raw.trim()
  for (const key of Object.keys(COUNTRY_COORDS)) {
    if (key.toLowerCase() === trimmed.toLowerCase()) return key
  }
  for (const key of Object.keys(COUNTRY_COORDS)) {
    if (
      trimmed.toLowerCase().startsWith(key.toLowerCase()) ||
      key.toLowerCase().startsWith(trimmed.toLowerCase())
    ) return key
  }
  return null
}

function loadJournal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export default function WorldMap({ journalVersion }) {
  const mapRef     = useRef(null)
  const leafletRef = useRef(null)
  const markersRef = useRef([])
  const [unmapped, setUnmapped]   = useState([])
  const [totalPins, setTotalPins] = useState(0)

  useEffect(() => {
    let isMounted = true

    async function init() {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      if (!isMounted || !mapRef.current) return

      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
        iconUrl:       new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
        shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
      })

      if (leafletRef.current) return

      const map = L.map(mapRef.current, { center: [15, 20], zoom: 2, scrollWheelZoom: true })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map)

      leafletRef.current = { L, map }
      renderMarkers()
    }

    init()
    return () => { isMounted = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (leafletRef.current) renderMarkers()
  }, [journalVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  function renderMarkers() {
    const { L, map } = leafletRef.current
    const entries = loadJournal()

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const byCountry = {}
    const missed = []

    for (const entry of entries) {
      const key = normalizeCountry(entry.origin)
      if (key) {
        if (!byCountry[key]) byCountry[key] = []
        byCountry[key].push(entry)
      } else if (entry.origin) {
        missed.push(entry.origin)
      }
    }

    setUnmapped([...new Set(missed)])
    setTotalPins(Object.keys(byCountry).length)

    const coffeeIcon = L.divIcon({
      className: '',
      html: `<div class="map-pin"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -12],
    })

    for (const [country, coffees] of Object.entries(byCountry)) {
      const [lat, lng] = COUNTRY_COORDS[country]
      const marker = L.marker([lat, lng], { icon: coffeeIcon }).addTo(map)

      const popupHtml = `
        <div class="map-popup">
          <div class="map-popup-country">${country}</div>
          <ul class="map-popup-list">
            ${coffees.map(c => `
              <li>
                <strong>${c.name || 'Unknown'}</strong>
                ${c.roastLevel ? `<span class="map-popup-chip">${c.roastLevel}</span>` : ''}
                ${c.tastingNotes?.length ? `<div class="map-popup-notes">${c.tastingNotes.join(' · ')}</div>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      `
      marker.bindPopup(popupHtml, { maxWidth: 260 })
      markersRef.current.push(marker)
    }
  }

  const entries = loadJournal()

  return (
    <section className="map-section">
      <h2 className="section-heading">
        <span className="section-heading-icon"><IconGlobe size={20} /></span>
        Coffee Origins
        {totalPins > 0 && (
          <span className="journal-count">{totalPins} {totalPins === 1 ? 'country' : 'countries'}</span>
        )}
      </h2>

      {entries.length === 0 ? (
        <div className="card map-empty">
          <div className="map-empty-icon"><IconMapPin size={36} /></div>
          <p>No coffees in your journal yet.</p>
          <p className="journal-empty-hint">
            Scan a label and save it — its origin country will appear as a pin on the map.
          </p>
        </div>
      ) : (
        <>
          <div className="map-container card" ref={mapRef} />
          {unmapped.length > 0 && (
            <div className="map-unmapped">
              <strong>Could not map:</strong> {unmapped.join(', ')}
              <span className="map-unmapped-hint"> (origin not in the built-in coordinates list)</span>
            </div>
          )}
        </>
      )}

      <footer className="section-footer">Made by tedb88</footer>
    </section>
  )
}
