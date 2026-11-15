// Map: where your coffee comes from (MAP-01). Pins per origin country with the
// bags from there. Popups are built from text nodes, never HTML strings (MAP-02).

import { useEffect, useMemo, useRef } from 'react'
import { listBeans } from '../../data/repositories.js'
import { pinsByCountry, type CountryPin } from '../../lib/journal.js'
import { Spinner } from '../../ui/components.js'
import { href } from '../router.js'
import { useLoad } from '../store.js'

function popup(pin: CountryPin): HTMLElement {
  const root = document.createElement('div')
  root.className = 'map-popup'
  const title = document.createElement('div')
  title.className = 'map-popup-country'
  title.textContent = `${pin.country.name} · ${pin.coffees.length} ${pin.coffees.length === 1 ? 'bag' : 'bags'}`
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
      chip.textContent = ` · ${c.roastLevel}`
      li.append(chip)
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

export function MapScreen() {
  const { data, loading } = useLoad(async () => pinsByCountry((await listBeans()).map((bean) => ({ bean }))), [])
  const box = useRef<HTMLDivElement>(null)
  const pins = useMemo(() => data?.pins ?? [], [data])

  useEffect(() => {
    if (!box.current || pins.length === 0) return
    let live = true
    let map: { remove: () => void } | null = null
    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (!live || !box.current) return
      const m = L.map(box.current, { center: [12, 20], zoom: 1, scrollWheelZoom: false, attributionControl: true })
      map = m
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 10,
      }).addTo(m)
      const icon = L.divIcon({ className: '', html: '<div class="map-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10] })
      for (const p of pins)
        L.marker([p.country.lat, p.country.lng], { icon, title: p.country.name, alt: `${p.country.name}: ${p.coffees.length} bags` })
          .addTo(m)
          .bindPopup(() => popup(p), { maxWidth: 260 })
      if (pins.length > 1) m.fitBounds(L.latLngBounds(pins.map((p) => [p.country.lat, p.country.lng] as [number, number])).pad(0.4), { maxZoom: 4 })
      else m.setView([pins[0].country.lat, pins[0].country.lng], 3)
    })()
    return () => {
      live = false
      map?.remove()
    }
  }, [pins])

  return (
    <main className="screen">
      <div className="home-bar">
        <h1 className="title" tabIndex={-1}>
          Map
        </h1>
        <span className="muted">
          {pins.length} {pins.length === 1 ? 'country' : 'countries'}
        </span>
      </div>
      <div className="screen-scroll" style={{ paddingTop: 'var(--space-4)' }}>
        {loading && !data ? (
          <Spinner label="Opening the map" />
        ) : pins.length === 0 ? (
          <div className="bm-card empty">
            <p className="heading">No origins yet</p>
            <p className="muted">Each bag you add puts its country on the map.</p>
            <a className="bm-btn bm-btn-secondary bm-btn-md" href={href.scan()}>
              Scan a bag
            </a>
          </div>
        ) : (
          <>
            <div className="map-box" ref={box} />
            <section className="section" aria-labelledby="origins">
              <h2 id="origins" className="heading">
                Origins
              </h2>
              <div className="bm-card" style={{ padding: '6px var(--space-4)' }}>
                <dl className="facts">
                  {[...pins]
                    .sort((a, b) => b.coffees.length - a.coffees.length || a.country.name.localeCompare(b.country.name))
                    .map((p) => (
                      <div key={p.country.code} className="fact">
                        <dt style={{ color: 'var(--ink)' }}>{p.country.name}</dt>
                        <dd className="muted">
                          {p.coffees.length} {p.coffees.length === 1 ? 'bag' : 'bags'}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            </section>
            {data?.unmapped.length ? (
              <p className="meta">Not on the map yet: {data.unmapped.join(', ')}. Set the origin country on the bag to place it.</p>
            ) : null}
          </>
        )}
      </div>
    </main>
  )
}
