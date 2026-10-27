// POST /api/recipe: a V60 recipe for a bean, personalised within bounds (AI-02).
import { nodeHandler } from './_lib/http.js'
import { recipeRoute } from './_lib/routes.js'

export default nodeHandler(recipeRoute)
