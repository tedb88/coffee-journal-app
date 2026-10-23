# BrewMap — Feature & AI Solution Plan

| Field | Value |
|---|---|
| Document | Feature & AI Solution Plan |
| Version | 0.2 — Draft for Product Owner review |
| Date | 23 October 2026 |
| Product Owner | tedb88 |
| Input | [`BRD.md`](BRD.md) v0.3 (decisions D2, D4, D5, D6, D7, D11, D12 closed) |
| Scope | How releases R0 (Foundation) and R1 (Daily Driver) will be built. R2 and later are covered only where R1 design choices affect them. |
| Status | **Draft.** Decisions in §12 are needed before R0 starts. |

---

## 1. Executive Summary

**What this plan covers.** How BrewMap moves from prototype to a product people can use every day in Hong Kong. It covers the target architecture, the design of each R1 feature, the design and model selection for each AI component, the evaluation approach, the cost model, and a sequenced backlog in which every item traces to a BRD requirement ID.

**Five design choices drive the plan:**

1. **Local-first app, no accounts in R1 (D5).** All user data lives on the device in IndexedDB, with export and import. The server stores no user content. This keeps the data model simple and Hong Kong privacy (PDPO) exposure low.
2. **One brewing rules engine.** A single shared module is the source of truth for recipes, validation, the offline fallback and dial-in advice. The AI proposes bounded adjustments and code calculates every number. Recipe arithmetic errors (G7) therefore become impossible by design.
3. **Only two AI calls in R1, both on open-weight models (D7).** Label reading uses a multimodal model, and recipe personalisation uses a text call. The LLM verifier is retired in favour of deterministic validation, and dial-in advice is rules-based in R1. A repeat brew of a known bag makes **zero** AI calls.
4. **Hong Kong-eligible hosting.** Groq, which the app uses today, appears to list Greater China as a restricted region (Hong Kong unconfirmed), and several US AI providers do not serve Hong Kong. The lead option is Alibaba Cloud Model Studio's Hong Kong endpoint, serving open-weight Qwen3.5 models. Gemma 4 and Qwen3-VL are alternatives. The final choice comes from an evaluation bake-off in R0.
5. **Abuse, not usage, is the cost risk.** Expected AI cost is about **US$0.003–0.012 per monthly active user**, well below the US$0.10 target. R0 therefore puts rate limiting, bot protection and a hard monthly spend cap in place before any feature work.

**Effort (indicative, ±30%).** R0 is about 17 developer-days and R1 about 37 developer-days. At one full-time developer with AI-assisted development and 20% contingency, that is roughly **3–4 weeks for R0 and 8–9 weeks for R1**. Calendar time scales with part-time capacity.

**Decisions taken since v0.1:** a US$20 per month AI spend cap (D12) and an English UI (D11). **Still needed (§12):** expert reviewer (D9), rating scale (D10), plus confirmation of how D2 and D5 were interpreted.

---

## 2. Planning Inputs

### 2.1 Decisions applied

| Decision | Outcome | How this plan applies it |
|---|---|---|
| D2 Persona | Home brewer (P2 Home Enthusiast) | Fast repeat-brew path, editable parameters, recipe history per bag, and dial-in as a first-class feature |
| D4 Market | Hong Kong | Functions hosted in Hong Kong (`hkg1`). HK-eligible AI provider. PDPO compliance pack. Eval set weighted to labels sold in HK. Metric units, °C and day-first dates. |
| D5 Accounts | None in R1 | IndexedDB, persistent-storage request, export/import, PWA install. No user database on the server. |
| D6 Methods | V60 only in R1 | The engine is method-agnostic (templates), but R1 ships and validates only the V60 template |
| D7 AI | Open-weight models; multimodal for OCR | Model policy (§5.2), shortlist (§5.3), provider strategy (§5.4) |
| D11 Language | English | English UI, with strings kept in one catalogue. No translation work is planned. |
| D12 Spend cap | US$20 per month | Hard cap in the spend guard (§4.11), alerts at 50% and 80% |

### 2.2 Planning assumptions

| ID | Assumption |
|---|---|
| PA1 | One developer with AI-assisted development. Estimates are in ideal developer-days. |
| PA2 | The existing stack (React 18, Vite, Vercel) is kept (BRD C1). TypeScript is introduced for the new domain core and API code; UI files migrate as they are touched. |
| PA3 | The Product Owner can give about 1 day in R0 to photograph and label bags for the evaluation set, and about 0.5 day per R1 increment for review. |
| PA4 | The product is free in R1, and the free tiers of supporting services are sufficient (§7.3) |

---

## 3. Target Architecture

### 3.1 Logical view

