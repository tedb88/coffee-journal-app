// In production (Vercel), calls the serverless proxy at /api/analyze or /api/recipe
// In development, calls Groq directly via the VITE_ env var
const IS_DEV = import.meta.env.DEV

const GROQ_URL        = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL           = 'meta-llama/llama-4-scout-17b-16e-instruct'
const RECIPE_MODEL    = 'llama-3.3-70b-versatile'

const PROMPT = `Analyze this coffee label image. Return ONLY this JSON, no extra text:
{"name":"","origin":"country","region":"","roastLevel":"Light|Medium-Light|Medium|Medium-Dark|Dark","process":"Washed|Natural|Honey|Anaerobic|Wet-Hulled","tastingNotes":[],"variety":"","altitude":""}`

const TIMEOUT_MS = 35000

const RECIPE_SYSTEM_PROMPT = `You are a Specialty Coffee Association (SCA)-certified brew guide generator for hand-drip pour-over (V60 style).

TASK: Given coffee label JSON, a user-chosen dosage, and optional flavor preferences, output a precise brew guide as JSON only.

SCA BASELINE PARAMETERS:
- Golden ratio: 1:15 (strong) to 1:17 (light). Default 1:16.
- Water temp: 90°C (dark) to 96°C (light). SCA ideal: 93°C.
- Grind scale: Fine | Medium-Fine | Medium | Medium-Coarse | Coarse (lighter roast = finer)
- Bloom: 2× coffee dose in ml, 30–45s wait
- Total brew time: 2:30–3:45 depending on dose and roast

ORIGIN TUNING:
Ethiopia: 94°C, 1:17, Medium-Fine, 40s bloom, 3:30 total
Kenya: 95°C, 1:16, Medium-Fine, 35s bloom, 3:20 total
Colombia: 93°C, 1:16, Medium, 30s bloom, 3:10 total
Brazil: 91°C, 1:15, Medium-Coarse, 35s bloom, 3:00 total
Guatemala: 93°C, 1:16, Medium, 30s bloom, 3:10 total
Honduras: 92°C, 1:16, Medium, 30s bloom, 3:05 total
Mexico: 92°C, 1:16, Medium, 30s bloom, 3:05 total
Costa Rica: 93°C, 1:16, Medium-Fine, 30s bloom, 3:15 total
Panama: 94°C, 1:17, Medium-Fine, 40s bloom, 3:30 total
Indonesia: 90°C, 1:14, Medium-Coarse, 35s bloom, 2:50 total
Yemen: 94°C, 1:16, Medium-Fine, 40s bloom, 3:25 total
Rwanda: 94°C, 1:16, Medium-Fine, 35s bloom, 3:20 total
Default: 93°C, 1:16, Medium, 30s bloom, 3:10 total

PROCESS MODIFIER:
Natural: −1°C, shift grind one step coarser, +5s bloom
Honey: −1°C, no grind change, +5s bloom
Anaerobic: −2°C, shift grind one step coarser, +10s bloom
Washed: no adjustment
Wet-Hulled: −1°C, shift grind one step coarser

ROAST MODIFIER:
Light: +2°C, shift grind one step finer, +15s total time
Medium-Light: +1°C, no grind change, +5s total time
Medium: no change
Medium-Dark: −1°C, shift grind one step coarser, −10s total time
Dark: −3°C, shift grind two steps coarser, −20s total time

GRIND SCALE: Fine → Medium-Fine → Medium → Medium-Coarse → Coarse (clamp at both ends)

FLAVOR PROFILE INPUT:
You may receive a flavorProfile object: { taste, body, acidity } — each field may be null (use origin defaults if so).

POUR COUNT RULES (you decide 3–6 total steps including bloom):
- taste fruity or floral → 4–6 steps (smaller pours build aromatic clarity)
- taste chocolatey or balanced → 3–4 steps
- body concentrated → 3 steps max, ratio 1:12–1:14
- body light → 4–5 steps, ratio 1:17–1:18
- no preference → 3–4 steps (origin default)

PARAMETER ADJUSTMENTS FROM FLAVOR:
- acidity bright → +1°C, ratio +1 water (more dilute)
- acidity lowacid → −2°C, grind one step coarser
- body light → ratio 1:17+, grind one step finer
- body strong → ratio 1:14–1:15
- body concentrated → ratio 1:12–1:13, shorter total time
- taste fruity → temp toward high end of origin range, lighter early pours
- taste floral → lighter individual pours with gentle agitation
- taste chocolatey → temp toward lower end of origin range, slightly coarser

VARIABLE STEP RULES:
- Step 1 is always Bloom: water = dosage × 2ml, 30–45s wait
- Remaining steps: distribute (totalWater − bloomWater) across them
  - fruity/floral: earlier pours slightly lighter, build intensity gradually
  - strong/concentrated: equal or slightly front-loaded pours
  - Step names can be descriptive: "Sweetness Pour", "Clarity Pour", "Agitation Pour", "Final Pour", etc.
- Space pours evenly in time between bloom-end and totalTime
- Water arithmetic must be exact: bloomWater + sum(all pour waters) = totalWater

WATER CALCULATIONS (must be arithmetically exact):
totalWater = Math.round(dosage × ratioNumber)
bloomWater = Math.round(dosage × 2)
Remaining pours: distribute (totalWater − bloomWater) across N−1 pour steps (round each, adjust final to ensure sum is exact)

STEP TIMINGS:
Bloom ends at: "0:{bloomSeconds}" (pad to 2 digits)
Remaining pours: space evenly between bloom-end and totalTime
Final step ends at: totalTime

OUTPUT RULES:
- Return ONLY valid JSON — no markdown fences, no prose
- Schema (steps[] can be 3–6 items):
{"coffeeAmount":"{dosage}g","waterAmount":"{totalWater}ml","ratio":"1:{n}","waterTemp":"{temp}°C","grindSize":"{grind}","totalTime":"M:SS","steps":[{"name":"...","water":"...ml","waitUntil":"M:SS","notes":"..."}],"tips":"Process insight sentence. Origin brewing note sentence."}
- tips: single string under 200 characters`

