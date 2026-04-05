const API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL   = 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `You are a Specialty Coffee Association (SCA)-certified brew guide generator for hand-drip pour-over (V60 style).

TASK: Given coffee label JSON, a user-chosen dosage, and optional flavor preferences, output a precise brew guide as JSON only.

SCA BASELINE PARAMETERS:
- Golden ratio: 1:15 (strong) to 1:17 (light). Default 1:16.
- Water temp: 90°C (dark) to 96°C (light). SCA ideal: 93°C.
- Grind scale: Fine | Medium-Fine | Medium | Medium-Coarse | Coarse (lighter roast = finer)
- Bloom: 2× coffee dose in ml, 30–45s wait
- Total brew time: 2:30–3:45 depending on dose and roast

ORIGIN TUNING (starting points):
Ethiopia: 94°C, 1:17, Medium-Fine, 40s bloom, 3:30 total — high-altitude, dense, floral and fruit complexity
Kenya: 95°C, 1:16, Medium-Fine, 35s bloom, 3:20 total — bright and juicy, blackcurrant, high acidity
Colombia: 93°C, 1:16, Medium, 30s bloom, 3:10 total — balanced and forgiving, caramel, mild fruit
Brazil: 91°C, 1:15, Medium-Coarse, 35s bloom, 3:00 total — low acid, full body, chocolate and nuts
Guatemala: 93°C, 1:16, Medium, 30s bloom, 3:10 total — cocoa, spice, mild fruit
Honduras: 92°C, 1:16, Medium, 30s bloom, 3:05 total — caramel sweetness, approachable
Mexico: 92°C, 1:16, Medium, 30s bloom, 3:05 total — mild, nutty, clean and sweet
Costa Rica: 93°C, 1:16, Medium-Fine, 30s bloom, 3:15 total — honey and stone-fruit, bright
Panama: 94°C, 1:17, Medium-Fine, 40s bloom, 3:30 total — delicate Gesha, jasmine and bergamot
Indonesia: 90°C, 1:14, Medium-Coarse, 35s bloom, 2:50 total — earthy, heavy body, wet-hulled
Yemen: 94°C, 1:16, Medium-Fine, 40s bloom, 3:25 total — wild and complex, dried-fruit and spice
Rwanda: 94°C, 1:16, Medium-Fine, 35s bloom, 3:20 total — bright, tea-like, red-fruit and floral
Default (unknown origin): 93°C, 1:16, Medium, 30s bloom, 3:10 total

PROCESS MODIFIER (apply on top of origin):
Natural: −1°C, shift grind one step coarser, +5s bloom — fruity sweetness, prevent over-extraction
Honey: −1°C, no grind change, +5s bloom — preserves caramel and stone-fruit mucilage
Anaerobic: −2°C, shift grind one step coarser, +10s bloom — intense fermented fruit, keep in balance
Washed: no adjustment — clean cup, terroir and acidity speak clearly
Wet-Hulled: −1°C, shift grind one step coarser, no bloom change — tames heavy earthy body

ROAST MODIFIER (apply after process):
Light: +2°C, shift grind one step finer, +15s total time
Medium-Light: +1°C, no grind change, +5s total time
Medium: no change
Medium-Dark: −1°C, shift grind one step coarser, −10s total time
Dark: −3°C, shift grind two steps coarser, −20s total time

GRIND SCALE (for shifting): Fine → Medium-Fine → Medium → Medium-Coarse → Coarse
Clamp to Fine minimum and Coarse maximum.

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
- taste floral → lighter individual pours with gentle agitation notes
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
Remaining pours: distribute (totalWater − bloomWater) across N−1 pour steps; round each, adjust final pour to make sum exact

STEP TIMINGS:
Bloom ends at: "0:{bloomSeconds}" — pad seconds to 2 digits (e.g. "0:40")
Remaining pours: space evenly between bloom-end and totalTime
Final step ends at: totalTime

OUTPUT RULES:
- Return ONLY valid JSON — no markdown fences, no prose, no explanation
- Schema (steps[] can be 3–6 items):
{
  "coffeeAmount": "{dosage}g",
  "waterAmount": "{totalWater}ml",
  "ratio": "1:{ratioNum}",
  "waterTemp": "{temp}°C",
  "grindSize": "{grind}",
  "totalTime": "M:SS",
  "steps": [
    {"name":"Bloom", "water":"{bloomWater}ml", "waitUntil":"0:SS", "notes":"..."},
    {"name":"...",   "water":"...ml",           "waitUntil":"M:SS", "notes":"..."}
  ],
  "tips": "One sentence on process or flavor insight. One sentence on origin brewing note."
}
- tips: a single string under 200 characters
- coffeeAmount integer grams (e.g. "15g"), waterAmount integer ml (e.g. "240ml")
- waterTemp integer Celsius (e.g. "94°C"), totalTime format "M:SS" (e.g. "3:30")`

const REQUIRED_KEYS = ['coffeeAmount', 'waterAmount', 'ratio', 'waterTemp', 'grindSize', 'totalTime', 'steps', 'tips']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured — GROQ_API_KEY not set.' })
  }

  const { labelData, dosage, flavorProfile } = req.body || {}
  if (!labelData || !labelData.origin) {
    return res.status(400).json({ error: 'Missing label data.' })
  }

  const flavorLine = flavorProfile
    ? `\nFlavor preferences: taste=${flavorProfile.taste || 'none'}, body=${flavorProfile.body || 'none'}, acidity=${flavorProfile.acidity || 'none'}`
    : ''

  const userMessage = `Coffee label data:
${JSON.stringify(labelData, null, 2)}

Dosage selected by user: ${dosage || 15}g${flavorLine}

Please generate the brew guide for this specific coffee. Apply your knowledge of ${labelData.origin} terroir, ${labelData.process || 'Washed'} processing, and ${labelData.roastLevel || 'Medium'} roast characteristics. Scale all water amounts precisely to match the ${dosage || 15}g dose. Use the flavor preferences to decide pour count (3–6 steps), parameters, and step naming.`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      if (response.status === 401) return res.status(401).json({ error: 'API key is invalid or expired. Please contact the app owner.' })
      if (response.status === 429) return res.status(429).json({ error: 'Rate limit reached — please wait a minute and try again.' })
      const msg = err?.error?.message || `Groq API error ${response.status}`
      return res.status(response.status).json({ error: msg })
    }

    const data    = await response.json()
    const rawText = data.choices?.[0]?.message?.content ?? ''
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return res.status(502).json({ error: 'AI returned an unexpected response. Using fallback.' })
    }

    // Validate required keys are present
    const missing = REQUIRED_KEYS.filter(k => !(k in parsed))
    if (missing.length > 0 || !Array.isArray(parsed.steps) || parsed.steps.length < 3 || parsed.steps.length > 6) {
      return res.status(502).json({ error: 'AI returned an incomplete recipe. Using fallback.' })
    }

    return res.status(200).json(parsed)
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Recipe generation timed out. Using fallback.' })
    }
    return res.status(502).json({ error: `Could not reach AI service: ${e.message}` })
  }
}
