const API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL   = 'meta-llama/llama-4-scout-17b-16e-instruct'

const PROMPT = `Analyze this coffee label image. Return ONLY this JSON, no extra text:
{"name":"","origin":"country","region":"","roastLevel":"Light|Medium-Light|Medium|Medium-Dark|Dark","process":"Washed|Natural|Honey|Anaerobic|Wet-Hulled","tastingNotes":[],"variety":"","altitude":""}`

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured — GROQ_API_KEY not set.' })
  }

  const { base64Image, mimeType } = req.body || {}
  if (!base64Image || !mimeType) {
    return res.status(400).json({ error: 'Missing image data.' })
  }

  // Reject oversized payloads (base64 is ~33% larger than raw — cap at ~6MB base64 ≈ 4.5MB image)
  if (base64Image.length > 6 * 1024 * 1024) {
    return res.status(413).json({ error: 'Image too large. Please use a smaller photo.' })
  }

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
    clearTimeout(timer)

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      const msg = err?.error?.message || `Groq API error ${response.status}`
      // Map common status codes to user-friendly messages
      if (response.status === 401) return res.status(401).json({ error: 'API key is invalid or expired. Please contact the app owner.' })
      if (response.status === 429) return res.status(429).json({ error: 'Rate limit reached — too many scans. Please wait a minute and try again.' })
      if (response.status === 413) return res.status(413).json({ error: 'Image too large for the AI model. Please crop or compress your photo.' })
      return res.status(response.status).json({ error: msg })
    }

    const data    = await response.json()
    const rawText = data.choices?.[0]?.message?.content ?? ''
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return res.status(502).json({ error: 'AI returned an unexpected response. Please try again.' })
    }

    return res.status(200).json(parsed)
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'AI analysis timed out. Please try again.' })
    }
    return res.status(502).json({ error: `Could not reach AI service: ${e.message}` })
  }
}
