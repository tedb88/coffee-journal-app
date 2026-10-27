# BrewMap

Scan a coffee bag, get a V60 recipe built for that coffee, and keep a journal and origin map of what you brew. Mobile-first web app for home brewers in Hong Kong.

**Status: v0.2.0, release R0 (Foundation).** R0 makes the prototype safe and solid: one rules engine, guaranteed-valid recipes, on-device storage with migration, abuse and spend protection, an AI gateway for open-weight models, tests, CI and an eval harness. The redesigned screens arrive in R1 (see [docs/UX_DESIGN.md](docs/UX_DESIGN.md)).

## Documents (read these first)

| Document | What it decides |
|---|---|
| [docs/BRD.md](docs/BRD.md) | Business requirements, with IDs such as `RCP-05` that code and tests cite |
| [docs/SOLUTION_PLAN.md](docs/SOLUTION_PLAN.md) | Features, AI design, evals, releases and backlog |
| [docs/UX_DESIGN.md](docs/UX_DESIGN.md) | The key user journey and the design system |
| [docs/adr/](docs/adr/README.md) | Architecture decisions ADR-01 to ADR-09 |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version |

## Quick start

Requires Node.js 20 or later.

```bash
npm install
cp .env.example .env     # optional: add AI provider settings
npm run dev              # app and API on http://localhost:5173
```

With no AI settings the app still works end to end: label reading offers manual entry, and recipes come from the on-device rules engine. Add an `AI_*` provider to `.env` to use AI locally; the dev server runs the same API code as Vercel, and keys stay on the server.

## Configuration

All settings are server-side except `VITE_TURNSTILE_SITE_KEY`. See [.env.example](.env.example).

| Setting | Purpose |
|---|---|
| `AI_BASE_URL`, `AI_API_KEY`, `AI_SCAN_MODEL`, `AI_RECIPE_MODEL` | Primary OpenAI-compatible provider. Open-weight models only; others are rejected at run time (D7, AIP-9). |
| `AI_PRICE_IN_PER_M`, `AI_PRICE_OUT_PER_M` | Provider prices in US$ per million tokens, for the spend cap |
| `AI_FALLBACK_*` | Optional failover provider, same names |
| `GROQ_API_KEY` | Legacy provider, tried last until the model migration (ADR-09). `AI_DISABLE_LEGACY_GROQ=true` switches it off. |
| `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile bot check |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared counters for rate limits and spend (Vercel KV names also work) |
| `AI_MONTHLY_CAP_USD` | Monthly AI spend cap; default 20 (D12) |
| `ALERT_WEBHOOK_URL` | Optional webhook for spend alerts at 50%, 80% and 100% |
| `ALLOW_UNPROTECTED_AI` | `true` lets AI run in production without Turnstile and Upstash. Not recommended. |

> **Production fails closed.** On a Vercel production deployment, AI stays off until Turnstile and Upstash are configured (ADR-06). The app keeps working with manual entry and rules recipes.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | App and API with hot reload |
| `npm run build` / `npm run preview` | Production build / serve it (no API) |
| `npm run lint` · `npm run format` · `npm run typecheck` | ESLint · Prettier (new TypeScript code) · TypeScript |
| `npm test` · `npm run test:coverage` | Unit and integration tests · with coverage thresholds |
| `npm run e2e` | Playwright journeys on mobile Chromium |
| `npm run eval:recipes` | Rules engine over the 50-case golden set (the CI gate). Add `-- --ai` to evaluate the configured AI model. |
| `npm run eval:labels -- --photos DIR` | Vision model over the private label set ([evals/labels/README.md](evals/labels/README.md)) |
| `npm run check` | Everything CI runs except the end-to-end tests |

## Project structure

```
src/domain/      Brewing rules, schemas, recipe engine, validator, dial-in advice (shared by app, API, evals)
src/data/        IndexedDB (Dexie) schema, repositories, legacy migration, export/import
src/lib/         Client glue: API client, Turnstile, image pipeline, form and journal view models
src/components/  Current screens (React). Rewritten in R1.
api/scan.ts      POST /api/scan    — read a label photo (AI-01)
api/recipe.ts    POST /api/recipe  — personalise a recipe within bounds (AI-02)
api/_lib/        Protection, AI gateway, provider registry, prompts, routes
evals/           Eval harness, metrics, recipe golden set, label-set protocol
e2e/             Playwright journeys
docs/            BRD, Solution Plan, UX design, ADRs
```

## Quality gates

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every push and pull request: lint, format check, type check, unit tests with coverage, build, the recipe eval gate, a production dependency audit, and the end-to-end journeys. Pull requests that change prompts, rules or the registry also run a 20-case AI recipe smoke test when the `AI_*` repository secrets are set.

## Deploying

1. In Vercel, set the settings above for Production (and Preview if wanted). Delete the old `VITE_GROQ_API_KEY`: it is no longer used.
2. Create a Turnstile widget (Cloudflare) and an Upstash Redis database (free tiers are enough).
3. Deploy, then confirm the functions run in `hkg1` (ADR-07) and that a scan works.
4. Watch the `ai_call` and `spend_alert` log lines in the Vercel logs.