function buildRecipeUserMessage(labelData, dosage, flavorProfile) {
  const flavorLine = flavorProfile
    ? `\nFlavor preferences: taste=${flavorProfile.taste || 'none'}, body=${flavorProfile.body || 'none'}, acidity=${flavorProfile.acidity || 'none'}`
    : ''
  return `Coffee label data:
${JSON.stringify(labelData, null, 2)}

Dosage selected by user: ${dosage}g${flavorLine}

Please generate the brew guide for this specific coffee. Apply your knowledge of ${labelData.origin || 'the'} terroir, ${labelData.process || 'Washed'} processing, and ${labelData.roastLevel || 'Medium'} roast characteristics. Scale all water amounts precisely to match the ${dosage}g dose. Use the flavor preferences to decide pour count, parameters, and step naming.`
}

export async function generateBrewRecipe(labelData, dosage, flavorProfile = null) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let response

    if (IS_DEV) {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY
      if (!apiKey) throw new Error('VITE_GROQ_API_KEY is not set. Add it to your .env file.')

      response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: RECIPE_MODEL,
          messages: [
            { role: 'system', content: RECIPE_SYSTEM_PROMPT },
            { role: 'user',   content: buildRecipeUserMessage(labelData, dosage, flavorProfile) },
          ],
          max_tokens: 800,
          temperature: 0.3,
        }),
        signal: controller.signal,
      })
    } else {
      response = await fetch('/api/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelData, dosage, flavorProfile }),
        signal: controller.signal,
      })
    }

    clearTimeout(timer)

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      const msg = err?.error || err?.error?.message
      if (response.status === 401) throw new Error(msg || 'API key is invalid or expired.')
      if (response.status === 429) throw new Error(msg || 'Rate limit reached — please wait a minute and try again.')
      if (response.status === 502 || response.status === 504) throw new Error(msg || 'AI recipe generation failed. Using fallback.')
      throw new Error(msg || `Recipe generation error (${response.status}).`)
    }

    if (IS_DEV) {
      const data    = await response.json()
      const rawText = data.choices?.[0]?.message?.content ?? ''
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      try {
        return JSON.parse(cleaned)
      } catch {
        throw new Error('AI returned an unexpected response.')
      }
    } else {
      return await response.json()
    }
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      throw new Error('Recipe generation timed out. Using fallback.')
    }
    if (e.message && !e.message.includes('Failed to fetch') && !e.message.includes('NetworkError')) {
      throw e
    }
    throw new Error('Could not connect to recipe service. Using fallback.')
  }
}

export async function analyzeCoffeeLabel(base64Image, mimeType) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let response

    if (IS_DEV) {
      // Dev mode: call Groq directly (CORS OK from localhost for most APIs)
      const apiKey = import.meta.env.VITE_GROQ_API_KEY
      if (!apiKey) throw new Error('VITE_GROQ_API_KEY is not set. Add it to your .env file.')

      response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
              { type: 'text', text: PROMPT },
            ],
          }],
          max_tokens: 250,
          temperature: 0,
        }),
        signal: controller.signal,
      })
    } else {
      // Production: call serverless proxy (no CORS, key hidden server-side)
      response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image, mimeType }),
        signal: controller.signal,
      })
    }

    clearTimeout(timer)

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      const msg = err?.error || err?.error?.message
      // Provide actionable messages for common failures
      if (response.status === 401) throw new Error(msg || 'API key is invalid or expired. Please contact the app owner.')
      if (response.status === 429) throw new Error(msg || 'Rate limit reached — too many scans. Please wait a minute and try again.')
      if (response.status === 413) throw new Error(msg || 'Image too large. Please try a smaller or cropped photo.')
      if (response.status === 502) throw new Error(msg || 'AI service is temporarily unavailable. Please try again in a moment.')
      if (response.status === 504) throw new Error(msg || 'Analysis timed out. Please check your connection and try again.')
      throw new Error(msg || `Unexpected error (${response.status}). Please try again.`)
    }

    if (IS_DEV) {
      // Dev: parse from Groq response format
      const data    = await response.json()
      const rawText = data.choices?.[0]?.message?.content ?? ''
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      try {
        return JSON.parse(cleaned)
      } catch {
        throw new Error('AI returned an unexpected response. Please try again.')
      }
    } else {
      // Production: serverless function already returns parsed JSON
      return await response.json()
    }
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      throw new Error('Analysis timed out — this can happen on slow connections. Please try again.')
    }
    // Re-throw if it's already a user-friendly message from above
    if (e.message && !e.message.includes('Failed to fetch') && !e.message.includes('NetworkError')) {
      throw e
    }
    // Generic fetch failure — give actionable advice
    throw new Error('Could not connect to the analysis service. Please check your internet connection and try again.')
  }
}