```
┌──────────────────────────── Client: installable PWA (React + Vite) ────────────────────────────┐
│  Features:  Capture · Bean Library · Recipe · Brew Mode · Log & Taste · Journal · Map · Profile │
│                                                                                                │
│  Domain core (TypeScript, pure, shared with server)                                            │
│    rules/ (SCA baselines, origin/process/roast/freshness modifiers, method templates)          │
│    recipe/ (baseline → apply adjustments → calculate) · validate/ (check + repair)             │
│    dialin/ (decision table) · normalise/ (country ISO, enums, dates, lexicon) · schemas/ (zod)  │
│                                                                                                │
│  Data layer: IndexedDB via Dexie (beans, brews, photos, profile, settings, meta)               │
│    migrations · legacy localStorage import · export/import · persistent-storage request        │
│  Service worker (offline shell) · Screen Wake Lock · Web Audio cues                            │
└───────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                │ HTTPS (Turnstile token)
┌───────────────────────────────▼────────── Server: Vercel Functions, region hkg1 ───────────────┐
│  POST /api/scan    (AI-01)      POST /api/recipe   (AI-02)      GET /api/config (flags)        │
│  Middleware: Turnstile verify → rate limit → spend guard → size limits → schema validation     │
│  AI gateway: model registry (capability → provider, model, prompt version, prices)             │
│              OpenAI-compatible adapter · retry · failover to secondary provider                │
│              JSON-schema output → zod validation → repair-or-fallback · per-call telemetry     │
└───────┬──────────────────────────┬──────────────────────────┬─────────────────────────────────┘
        │                          │                          │
  Open-weight model provider   Upstash Redis              Sentry (errors) · Analytics
  (primary: HK endpoint;        (rate-limit windows,        (consent-gated) · Map tile
   secondary: failover)          spend counters)            provider
```

### 3.2 Architecture decisions

These will be recorded as ADRs in `docs/adr/`.

| ADR | Decision | Rationale | Alternatives rejected |
|---|---|---|---|
| ADR-01 | **Store user data on the device in IndexedDB, through Dexie** | Required by D5. Large storage quotas, binary support for photos, offline use, transactions. | `localStorage` (about 5 MB, synchronous, the cause of G4/G5). SQLite-WASM (heavier, no gain for R1). |
| ADR-02 | **Shared domain core in `src/domain/`**, imported by both client and API | One rules source (RCP-05). The server recomputes everything and never trusts client numbers. | Rules held in prompts (the cause of G6) |
| ADR-03 | **AI gateway with an OpenAI-compatible adapter.** The provider and model are set in a registry, and two providers are configured. | AIP-6 and AIP-9. Nearly all hosts of open-weight models expose this API, so changing provider is a configuration change. | Provider SDKs (lock-in) |
| ADR-04 | **Deterministic validation and repair** replace the LLM verifier | 100% guarantee (RCP-04). Removes one AI call per recipe: lower latency, lower cost. | Keeping the LLM verifier (non-deterministic and unrepaired, G7) |
| ADR-05 | **PWA through `vite-plugin-pwa` (Workbox)** | NFR-02/03. Installing the app also reduces iOS storage eviction (BRD C2). | Native wrapper (deferred, D8) |
| ADR-06 | **Abuse controls: Cloudflare Turnstile, Upstash rate limiting and a spend guard** | G3. All have free tiers and need no user accounts. | API keys per user (would need accounts) |
| ADR-07 | **Functions run in the Vercel Hong Kong region (`hkg1`)** | Latency for HK users and proximity to the HK model endpoint. Confirm the region code and plan eligibility during setup. | Default `iad1` (US East) |
| ADR-08 | **Test stack: Vitest, fast-check, Playwright and an eval harness** | NFR-11. Chromium is available for CI end-to-end tests. | — |

### 3.3 Target repository structure

```
src/
  domain/      rules/ recipe/ validate/ dialin/ normalise/ schemas/      ← shared, pure, ≥ 90% tested
  data/        db.ts  repositories/  migrations/  legacy-import.ts  export.ts
  features/    capture/ beans/ recipe/ brew/ log/ journal/ map/ profile/
  ui/          shared components, icons, i18n scaffolding
api/
  scan.ts  recipe.ts  config.ts
  _lib/        ai/ (gateway, registry, providers/, prompts/)  ratelimit.ts  spend.ts  turnstile.ts  telemetry.ts
evals/
  labels/      ground-truth JSON + image manifest (images stored privately, §6.1)
  recipes/     golden cases with expert-approved ranges
  dialin/      scenario table
  run.ts       harness → JSON results + Markdown report
docs/          BRD.md  SOLUTION_PLAN.md  adr/
```

**Retired:** `api/analyze.js` (replaced by `api/scan.ts`), `api/verify.js` (replaced by `src/domain/validate`), and the dev-mode direct provider calls and duplicated prompts in `src/api.js` (G6, G11). Dev mode will call the same `/api` functions through `vercel dev`.

---

## 4. Feature Design (R0–R1)

### 4.1 Data layer & legacy migration — BEAN-01, JRN-05, DR-03–05, NFR-10

- **Schema v1 (Dexie):** `beans`, `brews`, `photos` (blobs and thumbnails), `profile`, `settings`, and `meta` (schema version, migration log). Types are defined once in `src/domain/schemas` (zod) and used for validation, export and the API.
- **Legacy migration (BRD Appendix B):** on first launch of the new version, the app reads `brewmap_journal`, saves a raw backup to `meta.legacyBackup` and offers it as a download. Each entry is mapped to one Bean and one Brew. The migration is idempotent, keyed on `legacyId`. The old key is left untouched until the user confirms the migration.
- **No silent deletion (DR-05):** the app requests `navigator.storage.persist()` after the first saved bean. A storage meter appears in Settings. At 80% of quota the user sees a warning and is offered export or photo clean-up.
- **Photos:** stored at about 1280 px JPEG (roughly 150–250 KB) plus a 320 px thumbnail. This is separate from the size of the image sent to the API (§5.5).
- **Export and import (JRN-04):** one JSON file (schema version, beans, brews, profile, optional photos) plus a CSV of brews. Import validates against the schema and merges by id. A round-trip test proves nothing is lost.

### 4.2 Bean capture — CAP-01–04, 06, 08

