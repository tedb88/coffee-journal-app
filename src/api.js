const API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL   = 'meta-llama/llama-4-scout-17b-16e-instruct'

const PROMPT = `Analyze this coffee label image. Return ONLY this JSON, no extra text:
{"name":"","origin":"country","region":"","roastLevel":"Light|Medium-Light|Medium|Medium-Dark|Dark","process":"Washed|Natural|Honey|Anaerobic|Wet-Hulled","tastingNotes":[],"variety":"","altitude":""}`

const API_TIMEOUT_MS = 30000 // 30 seconds — generous for slow mobile connections

export async function analyzeCoffeeLabel(base64Image, mimeType) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY
  if (!apiKey) throw new Error('VITE_GROQ_API_KEY is not set. Add it to your .env file.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  let response
  try {
    response = await fetch(API_URL, {
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
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      throw new Error('Analysis timed out — please check your connection and try again.')
    }
    throw new Error('Network error — please check your internet connection.')
  }
  clearTimeout(timer)

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${response.status}`)
  }

  const data    = await response.json()
  const rawText = data.choices?.[0]?.message?.content ?? ''
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error('Could not parse the AI response. Please try again.')
  }
}
