import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Serves /api/scan and /api/recipe from the same route code Vercel runs, so
 * local development needs no separate server and API keys never reach the
 * browser bundle (G11).
 */
function apiRoutes(): Plugin {
  const routes: Record<string, 'scanRoute' | 'recipeRoute'> = { '/api/scan': 'scanRoute', '/api/recipe': 'recipeRoute' }
  return {
    name: 'brewmap-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const name = routes[(req.url ?? '').split('?')[0]]
        if (!name) return next()
        try {
          const mod = await server.ssrLoadModule('/api/_lib/routes.ts')
          const http = await server.ssrLoadModule('/api/_lib/http.ts')
          await http.nodeHandler(mod[name])(req, res)
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Server-side settings for the dev API only. Only VITE_* values are ever exposed to the client.
  const env = loadEnv(mode, process.cwd(), '')
  for (const [k, v] of Object.entries(env)) if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v
  return {
    plugins: [react(), apiRoutes()],
    server: { host: true },
  }
})
