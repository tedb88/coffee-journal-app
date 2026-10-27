import { useEffect, useState, useRef } from 'react'
import { IconGlobe, IconMapPin } from './Icons.jsx'
import { listJournal } from '../data/repositories.ts'
import { pinsByCountry } from '../lib/journal.ts'
import './WorldMap.css'

// MAP-02: popups are built from DOM nodes and text, never from HTML strings,
// so names and notes from labels or users cannot inject markup.
function popupContent(pin) {
  const root = document.createElement('div')
  root.className = 'map-popup'
  const title = document.createElement('div')
  title.className = 'map-popup-country'
  title.textContent = pin.country.name
  const list = document.createElement('ul')
  list.className = 'map-popup-list'
  for (const c of pin.coffees) {
    const li = document.createElement('li')
    const name = document.createElement('strong')
    name.textContent = c.name
    li.append(name)
    if (c.roastLevel) {
      const chip = document.createElement('span')
      chip.className = 'map-popup-chip'
      chip.textContent = c.roastLevel
      li.append(' ', chip)
    }
    if (c.notes.length) {
      const notes = document.createElement('div')
      notes.className = 'map-popup-notes'
      notes.textContent = c.notes.join(' · ')
      li.append(notes)
    }
    list.append(li)
  }
  root.append(title, list)
  return root
}

export default function WorldMap({ journalVersion }) {
  const mapRef     = useRef(null)
  const leafletRef = useRef(null)
  const markersRef = useRef([])
  const [unmapped, setUnmapped]   = useState([])
  const [totalPins, setTotalPins] = useState(0)
  const [entries, setEntries]     = useState(null)

  useEffect(() => {
    let live = true
    listJournal().then(list => { if (live) setEntries(list) }).catch(() => { if (live) setEntries([]) })
    return () => { live = false }
  }, [journalVersion])

  const hasEntries = entries !== null && entries.length > 0

  useEffect(() => {
    if (!hasEntries) return
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
    return () => {
      isMounted = false
      leafletRef.current?.map.remove()
      leafletRef.current = null
      markersRef.current = []
    }
  }, [hasEntries]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (leafletRef.current) renderMarkers()
  }, [entries]) // eslint-disable-line react-hooks/exhaustive-deps

  function renderMarkers() {
    const { L, map } = leafletRef.current
    const { pins, unmapped: missed } = pinsByCountry(entries ?? [])

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    setUnmapped(missed)
    setTotalPins(pins.length)

    const coffeeIcon = L.divIcon({
      className: '',
      html: `<div class="map-pin"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -12],
    })

    for (const pin of pins) {
      const marker = L.marker([pin.country.lat, pin.country.lng], { icon: coffeeIcon, title: pin.country.name }).addTo(map)
      marker.bindPopup(() => popupContent(pin), { maxWidth: 260 })
      markersRef.current.push(marker)
    }
  }

  return (
    <section className="map-section">
      <h2 className="section-heading">
        <span className="section-heading-icon"><IconGlobe size={20} /></span>
        Coffee Origins
        {totalPins > 0 && (
          <span className="journal-count">{totalPins} {totalPins === 1 ? 'country' : 'countries'}</span>
        )}
      </h2>

      {entries === null ? null : !hasEntries ? (
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
              <span className="map-unmapped-hint"> (origin country not recognised)</span>
            </div>
          )}
        </>
      )}

      <footer className="section-footer">Made by tedb88</footer>
    </section>
  )
}
