// LOG-03 reference data: flavour words for the quick tasting chips, grouped as
// on the SCA/WCR Coffee Taster's Flavor Wheel. A first, short set; the full
// three-tier lexicon and its mapping come with AI-05.

export const FLAVOUR_FAMILIES = [
  { family: 'Floral', terms: ['jasmine', 'rose', 'chamomile', 'black tea'] },
  { family: 'Fruity', terms: ['berry', 'blackcurrant', 'cherry', 'citrus', 'lemon', 'orange', 'peach', 'apricot', 'tropical', 'dried fruit'] },
  { family: 'Sweet', terms: ['honey', 'caramel', 'brown sugar', 'vanilla'] },
  { family: 'Nutty and cocoa', terms: ['chocolate', 'cocoa', 'hazelnut', 'almond'] },
  { family: 'Spice', terms: ['cinnamon', 'clove', 'pepper'] },
  { family: 'Other', terms: ['winey', 'earthy', 'smoky', 'papery'] },
] as const

export const FLAVOUR_TERMS: string[] = FLAVOUR_FAMILIES.flatMap((f) => [...f.terms])

/** Chips for the taste screen: the bag's own label notes first, then common words, no repeats. */
export function flavourChips(labelNotes: string[], max = 12): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of [...labelNotes.map((n) => n.toLowerCase()), ...FLAVOUR_TERMS]) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}
