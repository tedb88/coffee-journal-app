// BrewMap eval harness (Solution Plan §6.4, AIG-01).
//
//   npx tsx evals/run.ts recipes            rules engine over the golden set (offline, the CI gate)
//   npx tsx evals/run.ts recipes --ai       the configured AI recipe model over the golden set
//   npx tsx evals/run.ts labels --photos <dir> [--size 1024] [--limit 20]
//                                           the configured vision model over the label set
//
// Models come from the same AI_* settings as production (see README). Failover
// and the legacy provider are switched off, so each run measures one model.
// Results go to evals/reports/ as JSON plus a Markdown summary.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { baselineRecipe } from '../src/domain/recipe/engine.js'
import { BeanAttributesSchema, type Recipe } from '../src/domain/schemas.js'
import { memoryKv } from '../api/_lib/kv.js'
import { personaliseRecipe, readLabel } from '../api/_lib/routes.js'
import type { Deps, Env } from '../api/_lib/types.js'
import { GoldenSetSchema, LabelCaseSchema, scoreLabel, scoreRecipe, summariseLabels, summariseRecipes, THRESHOLDS, type LabelScore } from './metrics.js'

const here = dirname(fileURLToPath(import.meta.url))

function args(argv: string[]) {
  const [capability, ...rest] = argv
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (!a.startsWith('--')) continue
    const next = rest[i + 1]
    if (next && !next.startsWith('--')) {
      flags[a.slice(2)] = next
      i++
    } else flags[a.slice(2)] = true
  }
  return { capability, flags }
}

/** One model per run: no failover, no legacy provider. */
function evalEnv(): Env {
  const env: Env = { ...process.env, AI_DISABLE_LEGACY_GROQ: process.env.EVAL_INCLUDE_LEGACY === 'true' ? 'false' : 'true' }
  for (const k of Object.keys(env)) if (k.startsWith('AI_FALLBACK_')) delete env[k]
  delete env.VERCEL_ENV
  return env
}

function deps(today: Date): Deps {
  return { env: evalEnv(), fetch: globalThis.fetch.bind(globalThis), kv: memoryKv(), now: () => today, log: () => {} }
}