- The existing image pipeline (HEIC handling, resizing, 20 MB guard) is kept. The image size sent to the API is chosen in the bake-off from 768, 1024 and 1280 px (§6.3). The current 512 px is likely too small for roast dates.
- **Review screen:** an editable form covering every CAP-02 field. Low-confidence fields are highlighted. It offers ISO country autocomplete, process, roast and variety pickers, a roast date picker, and net weight presets (100, 200, 250 g).
- Every user correction is stored as a field-level diff in `bean.extraction.userCorrected`. This feeds evaluation, with consent (DR-07).
- **Manual entry** uses the same form, empty. If a scan fails, the user lands on this form with the photo kept (CAP-08).
- *Stretch (NFR-02 queue):* scans taken offline are saved as "pending" and processed once the device is back online.

### 4.3 Bean library — BEAN-02–05

- A list and a detail view. The detail shows the photo, label data, days since roast, brew history, the best-rated recipe, the average rating and a **Brew again** button (journey J2, ≤ 3 taps).
- **Freshness (BEAN-04)** is driven by a reference table keyed by roast level, for filter brewing: *Resting*, *Peak*, *Fading*. The default windows are placeholders until the expert reviewer validates them (D9).
- **Inventory (BEAN-03):** each logged brew deducts its dose. When ≤ 1 dose remains, the app prompts the user to mark the bag Finished.

### 4.4 Recipe engine — RCP-02–09, RCP-04–06

The pipeline runs identically on client and server:

```
normalise(bean) → baseline(V60 template, origin, process, roast, freshness)
              → apply(adjustment plan: AI-02, or dial-in, or user edit)
              → clamp(method bounds) → calculate(water per pour, cumulative, timings)
              → validate + repair → RecipeSnapshot{engine, rules, prompt, model, source}
```

- **V60 method bounds** (initial, to be confirmed by D9): temperature 86–96 °C, ratio 1:13–1:18, total time 2:15–4:00, 3–6 steps, bloom water 2–3× dose.
- **Prior brews (RCP-02):** when a bag already has rated brews, the baseline starts from the best-rated recipe instead of the rules baseline.
- **User edits (RCP-07):** changing the dose or ratio re-runs `calculate` and `validate`, so an edited recipe always meets RCP-04.
- **When AI is not called:** Brew again, recipes produced by applying a dial-in suggestion, offline use, and when the spend cap has been reached. In each case the recipe comes from the engine alone.

### 4.5 Guided brew mode — BRW-01–07

- The timer is computed from `performance.now()` deltas rather than by counting `setInterval` ticks, which keeps drift within 1 s over 5 minutes.
- **Screen Wake Lock** is re-acquired on `visibilitychange`. Where it is unsupported, the user sees a notice.
- **Cues:** a Web Audio chime, plus `navigator.vibrate` on Android. iOS Safari has no Vibration API, so iOS gets audio cues only.
- **Layout:** large type and a progress ring. The current target reads "Pour to 150 g by 0:45", with a preview of the next step. Pause, resume, restart and skip are available.
- When the brew finishes, the app opens Taste & Rate with the actual time filled in (BRW-07).

### 4.6 Logging & tasting — LOG-01–05

- **One screen, ≤ 15 s:** a 1–5 rating (D10 assumed), two 5-point balance sliders (sour ↔ bitter, weak ↔ strong), optional flavour chips, and notes. Actual parameters are pre-filled from the recipe and can be edited.
- **Flavour chips** come from a lexicon of about 100 terms in three tiers, aligned to the SCA/WCR flavour wheel and shipped as reference data (AI-05).
- **Quick log (LOG-04)** uses the same screen, starting from a bag and a method.
- **Delete** is a soft delete with a 10 s undo toast; the record is purged afterwards (LOG-05).

### 4.7 Dial-in coach (rules, R1) — DIAL-01–05

The decision table follows the strength-versus-extraction logic of the brewing control chart:

| Cup feedback | Primary adjustment | Secondary |
|---|---|---|
| Sour, weak | Grind 1 step finer | +1 °C |
| Sour, strong | Grind 1 step finer | Ratio +1 (more water) |
| Sour, balanced strength | Grind 1 step finer | +1 °C |
| Bitter, strong | Grind 1 step coarser | Ratio +1 (more water) |
| Bitter, weak | Grind 1 step coarser | Ratio −1 (more coffee) |
| Bitter, balanced strength | Grind 1 step coarser | −1 °C |
| Balanced, weak | Ratio −1 (more coffee) | — |
| Balanced, strong | Ratio +1 (more water) | — |
| Balanced and rated ≥ 4 | "Lock it in": offer to save as the house recipe (RCP-08) | — |

- **History rules (DIAL-04):** a change that lowered the rating is not repeated. If two consecutive changes oscillate, the step is halved (a temperature change replaces a grind step). Any change that would push a parameter outside the method bounds is skipped and the next option used.
- The explanation text is templated, so no LLM is needed in R1. The app stores the suggestion, whether it was accepted, and the change in the next rating, which feeds the dial-in effectiveness KPI (DIAL-05).
- **R2:** an AI layer may re-rank or explain suggestions, but only within the directions this table allows (AI-04).

### 4.8 Journal — JRN-01–04

- The existing calendar and log views are adapted to Brew Sessions. A bean-centric view is added (JRN-03).
- Filters cover bag, origin, roaster, method, rating, date range and flavour.
- Export and import are described in §4.1.

### 4.9 Origins map — MAP-01, MAP-02

