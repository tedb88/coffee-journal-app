# Changelog

All notable changes. Versions follow [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-10-27 · Release R0 (Foundation)

Built against BRD v0.3 and Solution Plan v0.2. Epics E0.1–E0.6.

### Added
- **Domain core** (`src/domain`, ADR-02): one rules source for origin, process, roast, preference and freshness; recipe engine with exact water split; deterministic validator; bounded AI adjustment plans; dial-in advice; label normalisation (ISO countries, day-first roast dates, altitude, weight) with a fabrication gate.
- **On-device storage** (ADR-01): IndexedDB through Dexie with beans, brews and photos as separate records; legacy journal migration with a backup, safe against two launches at once; persistent-storage request; export and import.
- **Abuse and spend protection** (ADR-06): Turnstile, per-client and global rate limits on Upstash, payload limits, a US$20 monthly AI cap with alerts. AI fails closed in production until protection is configured.
- **AI gateway** (ADR-03): OpenAI-compatible adapter, provider registry with failover, open-weight model policy, JSON mode with one repair, versioned prompts, telemetry lines.
- **Scanner**: every field editable before saving, uncertain fields flagged with the reason, manual entry with or without a photo, retry after a failed scan, recipe built on the device when AI or the network is unavailable.
- **Eval harness** (`evals/`): 50-case recipe golden set (draft, pending expert review D9), label-set protocol and metrics, photo preparation for the bake-off.
- **Engineering baseline**: TypeScript for new code, ESLint, Prettier, Vitest with coverage thresholds, fast-check property test, Playwright journeys, GitHub Actions CI, dependency audit, ADRs, CLAUDE.md.
- API functions in the Vercel Hong Kong region (ADR-07) and basic security headers.

### Changed
- API endpoints are now `POST /api/scan` and `POST /api/recipe`. The LLM verifier call is removed (ADR-04).
- Label photos are sent at 1024 px instead of 512 px (interim, until the bake-off picks the size).
- The map uses ISO country data and builds popups from text, not HTML.
- Deleting a brew asks for confirmation.
- zod upgraded to v4 (fixes GHSA-mrhx-c7xc-m3w5).

### Removed
- Direct browser calls to the AI provider in development, and the `VITE_GROQ_API_KEY` setting.
- Silent deletion of photos and old entries when storage was full (G4, G5).
- `api/analyze.js`, `api/verify.js`, `api/recipe.js`, `src/api.js`.

### Known gaps (tracked for R1)
- Model selection (ADR-09) waits for the bake-off: production still uses the legacy Groq models when `GROQ_API_KEY` is set.
- The recipe golden set ranges await expert review (D9). The rules engine meets 96% of them; R04 (time) and R08 (Kenyan medium roast at 95 °C) are flagged for that review.
- Screens are the prototype's, rewired. The redesign, PWA, guided brew and dial-in UI are R1.

## [0.1.0]

Prototype: label scan with Llama 4 Scout via Groq, AI recipe with an LLM verifier, `localStorage` journal, world map.
