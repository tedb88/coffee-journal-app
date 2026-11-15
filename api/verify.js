const GROQ_URL      = 'https://api.groq.com/openai/v1/chat/completions'
const VERIFY_MODEL  = 'llama-3.3-70b-versatile'

const VALID_GRINDS = new Set(['Fine', 'Medium-Fine', 'Medium', 'Medium-Coarse', 'Coarse'])

const SYSTEM_PROMPT = `You are a recipe auditor for hand-drip pour-over brew guides. You will receive a generated recipe and the original coffee inputs. Check every rule below and return ONLY a JSON verdict — no prose, no markdown.

CHECKS (apply all):
1. ARITHMETIC: Parse all "Xml" strings to integers. bloomWater = steps[0].water. totalWater = waterAmount integer. ratioNum = integer after "1:" in ratio. dosage = coffeeAmount integer. Verify: round(dosage * 2) == bloomWater, round(dosage * ratioNum) == totalWater, bloomWater + sum(all step waters) == totalWater.
2. TIMING: Parse each waitUntil as total seconds (M*60+S). Verify each is strictly greater than the previous. Verify the final step's waitUntil equals totalTime.
3. TEMPERATURE: Extract integer from waterTemp. Verify 88 <= temp <= 96.
4. GRIND: Verify grindSize is one of: Fine, Medium-Fine, Medium, Medium-Coarse, Coarse.
5. RATIO: Extract integer after "1:" from ratio. Verify 12 <= ratioNum <= 18.
6. STEP COUNT: Verify 3 <= steps.length <= 6.
7. TIPS LENGTH: Verify tips.length < 200.
8. COHERENCE: Given the origin, process, and roastLevel, verify the parameters make directional sense:
   - Natural/Honey/Anaerobic process → temp should be lower than Washed baseline for that origin
   - Light roast → temp higher end, finer grind vs Medium for same origin
   - Dark roast → temp lower end, coarser grind vs Medium for same origin
   - Indonesia/Wet-Hulled → ratio should be 1:14 or lower, coarser grind
   - Ethiopia/Kenya/Panama → ratio 1:16 or higher, finer grind

OUTPUT — return ONLY this JSON:
{
  "pass": true | false,
  "failures": ["<description of each failed check>"],
  "corrections": {
    // include ONLY the fields that need to change, using exact recipe field names
    // e.g. "waterTemp": "93°C", "grindSize": "Medium", "steps": [...]
    // if pass is true, omit corrections entirely or use {}
  }
}`

function buildUserMessage(recipe, inputs) {
  return `Original inputs:
origin: ${inputs.origin}
process: ${inputs.process || 'Washed'}
roastLevel: ${inputs.roastLevel || 'Medium'}
dosage: ${inputs.dosage}g

Generated recipe:
${JSON.stringify(recipe, null, 2)}`
}

function parseTime(str) {
  // "M:SS" → total seconds
  const [m, s] = str.split(':').map(Number)
  return m * 60 + s
}

function parseNum(str) {
  // "240ml" → 240, "93°C" → 93, "15g" → 15
  return parseInt(str, 10)
}