- The 50 hardcoded countries are replaced by ISO 3166-1 reference data with centroid coordinates for all countries, from a public-domain dataset bundled as static JSON.
- **Security fix (G12):** popups are built with DOM nodes and `textContent`. No AI or user text is interpolated into HTML.
- **Tile provider (BRD C4):** before public launch, select a provider whose free tier permits production use (candidates include MapTiler and Stadia Maps; verify their terms). The choice is recorded in an ADR.

### 4.10 Profile & onboarding — PRF-01–03, 05

- A three-screen onboarding that can be skipped: equipment, defaults and taste preferences.
- The brewer list records all brewers the user owns, for later releases, but R1 recipes are V60 only. The grinder is captured as make and model, for grinder-specific settings in R2 (PRF-04).
- Hong Kong defaults: grams, millilitres, °C, and DD/MM/YYYY.

### 4.11 Operations — OPS-01–07

| Control | Design | Initial setting |
|---|---|---|
| Bot protection | Invisible Cloudflare Turnstile token on every AI request, verified on the server | — |
| Rate limit (OPS-01) | Upstash sliding window keyed on a hash of client IP plus a random device ID; the hash expires within 24 h | Scan 10 per hour and 30 per day; recipe 30 per hour and 100 per day; global 2,000 AI calls per day |
| Spend guard (OPS-02) | Each call's cost is calculated from token usage × the registry price table and added to daily and monthly counters | Hard cap of US$20 per month (D12). Alerts at 50%, 80% and 100%. At the cap, endpoints return `fallback: true` and the app uses manual entry and the rules recipe. |
| Telemetry (AIG-03) | One structured log line per AI call: capability, model, prompt version, latency, tokens, cost, validation result, whether the fallback was used. No images, free text or identifiers. | Retained ≤ 90 days (DR-06) |
| Errors (OPS-04) | Sentry for the client and functions | Free tier |
| Analytics (OPS-03) | KPI events (§3 of the BRD) only after consent, with no personal data in payloads | Privacy-oriented tool, chosen in R1 |
| Flags (OPS-05) | Static flag file served by `/api/config` | — |
| Feedback (OPS-07) | Sentry User Feedback. The recipe snapshot and versions are attached; no personal data. | — |

---

## 5. AI Component Design

### 5.1 AI footprint in R0–R1

| Capability | R1 approach | Model calls | Latency budget (p90) |
|---|---|---|---|
| AI-01 Label Understanding | Multimodal model reads the image and returns structured JSON | 1 per scan | ≤ 6 s |
| AI-02 Recipe Personalisation | Text call returns a bounded *adjustment plan*; code builds the recipe | 1 per new recipe | ≤ 5 s |
| AI-03 Validation & Repair | **Deterministic**; the LLM verifier is retired | 0 | < 50 ms |
| AI-04 Dial-in Coach | **Deterministic** decision table (§4.7) | 0 | Instant |
| AI-05 Tasting Note Normalisation | Lexicon matching on the device. Unknown terms are batched to a small text call and cached (Should). | Occasional, batched | Asynchronous |

**Result:** the first brew of a new bag uses at most 2 AI calls. A repeat brew uses 0. Today every recipe takes 2 calls, generation plus verifier.

### 5.2 Model policy (D7)

1. **Eligible models.** Open-weight models with publicly downloadable weights, under a licence that permits commercial use. Apache 2.0 or MIT is preferred; any other licence is reviewed first (AIP-9). Hosted-only variants are excluded even within an open family; for example, Qwen's API-only "Plus", "Flash" and "Max" tiers are excluded, and only the open checkpoints are used.
2. **Multimodal model for label reading.** Label reading (AI-01) uses a vision-language model. Using the same model family for AI-02 is preferred, to reduce integration and evaluation work.
3. **Gates (pass or fail):** licence, a hosting provider that serves Hong Kong customers, structured JSON output, and acceptable data terms (no training on inputs, no retention beyond processing).
4. **Weighted scorecard** for models that pass the gates: extraction or recipe accuracy 50%, latency 20%, cost 15%, structured-output reliability 15%. The fabrication rate (AI-01: ≤ 2%) is an additional gate.

### 5.3 Candidate shortlist

The bake-off confirms the final choice.

| Candidate | Type | Licence (verify on model card) | Why shortlisted | Watch-outs |
|---|---|---|---|---|
| **Qwen3.5** (e.g. 35B-A3B MoE; 27B; 9B) | Natively multimodal (text, image, video) | Reported as Apache 2.0; sources conflict, so confirm per checkpoint | Strong lineage in Chinese and Japanese text recognition. MoE with about 3B active parameters gives low cost and latency. Offered on Alibaba Model Studio, which has a Hong Kong endpoint. | Confirm the licence and that the *open* checkpoint is served from the HK endpoint |
| **Gemma 4** (26B MoE with about 4B active; 31B dense; E4B edge) | Natively multimodal | Apache 2.0 (new with Gemma 4) | Strong all-rounder. The edge sizes open an on-device path later (offline scanning). | A hosting provider that serves HK customers must be confirmed |
| **Qwen3-VL 8B** | Vision-language | Apache 2.0 | Proven text recognition and small enough to self-host on one GPU. Low-cost fallback. | Previous generation |
| **Llama 4 Scout** (incumbent) | Multimodal MoE | Llama 4 Community Licence (more restrictive) | Today's baseline, so improvement can be measured against it | Licence terms. Groq hosting may be unavailable to HK customers. |
| *Challenger pipeline:* PaddleOCR-VL or GLM-OCR (under 1.3B) + a text LLM | Specialist OCR feeding a text model | Verify | Top open models on document-OCR benchmarks (OmniDocBench) | Built for flat documents, not curved, glossy packaging. Needs two calls. Adopt only if it clearly wins. |

