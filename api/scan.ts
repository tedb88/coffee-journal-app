// POST /api/scan: read a coffee label photo (AI-01).
import { nodeHandler } from './_lib/http.js'
import { scanRoute } from './_lib/routes.js'

export default nodeHandler(scanRoute)
