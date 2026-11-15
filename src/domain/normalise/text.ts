import type { Altitude } from '../schemas.js'

/** "1,950–2,200 m", "1800 masl", "6,000 ft" → metres. Implausible values give null. */
export function parseAltitude(raw: string | number | null | undefined): Altitude | null {
  if (raw === null || raw === undefined || raw === '') return null
  const s = String(raw).toLowerCase().replace(/,/g, '')
  const nums = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).slice(0, 2)
  if (nums.length === 0) return null
  const feet = /\bft\b|feet|foot/.test(s)
  const toM = (n: number) => Math.round(feet ? n * 0.3048 : n)
  const lo = toM(Math.min(...nums))
  const hi = toM(Math.max(...nums))
  if (lo < 100 || hi > 3500) return null
  return { minM: lo, maxM: hi }
}

/** Split, lower-case and de-duplicate tasting notes: "Jasmine / Bergamot, peach" → ["jasmine", "bergamot", "peach"]. */
export function splitNotes(raw: string | string[] | null | undefined): string[] {
  if (!raw) return []
  const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((p) => String(p).split(/\s*(?:,|\/|·|;|\||\band\b|&)\s*/i))
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const t = p.trim().toLowerCase().replace(/\.$/, '')
    if (t && t.length <= 40 && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out.slice(0, 12)
}

export function splitVarieties(raw: string | string[] | null | undefined): string[] {
  if (!raw) return []
  const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((p) => String(p).split(/\s*(?:,|\/|&|\band\b)\s*/i))
  return [...new Set(parts.map((p) => p.trim()).filter(Boolean))].slice(0, 10)
}