**For AI-02 (text only):** the winning multimodal model, called with text only, is compared against one text-specialist model (for example gpt-oss-20b, Apache 2.0). The specialist is adopted only if it is materially better or cheaper.

### 5.4 Hosting & provider strategy

| Option | Role | Basis | To verify in R0 (week 1) |
|---|---|---|---|
| **Alibaba Cloud Model Studio — Hong Kong deployment** | **Primary (proposed)** | OpenAI-compatible endpoint at `cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1`. A workspace-dedicated domain is recommended for production. Serves Qwen3.5 models. | That the open checkpoint (not a hosted-only tier) is available in HK; JSON-schema output mode; price; data retention and training terms |
| Second open-weight host (e.g. DeepInfra, Together AI, Fireworks, OpenRouter, Hugging Face Inference Providers) | Failover, and the home for Gemma 4 if it wins | Same OpenAI-compatible adapter | **Whether its terms serve Hong Kong customers** (not yet confirmed for any of these), model availability, data terms |
| Groq (current) | Keep only until migration | Today's production path | Groq's community FAQ lists Greater China as restricted; Hong Kong's status is unconfirmed. Plan to migrate regardless. |
| Self-host (vLLM on a GPU instance in HK or Singapore) | Exit option only | Open weights allow it (AIP-9) | Not economic at R1 volumes: an always-on GPU costs hundreds of US$ a month, against single-digit dollars a month for API usage |

**Privacy position (PDPO).** Photos of packaging and brew parameters are generally not personal data, and no user identifiers are sent to the AI provider. R1 therefore puts very little personal data in cross-border processing. Processing locations are still disclosed in the Personal Information Collection Statement and the privacy policy (NFR-08).

### 5.5 Capability designs

#### AI-01 — Label Understanding (`POST /api/scan`)

1. **Client:** compress the image to the size chosen in the bake-off (about 200 KB) and send it with the Turnstile token.
2. **Server:** verify the token, check rate limit and spend, validate size and type, then call the gateway with the `scan.vN` prompt and the JSON schema.
3. **Output contract:** `fields` (every CAP-02 field, `null` when absent), `confidence` (high/medium/low per field), and `evidence` (the verbatim text read for name, roaster, origin, roast date, altitude and weight), plus `labelLanguage` and `originalName`.
4. **Code, not AI, interprets the result:** country is normalised to ISO-2, process and roast to enumerations, altitude parsed to metres, and the roast date parsed from `evidence` with Hong Kong day-first rules and a plausibility check (not in the future, not more than 365 days old). A field that lacks its evidence text is downgraded to low confidence or `null`, which is how the fabrication gate is enforced.
5. **Prompt rules:** report only what is visible; never infer origin from the brand; map to the allowed enumerations; translate to English but keep the original name.
6. **Failure handling:** a malformed response gets one repair attempt, then the user is sent to the manual form with the photo kept (CAP-08).

#### AI-02 — Recipe Personalisation (`POST /api/recipe`)

1. **Input:** the client sends bean attributes, preferences, equipment, days since roast, a summary of the last three brews, and its locally computed baseline. **The server recomputes the baseline**; it never trusts client numbers.
2. **Model output** is a small, bounded *adjustment plan* (about 300 output tokens): `tempDeltaC` (±3), `ratioDelta` (±2), `grindStepDelta` (±2), `bloomSeconds` (30–45), `pourCount` (3–6), `pourWeights[]` (fractions), `stepNames[]`, `techniqueNotes[]`, `expectedCup`, and a `rationale` of ≤ 2 sentences.
3. **Code** clamps the plan, calculates waters and timings, validates, and returns the full recipe (RCP-03). Any failure returns the baseline with `source: "fallback"` as a normal 200 response, not an error.
4. **No duplicated rules (RCP-05):** the rules section of the prompt is *generated* from the same data tables the engine uses.
5. **Sampling:** temperature 0.2–0.3.

#### AI-03 — Validation & Repair (deterministic)

- **Checks:** schema, exact water sum, strictly increasing times, final time equal to total time, method bounds, step count, text lengths.
- **Repair:** move the rounding remainder to the last pour, re-space the times, clamp out-of-range values. If the recipe is still invalid, use the baseline.
- **Proof:** property-based tests (fast-check) over at least 10,000 random inputs must always produce valid recipes. This is the R0 exit criterion "0 invalid recipes".

#### AI-05 — Tasting Note Normalisation

- Matching on the device ignores case and diacritics, and handles synonyms and plurals (for example "blackcurrant" and "cassis" → Fruity › Berry).
- Unmatched terms are queued and resolved in batches by a cheap text call. Results are cached on the device and on the server, so each unique term is resolved only once.

### 5.6 Prompt & model configuration management — OPS-06, AIG-05

- `api/_lib/ai/registry.ts` maps each capability to its provider, model, prompt version, parameters, price table and fallback provider.
- Prompts are versioned files (`prompts/scan.v1.md`, `prompts/recipe.v1.md`). The version is written to every recipe snapshot and every telemetry line.
- Any change to the registry or prompts goes through a pull request that **must pass the eval gate** (§6.4). The model choice for each capability is recorded as an ADR with the bake-off evidence.