function writeReport(name: string, data: unknown, markdown: string): string {
  const dir = join(here, 'reports')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(join(dir, `${stamp}-${name}.json`), JSON.stringify(data, null, 2))
  const md = join(dir, `${stamp}-${name}.md`)
  writeFileSync(md, markdown)
  return md
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

async function recipes(flags: Record<string, string | boolean>): Promise<boolean> {
  const set = GoldenSetSchema.parse(JSON.parse(readFileSync(join(here, 'recipes', 'golden.json'), 'utf8')))
  const today = new Date(`${set.today}T03:00:00Z`)
  const useAi = flags.ai === true
  const limit = flags.limit ? Number(flags.limit) : set.cases.length
  const d = deps(today)
  const scores = []
  const rows: string[] = []
  let model: string | null = null
  for (const c of set.cases.slice(0, limit)) {
    const bean = BeanAttributesSchema.parse(c.input.bean)
    let recipe: Recipe
    let note = ''
    if (useAi) {
      try {
        const built = await personaliseRecipe({ bean, doseG: c.input.doseG, preferences: c.input.preferences }, d)
        recipe = built.recipe
        model = recipe.model
        if (built.clamped.length) note = `clamped: ${built.clamped.join(', ')}`
        if (built.usedBaseline) note = 'AI plan rejected; baseline used'
      } catch (e) {
        recipe = baselineRecipe({ bean, doseG: c.input.doseG, preferences: c.input.preferences, today })
        note = `AI unavailable (${(e as Error).message}); baseline used`
      }
    } else {
      recipe = baselineRecipe({ bean, doseG: c.input.doseG, preferences: c.input.preferences, today })
    }
    const s = scoreRecipe(c, recipe)
    scores.push({
      ...s,
      note,
      recipe: {
        tempC: recipe.tempC,
        ratio: recipe.ratio,
        grind: recipe.grind,
        bloomS: recipe.bloomS,
        totalTimeS: recipe.totalTimeS,
        pours: recipe.steps.filter((x) => x.kind === 'pour').length,
        source: recipe.source,
      },
    })
    rows.push(`| ${c.id} | ${c.description} | ${s.valid ? 'yes' : '**no**'} | ${s.outOfRange.join('; ') || '—'} | ${note || ''} |`)
  }
  const sum = summariseRecipes(scores)
  const title = useAi ? `AI-02 recipes · ${model ?? 'no model'}` : 'Rules engine recipes'
  const md = [
    `# ${title}`,
    '',
    `Golden set ${set.version} (${set.status}) · ${sum.cases} cases · ${new Date().toISOString()}`,
    '',
    `| Metric | Result | Threshold |`,
    `|---|---|---|`,
    `| Valid after repair | ${pct(sum.valid)} | ${pct(THRESHOLDS.recipeValid)} |`,
    `| Within acceptable ranges | ${pct(sum.inRange)} | ${pct(THRESHOLDS.recipeInRange)} |`,
    '',
    '| Case | Description | Valid | Outside range | Note |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
  const file = writeReport(useAi ? 'recipes-ai' : 'recipes-rules', { title, set: set.version, summary: sum, scores }, md)
  console.log(`${title}: valid ${pct(sum.valid)}, in range ${pct(sum.inRange)} → ${file}`)
  for (const s of scores.filter((x) => !x.valid || x.outOfRange.length)) console.log(`  ${s.id}: ${[...s.validationIssues, ...s.outOfRange].join('; ')}`)
  // The R0 exit criterion is validity (0 invalid recipes). Ranges gate AI runs, and rules runs with --strict.
  return sum.passed && (useAi || flags.strict ? sum.inRangePassed : true)
}

async function prepare(file: string): Promise<{ imageBase64: string; mimeType: string }> {
  const bytes = readFileSync(file)
  const mimeType = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  return { imageBase64: bytes.toString('base64'), mimeType }
}

async function labels(flags: Record<string, string | boolean>): Promise<boolean> {
  const truthFile = typeof flags.truth === 'string' ? resolve(flags.truth) : join(here, 'labels', 'ground-truth.json')
  if (!existsSync(truthFile)) {
    console.log(`No ground truth at ${truthFile}. Copy evals/labels/ground-truth.template.json and follow evals/labels/README.md.`)
    return true
  }
  const cases = z.array(LabelCaseSchema).parse(JSON.parse(readFileSync(truthFile, 'utf8')))
  const photos = typeof flags.photos === 'string' ? resolve(flags.photos) : process.env.EVAL_PHOTOS_DIR
  if (!photos) throw new Error('Pass --photos <dir> (label photos are kept out of the repository).')
  const size = typeof flags.size === 'string' ? flags.size : null
  const limit = flags.limit ? Number(flags.limit) : cases.length
  const today = typeof flags.today === 'string' ? new Date(`${flags.today}T03:00:00Z`) : new Date()
  const d = deps(today)
  const scores: LabelScore[] = []
  let model: string | null = null
  for (const c of cases.slice(0, limit)) {
    const original = join(photos, c.file)
    const hash = createHash('sha256').update(readFileSync(original)).digest('hex')
    if (hash !== c.sha256) throw new Error(`${c.id}: ${c.file} does not match its recorded hash. Wrong photo set?`)
    const image = await prepare(size ? join(photos, size, c.file.replace(/\.\w+$/, '.jpg')) : original)
    const started = Date.now()
    try {
      const { scan, costUsd } = await readLabel(image, d)
      model = scan.meta.model
      scores.push(scoreLabel(c, scan, Date.now() - started, costUsd))
    } catch (e) {
      scores.push(scoreLabel(c, null, Date.now() - started, 0, (e as Error).message))
    }
    process.stdout.write('.')
  }
  process.stdout.write('\n')
  const sum = summariseLabels(scores)
  const title = `AI-01 labels · ${model ?? 'no model'}${size ? ` · ${size} px` : ''}`
  const gate = (ok: boolean) => (ok ? 'pass' : '**fail**')
  const md = [
    `# ${title}`,
    '',
    `${sum.cases} labels · ${new Date().toISOString()}`,
    '',
    '| Metric | Result | Threshold | Gate |',
    '|---|---|---|---|',
    `| Core field accuracy | ${pct(sum.coreAccuracy)} | ≥ ${pct(THRESHOLDS.labelCoreAccuracy)} | ${gate(sum.gates.coreAccuracy)} |`,
    `| Fabrication rate | ${pct(sum.fabricationRate)} | ≤ ${pct(THRESHOLDS.labelFabricationMax)} | ${gate(sum.gates.fabrication)} |`,
    `| Roast date accuracy | ${pct(sum.roastDateAccuracy)} | ≥ ${pct(THRESHOLDS.labelRoastDateAccuracy)} | ${gate(sum.gates.roastDate)} |`,
    `| Schema-valid responses | ${pct(sum.schemaValid)} | ≥ ${pct(THRESHOLDS.labelSchemaValid)} | ${gate(sum.gates.schemaValid)} |`,
    `| p90 latency | ${(sum.latencyP90Ms / 1000).toFixed(1)} s | ≤ ${THRESHOLDS.labelP90LatencyMs / 1000} s | ${gate(sum.gates.latency)} |`,
    `| Cost | US$${sum.costUsd.toFixed(4)} | — | — |`,
    '',
    '## By field',
    '',
    '| Field | Accuracy (when printed) | Fabricated (when absent) |',
    '|---|---|---|',
    ...Object.entries(sum.perField).map(
      ([k, v]) => `| ${k} | ${v.accuracy === null ? '—' : pct(v.accuracy)} (${v.present}) | ${v.fabricated} of ${v.absent} |`,
    ),
    '',
    '## By label language (core fields)',
    '',
    ...Object.entries(sum.byLanguage).map(([k, v]) => `- ${k}: ${pct(v)}`),
    '',
  ].join('\n')
  const file = writeReport(`labels${size ? `-${size}` : ''}`, { title, summary: sum, scores }, md)
  console.log(`${title}: core ${pct(sum.coreAccuracy)}, fabrication ${pct(sum.fabricationRate)}, roast date ${pct(sum.roastDateAccuracy)} → ${file}`)
  return sum.passed
}

async function main() {
  const { capability, flags } = args(process.argv.slice(2))
  let ok: boolean
  if (capability === 'recipes') ok = await recipes(flags)
  else if (capability === 'labels') ok = await labels(flags)
  else {
    console.log('Usage: npx tsx evals/run.ts <recipes|labels> [--ai] [--strict] [--limit N] [--photos DIR] [--size PX] [--truth FILE] [--today YYYY-MM-DD]')
    process.exit(2)
  }
  if (!ok) {
    console.log('Eval gate failed.')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
