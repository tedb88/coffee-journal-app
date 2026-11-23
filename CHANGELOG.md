# Changelog

All notable changes. Versions follow [Semantic Versioning](https://semver.org/).

## [0.3.3] — 2026-11-23 · Nothing spills off the bag page

### Fixed
- The bag page's next brew put a grind word ("Medium-fine", "Medium-coarse") in a quarter-width column. The word ran past the card and made the page slide sideways under a finger. Grind now has its own row, as on the recipe. On a 360 px phone, "20 clicks" also no longer pokes out of its column.
- Figures that do not fit now wrap inside their column instead of spilling out, and a number never splits from its unit.

### Changed
- `e2e/layout.spec.ts` now measures text in the app's own font (Manrope, from `@fontsource/manrope`, test only), checks every scroller for sideways movement and every card and figure for content that spills out, and covers a bag brewed once with no grind clicks in light and dark mode. Version 0.3.2's test missed this because it ignored overflow inside scrollers and measured text in a narrower fallback font.

## [0.3.2] — 2026-11-23 · A screen that stays still

### Fixed
- On phones, the whole page could be dragged: it bounced when dragged on the top bar or bottom navigation, and slid with the bars when a list was pulled past its end. The page is now fixed to the screen and only each screen's content scrolls (UX design 0.2, NFR-04).
- On iPhones with a home indicator, the bottom navigation, the pinned buttons, the brew controls and the Undo toast now sit above it (safe areas).

### Added
- `e2e/layout.spec.ts`: every screen at 360, 375, 393 and 430 px must have nothing wider than the screen, nothing cut off, and a page that does not move or bounce. It runs with `npm run e2e` and in CI.

## [0.3.1] — 2026-11-23 · Free label reading

### Fixed
- Label reading no longer fails when the model quotes list fields (tasting notes, varieties) as lists in its evidence. That evidence is dropped instead, which can only send a field to the fabrication gate (AI-01).
- Fields the label does not print are no longer flagged "Check it" because the model sent a confidence for them (CAP-04).

### Changed
- ADR-09 records the interim AI set-up: Cloudflare Workers AI's free plan with Mistral Small 3.1, chosen after testing five free models. Groq's models are retired, so `.env.example` now switches the legacy Groq provider off.

### Known gaps
- On Chinese and Japanese labels the interim model reads only part of the label and does not translate it; the user corrects the form. Scans take about 10 s. The bake-off (ADR-09) still decides the long-term model.

## [0.3.0] — 2026-11-15 · The redesigned key journey (R1, first cut)

Built from the UX design note v0.1 and the BrewMap design system, on top of R0.

### Added
- **New screens**, in BrewMap's own design system (Manrope, neutral paper, one water-blue data colour, dark brew mode): Today, Scan a bag, Check the label, V60 recipe, Guided brew, Taste, the bag page, Beans, Journal and Map, with a four-tab bottom navigation.
- **Today** answers "what should I brew this morning?": the bag at its best, with its next recipe (journeys J1, J2).
- **Check the label** edits every field, flags unsure ones with the reason and a "That's right" confirmation, offers bag weight presets, and doubles as manual entry and bag editing (CAP-03, CAP-04, CAP-06, CAP-08, LOG-05).
- **Recipe** with a dose stepper that recalculates the whole recipe, the pour chart, steps with cumulative targets, and why (RCP-03, RCP-07). Labelled "Standard recipe" when AI is not used (RCP-06).
- **Guided brew**: measured timer (no drift), what to pour to and by when, pause, resume, skip, restart, screen wake lock with a fallback notice, sound and vibration cues that can be turned off, then Taste with the actual time (BRW-01 to BRW-07).
- **Taste** in one screen: rating, sour–bitter and weak–strong scales, flavour chips, grind setting, notes, and a live "Next time" change (LOG-01 to LOG-03, DIAL-01, DIAL-02). Manual log without the timer (LOG-04) and brew editing.
- **Bag page**: next brew with the one change marked, dialling-in history with whether each change helped, freshness window, what is left in the bag with a finish prompt, label facts, edit and delete (BEAN-02 to BEAN-04, DIAL-03 to DIAL-05).
- **Beans** library with status filter, search and sorting (BEAN-05). **Journal** list and calendar, search, rating filter, export (JSON, CSV) and import (JRN-01, JRN-02, JRN-04). **Map** from bags, with an origins list (MAP-01, MAP-02).
- Delete with confirmation and a 10-second Undo for bags and brews (LOG-05).
- Domain: freshness windows by roast level, the guided-brew timeline, next-brew planning from a bag's history, dial-in outcome tracking, bag statistics, a first flavour lexicon. The dial-in coach now keeps every change inside the V60 range.
- Data: schema v2 (brew time, the suggestion shown, and the brew it was applied from) with an upgrade for existing data. A bag is saved before its first brew; deleting a brew keeps the bag and returns the dose.
- ADR-10 (app shell).

### Changed
- The flow no longer ends at a recipe: recipe → brew → taste → next brew. The old "Customize" taste step is gone until preferences move to the profile (PRF-02).

### Removed
- The prototype screens (`src/components`, `App.jsx`) and their styles.

### Known gaps
- Not built yet: onboarding and profile (PRF-01 to PRF-03, PRF-05), units, the installable app (ADR-05), the full flavour lexicon (AI-05), the strings catalogue (NFR-13), house recipes (RCP-08), offline scan queue.
- Design proposals still waiting for the Product Owner (UX design §5): UX-1 grinder estimates (the app only uses clicks the user types), UX-2, UX-3 expected scale reading (not shown), UX-4 freshness windows (placeholders), UX-5 navigation.
- Production AI stays off until Turnstile and Upstash are configured (ADR-06); the app then works with manual entry and standard recipes.

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