---

## 6. Evaluation Strategy — AIG-01, AIG-02

### 6.1 Datasets

| Set | Size | Composition | Owner | Storage |
|---|---|---|---|---|
| **Labels** (AI-01) | 50 to start the bake-off; ≥ 100 by the end of R1 | Hong Kong market mix (target): English ≥ 40%, Traditional Chinese ≥ 15%, Japanese ≥ 15%, Simplified Chinese ≥ 10%, Korean and others ≥ 10%. Conditions include glare, curved bags, low light and partial views. ≥ 30% of bags show a roast date. | PO photographs bags (own bags, HK roasters, friends). Ground truth is labelled using a template. | **Images kept out of the public repository** (a private bucket or private repo), because they show third-party branding. The repository holds ground-truth JSON and image hashes only. |
| **Recipe golden set** (AI-02/03) | 50 cases | Origin × process × roast × dose × preferences × days since roast. Each case has *acceptable ranges* for temperature, ratio, grind and time rather than single answers. | Ranges drafted from SCA guidance, then reviewed by the expert (D9) | Repository |
| **Dial-in scenarios** (AI-04) | About 40 cases | Every row of the §4.7 table, plus history edge cases | Developer | Repository (unit tests) |
| **Lexicon mappings** (AI-05) | About 150 terms | Label and user phrases mapped to flavour-wheel categories | Developer, with expert spot-checks | Repository |

### 6.2 Metrics & thresholds

These are the BRD quality bars.

| Capability | Metric | Threshold |
|---|---|---|
| AI-01 | Accuracy on core fields (normalised match; fuzzy match for names) | ≥ 90% |
| AI-01 | Fabrication rate (field filled in with no supporting evidence on the label) | ≤ 2% (gate) |
| AI-01 | Roast date accuracy when printed | ≥ 85% |
| AI-01 | Schema-valid responses | ≥ 99% |
| AI-01 | p90 latency, measured from Hong Kong | ≤ 6 s |
| AI-02 | Validation pass after repair | 100% |
| AI-02 | Parameters within expert ranges | ≥ 95% |
| AI-02 | Expert score on a 20-case sample | ≥ 4 / 5 |
| AI-04 | Directional correctness | 100% |
| AI-05 | Agreement with human mapping | ≥ 90% |

### 6.3 Bake-off protocol (R0, epic E0.6)

1. Verify the gates (licence, HK provider, JSON mode, data terms) for every shortlisted candidate.
2. Run AI-01 on 3–5 candidates × 3 image sizes (768, 1024, 1280 px) over the 50-label starter set. Record accuracy per field and per language, fabrication rate, latency and cost.
3. Run AI-02 for the top two candidates over the recipe golden set.
4. Score with the §5.2 scorecard, choose a primary and a failover model, and record ADR-09 "Model selection".
5. Compare the result with the incumbent (Llama 4 Scout via Groq) to quantify the improvement.

### 6.4 Harness & CI gate

- `evals/run.ts` is a command-line tool. It takes a capability, a model and a dataset, and writes JSON results plus a Markdown report.
- **On pull requests that touch prompts or the registry:** a 20-case smoke subset runs, costing a few cents. The merge is blocked if any metric falls below its threshold.
- **Before each release:** the full suite runs, and the results are attached to the release notes.

---

## 7. Cost Model

### 7.1 Unit cost (indicative)

These figures are to be confirmed against the selected provider's price list.

| Item | Assumption |
|---|---|
| Price, open-weight MoE model of about 30B class, hosted | US$0.10–0.30 per 1M input tokens; US$0.40–1.20 per 1M output tokens |
| Scan call | About 1,800 input tokens (image plus prompt) and 350 output tokens → **US$0.0003–0.0010** |
| Recipe call | About 2,000 input tokens and 350 output tokens → **US$0.0003–0.0010** |
| Usage per active user per month | 4 new bags (scans) and 8 AI recipes |
| **AI cost per MAU per month** | **About US$0.003–0.012** (BRD target ≤ US$0.10) |

### 7.2 Monthly AI cost by scale

| MAU | Low | High |
|---|---|---|
| 50 (friends and testers) | < US$0.20 | < US$0.60 |
| 500 | US$1.50 | US$6 |
| 1,500 | US$4.50 | US$18 |

**Spend cap (D12, decided): US$20 per month (about HK$156).** That covers about 1,500 MAU of legitimate use at the high estimate while bounding the damage from abuse. Review it monthly (AIG-04).

### 7.3 Fixed costs (R1)

| Service | Tier | Note |
|---|---|---|
| Vercel | Hobby (free) | Hobby is limited to non-commercial use. Move to Pro (about US$20 per month) if the product is monetised (D3). |
| Upstash Redis | Free | Rate-limit windows and spend counters only |
| Cloudflare Turnstile | Free | — |
| Sentry | Free developer tier | — |
| Analytics | Free tier | Chosen in R1 for privacy posture |
| Map tiles | Free tier | Terms verified in R1 (§4.9) |

---

## 8. Delivery Plan

### 8.1 Milestones