// Local arithmetic/structural checks that don't need an LLM
function localChecks(recipe, dosage) {
  const failures = []
  const corrections = {}

  // Step count
  if (!Array.isArray(recipe.steps) || recipe.steps.length < 3 || recipe.steps.length > 6) {
    failures.push(`Step count ${recipe.steps?.length} is outside 3–6`)
  }

  // Tips length
  if (typeof recipe.tips === 'string' && recipe.tips.length >= 200) {
    failures.push(`Tips too long (${recipe.tips.length} chars)`)
    corrections.tips = recipe.tips.slice(0, 197) + '...'
  }

  // Temperature
  const temp = parseNum(recipe.waterTemp)
  if (isNaN(temp) || temp < 88 || temp > 96) {
    failures.push(`waterTemp ${recipe.waterTemp} out of range 88–96°C`)
  }

  // Grind
  if (!VALID_GRINDS.has(recipe.grindSize)) {
    failures.push(`grindSize "${recipe.grindSize}" is not a valid value`)
  }

  // Ratio
  const ratioNum = parseNum(recipe.ratio?.split(':')?.[1])
  if (isNaN(ratioNum) || ratioNum < 12 || ratioNum > 18) {
    failures.push(`ratio ${recipe.ratio} is outside 1:12–1:18`)
  }

  // Arithmetic
  const totalWater   = parseNum(recipe.waterAmount)
  const coffeeAmount = parseNum(recipe.coffeeAmount)
  const bloomWater   = parseNum(recipe.steps?.[0]?.water)
  const stepWaters   = (recipe.steps || []).map(s => parseNum(s.water))
  const stepSum      = stepWaters.reduce((a, b) => a + b, 0)

  if (!isNaN(coffeeAmount) && !isNaN(ratioNum)) {
    const expectedTotal = Math.round(coffeeAmount * ratioNum)
    if (Math.abs(totalWater - expectedTotal) > 1) {
      failures.push(`waterAmount ${totalWater}ml ≠ expected ${expectedTotal}ml (${coffeeAmount}g × ${ratioNum})`)
    }
  }
  if (!isNaN(coffeeAmount)) {
    const expectedBloom = Math.round(coffeeAmount * 2)
    if (Math.abs(bloomWater - expectedBloom) > 1) {
      failures.push(`bloomWater ${bloomWater}ml ≠ expected ${expectedBloom}ml (${coffeeAmount}g × 2)`)
    }
  }
  if (!isNaN(totalWater) && Math.abs(stepSum - totalWater) > 1) {
    failures.push(`Step waters sum to ${stepSum}ml but waterAmount is ${totalWater}ml`)
  }

  // Timing
  if (Array.isArray(recipe.steps) && recipe.steps.length > 0) {
    const times = recipe.steps.map(s => parseTime(s.waitUntil))
    for (let i = 1; i < times.length; i++) {
      if (times[i] <= times[i - 1]) {
        failures.push(`Step ${i + 1} waitUntil "${recipe.steps[i].waitUntil}" is not after step ${i} "${recipe.steps[i - 1].waitUntil}"`)
      }
    }
    const lastTime  = times[times.length - 1]
    const totalTime = parseTime(recipe.totalTime)
    if (lastTime !== totalTime) {
      failures.push(`Final step waitUntil "${recipe.steps.at(-1).waitUntil}" ≠ totalTime "${recipe.totalTime}"`)
    }
  }

  return { failures, corrections }
}

export async function verifyRecipe(recipe, inputs, apiKey) {
  // Run deterministic local checks first
  const { failures: localFailures, corrections: localCorrections } = localChecks(recipe, inputs.dosage)

  // Ask the LLM only for the coherence check (origin/process/roast logic)
  let llmCorrections = {}
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VERIFY_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: buildUserMessage(recipe, inputs) },
        ],
        max_tokens: 400,
        temperature: 0,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (response.ok) {
      const data    = await response.json()
      const rawText = data.choices?.[0]?.message?.content ?? ''
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const verdict = JSON.parse(cleaned)

      if (verdict.pass === false && verdict.corrections) {
        llmCorrections = verdict.corrections
      }
      if (Array.isArray(verdict.failures) && verdict.failures.length > 0) {
        console.warn('[verify] LLM coherence failures:', verdict.failures)
      }
    }
  } catch (e) {
    clearTimeout(timer)
    // Verifier failure is non-fatal — log and continue
    console.warn('[verify] verifier call failed:', e.message)
  }

  const allFailures    = localFailures
  const allCorrections = { ...localCorrections, ...llmCorrections }
  const pass           = allFailures.length === 0 && Object.keys(llmCorrections).length === 0

  if (!pass) {
    console.warn('[verify] recipe failures:', allFailures)
  }

  return { pass, failures: allFailures, corrections: allCorrections }
}
