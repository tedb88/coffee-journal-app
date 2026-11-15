import type { Process, RoastLevel } from '../enums.js'

function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim()
}

/** Map label wording to a process. Order matters: "anaerobic natural" is anaerobic, "unwashed" is natural. */
export function normaliseProcess(raw: string | null | undefined): Process | null {
  if (!raw) return null
  const t = fold(raw)
  if (/anaerobic|carbonic|thermal shock|fermented/.test(t)) return 'anaerobic'
  if (/wet[- ]?hulled|giling basah/.test(t)) return 'wet-hulled'
  if (/honey|pulped natural|semi[- ]?washed/.test(t)) return 'honey'
  if (/unwashed|natural|dry[- ]?process|sun[- ]?dried|^n$/.test(t)) return 'natural'
  if (/washed|wet[- ]?process|^w$/.test(t)) return 'washed'
  return null
}

/** Map roast wording (including roaster jargon such as "full city") to a roast level. */
export function normaliseRoast(raw: string | null | undefined): RoastLevel | null {
  if (!raw) return null
  const t = fold(raw).replace(/-/g, ' ')
  if (/medium dark|full city|dark medium/.test(t)) return 'medium-dark'
  if (/medium light|light medium|^city$|city roast/.test(t)) return 'medium-light'
  if (/dark|french|italian|vienna|espresso/.test(t)) return 'dark'
  if (/medium|city\+|city plus|omni/.test(t)) return 'medium'
  if (/light|cinnamon|nordic|filter/.test(t)) return 'light'
  return null
}