| Milestone | Content | Effort | Indicative duration (full-time, with 20% contingency) |
|---|---|---|---|
| **R0 — Foundation** | Safety, integrity, data model, AI gateway, bake-off | about 17 dev-days | 3–4 weeks |
| R1 Increment 1 | Capture & Library | about 10 dev-days | 2 weeks |
| R1 Increment 2 | Recipe & Guided Brew | about 10 dev-days | 2 weeks |
| — *Internal dogfood cut* | *Scan → edit → recipe → guided brew works end to end* | — | — |
| R1 Increment 3 | Log, Dial-in & Journal | about 9 dev-days | 2 weeks |
| R1 Increment 4 | Map, PWA, Ops & launch readiness | about 8 dev-days | 2 weeks |
| **R1 — Daily Driver launch** | All BRD R1 exit criteria met | — | about 12–13 weeks after R0 starts |

### 8.2 R0 — Foundation backlog

| Epic | Stories (summary) | Requirements | Est. (days) | Depends on |
|---|---|---|---|---|
| **E0.1 Engineering baseline** | Add TypeScript to new code; ESLint and Prettier; Vitest and Playwright; GitHub Actions CI (lint, type check, test, build, dependency audit). Remove unused dependencies (`@anthropic-ai/sdk`, `puppeteer`). Fix `.claude/launch.json`. Refresh the README. | NFR-11, G9, G14 | 2 | — |
| **E0.2 Domain core & recipe integrity** | Move the rules tables into `src/domain/rules` (one source). Build the calculator and the validator with deterministic repair. Property-based tests. Fallback recipe equals the baseline. Retire `api/verify.js` and the dev-mode direct calls. | RCP-04, RCP-05, RCP-06, AI-03, G6, G7, G11 | 4 | E0.1 |
| **E0.3 Abuse & spend protection** | Turnstile. Upstash rate limits. Spend guard with cap and alerts. Payload limits. Functions moved to region `hkg1`. | OPS-01, OPS-02, NFR-06, NFR-07, G3 | 3 | E0.1 |
| **E0.4 Local data model & migration** | Dexie schema v1 and repositories. Legacy migration with backup. Persistent-storage request. Silent deletion removed. Photos moved to blobs. | BEAN-01, JRN-05, DR-03–05, G4, G5 | 3 | E0.1 |
| **E0.5 AI gateway & provider migration** | OpenAI-compatible adapter. Registry and prompt files. Basic telemetry. Provider accounts. **Verify HK eligibility and data terms (gate).** Failover. | AIP-6, AIP-9, OPS-06, AIG-03, C5, R9 | 2 | E0.3 |
| **E0.6 Eval foundation & bake-off** | Label set (PO: 50 photos plus ground truth). Harness. Recipe golden set draft. Run the bake-off. ADR-09 model selection. Switch production to the chosen model. | AIG-01, AIG-05, D7 | 3 (+1 PO) | E0.2, E0.5 |

**Sequence:** E0.1 → E0.2, E0.3 and E0.4 in parallel → E0.5 → E0.6. *The PO starts photographing bags on day 1.*

**R0 exit criteria (BRD §13):** no AI endpoint is reachable without limits; 0 invalid recipes on the golden set and in property tests; legacy migration passes tests on real exported journals; CI is green; model selection is recorded.

### 8.3 R1 — Daily Driver backlog

| Increment | Epics & stories (summary) | Requirements | Est. (days) |
|---|---|---|---|
| **1. Capture & Library** | New `/api/scan` contract (fields, confidence, evidence). Editable review form with confidence highlighting. Manual entry. Failure path. Bean library list, filters and detail. Inventory. Freshness. Profile and onboarding. Units. | CAP-01–04, 06, 08 · BEAN-02–05 · PRF-01–03, 05 · AI-01 | 10 |
| **2. Recipe & Guided Brew** | `/api/recipe` adjustment-plan flow. Recipe screen with rationale and editable parameters. House recipes. Snapshot versioning. Guided brew mode (timer, wake lock, cues, pause and skip, offline). | RCP-02, 03, 07, 08, 09 · BRW-01–07 · AI-02 | 10 |
| **3. Log, Dial-in & Journal** | Taste & Rate screen. Quick log. Edit, delete and undo. Dial-in decision table with apply-to-next-brew and outcome tracking. Journal adapted to brews, with bean view and filters. Export and import. On-device lexicon. | LOG-01–05 · DIAL-01–05 · JRN-01–04 · AI-04 (rules) · AI-05 | 9 |
| **4. Map, PWA, Ops & launch** | ISO country data and safe popups. Tile provider. PWA manifest, service worker and install prompt. Offline checks. Consent banner and analytics. Sentry. Flags. Feedback. KPI dashboard. CI eval gate. **PDPO pack** (privacy policy, Personal Information Collection Statement, consent records). Usability test (n ≥ 5). Full eval run. | MAP-01, 02 · NFR-01–05, 08, 12, 13, 15 · OPS-03–05, 07 · AIG-02, 04 | 8 |

### 8.4 Definition of Done (every story)

- The pull request names the requirement IDs it implements (BRD §15).
- Unit tests are written. Journeys J1–J4 are covered by Playwright end-to-end tests on a mobile viewport.
- The axe accessibility check passes, and the feature works offline where the BRD requires it.
- Prompt or registry changes pass the eval gate.
- No user or AI text is rendered as HTML.
- Documentation and ADRs are updated.

---

## 9. Test & Quality Strategy

| Layer | Tooling | Coverage / gate |
|---|---|---|
| Domain core | Vitest + fast-check property tests | ≥ 90% line coverage; at least 10,000 property cases for the calculator and validator |
| Data layer | Vitest with `fake-indexeddb` | Migration, export → import round-trip, quota handling |
| API functions | Vitest with mocked provider | Limits, spend cap, fallback paths, schema rejection |
| End to end | Playwright (Chromium, mobile viewport) | J1 first brew, J2 repeat brew, J3 dial-in, J4 quick log, offline brew |
| AI quality | `evals/run.ts` | §6.2 thresholds; CI smoke set on every prompt change |
| Performance | Lighthouse CI | Mobile LCP ≤ 2.5 s (NFR-01) |
| Devices | Manual smoke test each release | iPhone Safari (browser and installed PWA), Android Chrome |

---

## 10. Hong Kong Compliance & Localisation

### 10.1 PDPO mapping (NFR-08)

| Data Protection Principle | How R1 complies |
|---|---|
| DPP1 Collection | Personal Information Collection Statement at first use: purposes, data types, AI and analytics processing (including outside Hong Kong), user rights. Only what is needed is collected. |
| DPP2 Accuracy & retention | User data stays on the device until the user deletes it. Server telemetry is kept ≤ 90 days, and IP hashes ≤ 24 h. |
| DPP3 Use | Separate opt-in consent for analytics and for using corrections and ratings to improve AI (DR-07) |
| DPP4 Security | No secrets in the client. TLS only. No user content stored on the server. Dependency scanning in CI. |
| DPP5 Openness | A public privacy policy page |
| DPP6 Access & correction | R1 data is on the device, so in-app view, edit and export satisfy access requests. Any server-side request is answered within 40 days. |

AI use is documented against the PCPD *Artificial Intelligence: Model Personal Data Protection Framework*. R1's AI processes no personal data, so it is classed as low risk.

### 10.2 Localisation

- **UI language:** English (D11). UI strings are kept in one catalogue, which costs little and keeps a later translation possible.
- **Defaults:** metric units, °C, DD/MM/YYYY display, and day-first parsing of ambiguous label dates.
- **Evaluation:** the label set is weighted to the bags sold in Hong Kong (§6.1).

---

## 11. Plan Risks

| ID | Risk | Mitigation |
|---|---|---|
| PR1 | Groq is unavailable to HK customers before migration completes | Migrate in R0 (E0.5). Keep the rules fallback and manual entry so the app still works if AI is cut off. |
| PR2 | The HK endpoint lacks the chosen open checkpoint or JSON-schema mode | Fall back to JSON mode with zod repair. Use the second provider. Qwen3-VL 8B is a self-hostable last resort. |
| PR3 | The label set is delayed (depends on the PO) | Start on day 1 and begin the bake-off at 50 photos. A photo and labelling checklist is provided in `evals/labels/README.md`. |
| PR4 | No expert reviewer is available (D9) | Draft the ranges from published SCA guidance. Label recipes "beta" until reviewed. |
| PR5 | iOS PWA limits (no vibration, wake-lock quirks, storage eviction) | Audio cues, install prompt, export reminders, persistent-storage request |
| PR6 | Part-time capacity stretches the timeline | Treat R0 plus Increments 1–2 as a usable internal cut. Increments 3–4 can ship separately. |
| PR7 | Vercel Hobby terms if the product is monetised | Upgrade to Pro when D3 is decided |

---

## 12. Decisions Needed from the Product Owner

| ID | Decision | Recommendation |
|---|---|---|
| D10 | Rating scale | 1–5 plus two balance sliders (this plan assumes it) |
| D9 | Expert reviewer | One HK barista or Q Grader, about half a day, to review the recipe golden set and freshness windows |
| — | **Confirm interpretations** | D2 "home brewer" taken as **P2 Home Enthusiast**. D5 "without" taken as **R1 without accounts, with accounts reconsidered at the R1 review**. |
| — | **Actions (not decisions)** | Open an Alibaba Cloud account (Hong Kong workspace) and a Cloudflare account. Start photographing bags for the eval set. |

---

## 13. Next Steps (first two weeks)

| When | Product Owner | Developer |
|---|---|---|
| Week 1 | Confirm §12. Open provider accounts. Photograph 50 bags and fill in the ground-truth template. | E0.1 engineering baseline, then E0.2–E0.4 in parallel |
| Week 2 | Review the bake-off results and approve ADR-09 | E0.5 gateway and provider verification, E0.6 bake-off |
| End of R0 | R0 review against the exit criteria; approve R1 start | — |

---

## References

The model and provider facts in §5.3–5.4 come from these sources and must be re-verified during E0.5 and E0.6:

- Alibaba Cloud Model Studio, regions and base URLs (Hong Kong endpoint): https://www.alibabacloud.com/help/en/model-studio/regions.md · https://www.alibabacloud.com/help/model-studio/base-url
- Alibaba Cloud Model Studio, Qwen3.5 model pages: https://help.aliyun.com/en/model-studio/qwen3-5-35b-a3b · https://help.aliyun.com/en/model-studio/qwen3-5-122b-a10b
- Qwen3.5 collection on Hugging Face: https://huggingface.co/collections/Qwen/qwen35
- Gemma 4 under Apache 2.0: https://the-decoder.com/googles-gemma-4-is-now-available-with-apache-2-0-licensing-for-the-first-time/ · https://simonwillison.net/2026/Apr/2/gemma-4/
- Open-source OCR and VLM benchmark overviews: https://roboflow.com/blog/best-open-source-ocr-models · https://www.bentoml.com/blog/multimodal-ai-a-guide-to-open-source-vision-language-models
- GroqCloud geographic regions (community FAQ): https://community.groq.com/t/what-geographic-regions-does-groqcloud-serve/833
- Vercel function regions: https://vercel.com/docs/functions/configuring-functions/region
