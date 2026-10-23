# BrewMap — Business Requirements Document

| Field | Value |
|---|---|
| Product | BrewMap (working name — see decision D1) |
| Document | Business Requirements Document (BRD) |
| Version | 0.2 — Draft for Product Owner review |
| Date | 23 October 2026 |
| Product Owner | tedb88 |
| Baseline reviewed | Repository `tedb88/coffee-journal-app` at commit `e74d951` |
| Status | **Draft.** Decisions D2, D4, D5, D6 and D7 are closed (§14.1). Solution design is in [`SOLUTION_PLAN.md`](SOLUTION_PLAN.md). |

**Change log**

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-23 | Initial draft, derived from current-state review of the prototype |
| 0.2 | 2026-10-23 | Closed D2 (Home Enthusiast persona), D4 (Hong Kong), D5 (no accounts in R1), D6 (V60 only in R1) and D7 (open-weight models; multimodal model for label reading). Applied their effects to scope, RCP-01, AI principles (new AIP-9), AI-01, NFR-08, NFR-13, constraints, risks and phasing. Added open decisions D11 (UI language) and D12 (AI spend cap). |

---

## 1. Executive Summary

**Situation.** BrewMap is a working mobile web prototype. A user photographs a coffee bag, a vision model reads the label, a language model generates a V60 pour-over recipe, and the result is saved to an on-device journal and plotted on a world map. It was built iteratively without written requirements.

**Complication.** The prototype proves the "scan → recipe" moment but does not yet support repeated, everyday use. Three structural gaps stand out:

1. **It models a scan, not a brew.** Each journal entry is one bag plus one AI recipe. The app records nothing about what the user actually brewed, how it tasted, or what to change next. A brew journal gets its value from those records, and they are what an AI would need to learn the user's preferences.
2. **It is not production-safe.** The public AI endpoints have no rate limiting, so anyone can spend the owner's AI quota. Journal entries can be silently deleted when browser storage fills. Recipe rules exist in four copies that no longer agree.
3. **It has no definition of success.** Without objectives or metrics, changes cannot be prioritised or evaluated, which is why development has drifted toward UI iteration.

**Resolution.** Rebuild the product around one core loop: **Capture bean → Brew with guidance → Taste & rate → Get a better next brew.** Use AI only where it measurably improves that loop (label extraction, recipe personalisation, dial-in coaching, palate learning), and use deterministic code for anything that must be exact (quantities, timings, safe ranges).

This BRD sets the objectives, users, scope, functional, AI, data and non-functional requirements, and a proposed release phasing. It is the baseline for the next deliverable: the **Feature & AI Solution Plan**.

**Decisions taken (v0.2, §14.1).** The primary user is the home enthusiast brewer. The launch market is Hong Kong. R1 launches without accounts. R1 supports V60 only. AI uses open-weight (open-source) models only, with a multimodal model for reading labels. Still open: D1, D3, D8–D12 (§14.2).

---

## 2. Current State Assessment

### 2.1 Capability inventory (as built)

| Capability | What it does today | Implementation | Assessment |
|---|---|---|---|
| Label scan | Camera or photo upload, resized to 512 px. Vision model extracts name, origin, region, roast, process, tasting notes, variety, altitude and label language, and translates the output to English. | `src/components/LabelScanner.jsx`, `api/analyze.js` (Groq, Llama 4 Scout) | Works. Fields cannot be edited. No confidence signal. Roast date, roaster and bag weight are not captured. |
| Dose selection | Presets and custom grams | `ConfirmCard` | Works |
| Flavour customisation | Taste, body and acidity preferences | `FlavorCard` | Works. Preferences are not remembered between sessions. |
| Recipe generation | LLM recipe (Llama 3.3 70B) following SCA, origin, process and roast rules. An LLM verifier and local checks run after it, and a rule-based fallback runs if it fails. | `api/recipe.js`, `api/verify.js`, `generateBrewGuide()` | Works for V60 only. Arithmetic is checked but not enforced (G7). |
| Journal | Saves automatically once the recipe is generated. Calendar and log views, search, delete. | `src/components/BrewJournal.jsx`, `localStorage` | Works. No edit, rating or export. |
| Origins map | Leaflet pins by country, with a popup | `src/components/WorldMap.jsx` | Works. 50 hardcoded countries, country level only. |
| Hosting | Vite single-page app with Vercel serverless functions | `vercel.json` | Works |

### 2.2 Strengths to retain

- **A clear guided flow.** The four steps (Scan → Confirm → Customize → Brew) are easy to follow and work well on mobile.
- **Multilingual label reading** with English normalisation, which matters for imported and non-English bags.
- **The right AI pattern, already started.** Rule tables, LLM generation, a verifier and an offline fallback are all in place. The pattern needs consolidation, not replacement.
- **A server-side proxy** keeps the production API key out of the client. A test build confirmed the key is absent from the production bundle.

### 2.3 Gaps and risks

| # | Area | Finding | Evidence | Impact | Severity |
|---|---|---|---|---|---|
| G1 | Product | A journal entry is a scan plus a generated recipe. There is no brew session, actual parameters, rating or taste outcome. | `saveToJournal()` in `LabelScanner.jsx` | The app cannot help users improve or learn their preferences, so users have little reason to return | **High** |
| G2 | Product | Extracted label fields cannot be corrected before the recipe is generated | `ConfirmCard`: only the dose inputs are editable | AI misreads carry into the recipe and the journal | **High** |
| G3 | Security / cost | `/api/analyze` and `/api/recipe` are public, with no rate limiting, authentication or bot protection | `api/analyze.js`, `api/recipe.js` | Anyone can consume the owner's AI quota and spend | **High** |
| G4 | Data | When storage is full, the 5 oldest entries are deleted without telling the user | `saveToJournal()` quota fallback | Irreversible loss of user data | **High** |
| G5 | Data | Photos are stored as base64 in `localStorage`, which has a cap of about 5 MB. There is no backup, export or sync. | `saveToJournal()` | The journal is capped at a few dozen entries, and data is lost when the browser is cleared or the device changes | **High** |
| G6 | AI | Brewing rules exist in four copies that no longer agree. For example, the client fallback applies a ratio shift for process that the server prompt does not. | `src/api.js`, `api/recipe.js`, `generateBrewGuide()`, `coffee-brew-app/.claude/skills/brew-guide-generator.md` | Dev, production and fallback produce different recipes, and every rule change must be made in four places | Medium |
| G7 | AI | The verifier detects arithmetic and timing errors but does not fix them. A failing recipe is still returned when the LLM offers no correction, and LLM corrections are merged without being re-checked. | Merge logic in `api/recipe.js`, `api/verify.js` | Users can receive water totals that do not add up | Medium |
| G8 | AI | There is no evaluation dataset or quality metric for extraction or recipes | — | Prompt or model changes cannot be tested, so regressions go unnoticed | Medium |
| G9 | Engineering | No tests, lint, type checking, CI, error tracking or product analytics | `package.json` | Changes are risky and usage is not measured | Medium |
| G10 | Scope | Single brew method (V60) and no equipment profile | Recipe prompts | AeroPress, Chemex and French press users are excluded, and grind advice stays generic ("Medium") | Medium |
| G11 | Security | Dev mode calls the AI provider directly from the browser using a `VITE_` key, and the dev server is exposed on the local network (`host: true`) | `src/api.js`, `vite.config.js` | The key is visible to anyone on the LAN during development. Dev and production also follow different code paths. | Low |
| G12 | Security | Map popups are built by interpolating AI-extracted strings into HTML | `popupHtml` in `WorldMap.jsx` | A crafted label could inject script (self-XSS) | Low |
| G13 | Map | Country coordinates are hardcoded (50 countries). Regions are not mapped. The OpenStreetMap tile server is used directly. | `COUNTRY_COORDS` | Some origins cannot be mapped. OpenStreetMap's tile usage policy does not permit heavy production use. | Low |
| G14 | Housekeeping | Unused dependencies (`@anthropic-ai/sdk`, `puppeteer`). A developer-specific absolute path in `.claude/launch.json`. The README is out of date (privacy statement, tech stack). | — | Slower installs and misleading documentation | Low |

---

## 3. Business Objectives & Success Metrics

**Product vision.** *Every bag, brewed better.* BrewMap helps home brewers get a great cup from any bag on the first try, and a better one each time after.

| ID | Business objective |
|---|---|
| BO1 | Deliver a great first cup from any bag, quickly |
| BO2 | Make users measurably better brewers over time |
| BO3 | Become the daily brewing companion, so the app becomes a habit |
| BO4 | Build a personal coffee record that users value and own |
| BO5 | Operate safely and economically, with no data loss and AI cost under control |

| KPI | Definition | Objective | Baseline | Target (90 days after R1) |
|---|---|---|---|---|
| **North Star: Weekly Rated Brews per WAU** | Brew sessions logged with a rating ÷ weekly active users | BO2, BO3 | Not measured | ≥ 3 |
| Activation rate | % of new users who complete a first *rated* brew within 48 h of their first scan | BO1, BO3 | Not measured | ≥ 40% |
| Scan accuracy | % of core fields (name, origin, process, roast level) that are correct without user edit | BO1 | Not measured | ≥ 90% on the eval set; ≤ 25% of production scans need an edit |
| First-brew satisfaction | Average rating of the first brew of a new bag made with a generated recipe | BO1 | Not measured | ≥ 3.8 / 5 |
| Dial-in effectiveness | % of brews made after applying a suggestion that are rated higher than the previous brew | BO2 | Not measured | ≥ 60% |
| D30 retention | % of a signup cohort active on day 30 | BO3 | Not measured | ≥ 20% |
| Scan-to-recipe latency | p90 time from "Analyse" to recipe displayed | BO1 | Not measured (client timeout is 35 s) | ≤ 10 s |
| AI unit cost | Monthly AI spend ÷ monthly active users | BO5 | Not measured | ≤ US$0.10 per MAU per month, within the monthly cap (D12) |
| Data integrity | User records lost because of app behaviour | BO4, BO5 | Possible today (G4) | 0 |

*These targets are initial hypotheses. They will be recalibrated after four weeks of baseline data from R1.*

---

## 4. Scope

### 4.1 In scope (releases R0–R2)

- A mobile-first web app, installable as a Progressive Web App (PWA), for individual home brewers
- Bean capture by label scan or manual entry, and a bean library with inventory and freshness tracking
- Recipe generation for manual brew methods. **R1 supports V60 only (D6).** AeroPress and French press follow in R2, then Chemex and Kalita Wave.
- Guided brew timer, brew logging, tasting feedback and a dial-in coach
- Journal, origins map and personal insights
- Optional account with cloud backup and multi-device sync (R2)
- The AI capabilities defined in §8, with their evaluation, cost and safety controls

### 4.2 Out of scope (this horizon)

| Item | Rationale | Revisit |
|---|---|---|
| Espresso and milk drinks | A different extraction domain (pressure, yield, shot time) that depends heavily on equipment | After R2, based on demand |
| Native iOS and Android apps | A PWA reaches both platforms with one codebase | If PWA limitations block KPIs (D8) |
| Bean purchasing / e-commerce | Not part of the core loop. Monetisation is undecided (D3). | R3 |
| Social feed and following | Low value until a critical mass of users exists | R3+ |
| Bluetooth smart-scale integration | High effort and low reach | R3 (listed as BRW-08) |
| Café / roaster (B2B) workflows | Different users and buyers | Separate business case |

---

## 5. Stakeholders & Target Users

### 5.1 Stakeholders

| Stakeholder | Interest | Role |
|---|---|---|
| Product Owner (tedb88) | Product direction, cost, quality | Approves scope, priorities and releases |
| Developer(s) / AI-assisted development | A clear, testable specification | Build, test, operate |
| End users | Better coffee, a record they own, fast use | Validate through usability tests and KPIs |
| Coffee expert reviewer (to be identified, D9) | Recipe correctness | Reviews the recipe golden set |
| Third-party providers (AI, hosting, map tiles, auth) | Fair use, terms compliance | Supply dependencies |

### 5.2 Personas

| | **P1 — Curious Starter** | **P2 — Home Enthusiast** (primary — D2) | **P3 — Origin Explorer** |
|---|---|---|---|
| Profile | Owns one brewer (V60 or AeroPress) and buys specialty beans occasionally | Owns several brewers, a burr grinder and a scale. Buys 2–4 bags a month from different roasters. | Driven by variety, often travels, collects bags |
| Today | Follows a generic YouTube recipe, unsure whether the cup is "right" | Keeps notes in a notes app or spreadsheet and dials in each bag by trial and error | Relies on memory and photos, with no structured record |
| Needs | A simple recipe, a guided timer, plain-language fixes | Fast logging, grinder-specific settings, recipe history per bag, what changed and why | A record of every coffee, a map of origins, palate insights, what to try next |
| Success | A good cup on the first attempt | Dialled in within 2–3 brews, and the best recipe stored against the bag | A rich personal record, and discovering what they like |

**Decision (D2, closed):** P2, the home enthusiast brewer, is the primary persona, because P2 has the highest brew frequency and produces the most useful data. Defaults and guidance must still let P1 succeed without expertise.

### 5.3 Jobs to be done

1. *When I open a new bag,* I want a recipe tuned to this bean and my gear, *so I get a good cup without wasting beans.*
2. *When my cup tastes off,* I want to know exactly what to change, *so the next one is better.*
3. *When I find a great recipe,* I want it saved against the bag, *so I can repeat it.*
4. *When I look back,* I want to see what I have tried and liked, *so I choose my next bag better.*

---

## 6. Core Journey & Experience Principles

### 6.1 Core loop

```
  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
  │ 1. Capture │──▶│ 2. Recipe  │──▶│ 3. Guided  │──▶│ 4. Taste & │──▶│ 5. Dial-in │
  │    bean    │   │            │   │    brew    │   │    rate    │   │ suggestion │
  └────────────┘   └─────▲──────┘   └────────────┘   └─────┬──────┘   └─────┬──────┘
                         └──────────── next brew of same bag ◀───────────────┘
                                                           │
                                                ┌──────────▼──────────┐
                                                │ 6. Reflect: journal,│
                                                │   map, insights     │
                                                └─────────────────────┘
```

### 6.2 Key journeys

| ID | Journey | Target experience |
|---|---|---|
| J1 | **First brew of a new bag:** scan → review and edit fields → choose brewer and dose (defaulted from the profile) → recipe with rationale → guided brew → rate | Completed without help in ≤ 3 min, excluding brew time |
| J2 | **Repeat brew:** open the bag → "Brew again" with the best recipe or the suggested adjustment → guided brew → rate | ≤ 3 taps to start brewing |
| J3 | **Dial-in:** after rating, report "too sour / bitter / weak / strong" → get one primary change with the reason → apply it to the next brew | Suggestion appears in ≤ 3 s |
| J4 | **Quick log:** record a brew made outside guided mode | ≤ 30 s |
| J5 | **Reflect:** journal calendar and list, bag detail with brew history, origins map, palate profile | — |
| J6 | **Onboarding:** set equipment and taste preferences, or skip | ≤ 60 s |
| J7 | **Data portability:** export all data, import a backup, migrate the existing journal | No loss of data |

### 6.3 Experience principles

1. **Built for brewing.** Brew mode works one-handed with wet hands: large targets, high contrast, and a screen that stays awake.
2. **Explain, don't just prescribe.** Every AI recommendation carries a short "why".
3. **The user stays in control.** AI outputs are editable and are never applied silently.
4. **Fast path first.** Defaults come from the profile and the last brew, and advanced fields stay collapsed.
5. **Never lose data.** Storage pressure triggers a warning and an export option, never a silent deletion.

---

## 7. Functional Requirements

**Priority (MoSCoW):** M = Must, S = Should, C = Could. **Release:** R0 Foundation · R1 Daily Driver (MVP) · R2 Personal & Synced · R3 Explore. Release phasing is a proposal (§13).

### 7.1 Profile & Onboarding (PRF)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| PRF-01 | The user can record their equipment: brewers, grinder (make and model), kettle (gooseneck or not, temperature control or not) and scale (yes or no) | S | R1 | Profile persists. Recipe defaults use the profile's brewer. The step can be skipped. |
| PRF-02 | The user can set a default dose or cup count and default taste preferences (taste, body, acidity) | S | R1 | Defaults pre-fill the recipe flow and can be overridden per brew |
| PRF-03 | The user can choose units: g/oz, ml/fl oz, °C/°F | S | R1 | All displays convert. Storage stays canonical (DR-02). |
| PRF-04 | Grinder-specific grind guidance: show the standard descriptor plus an estimated setting for the user's grinder where reference data exists | S | R2 | Shows "≈ 24 clicks (Comandante C40)" labelled as an estimate. Falls back to the descriptor only when no reference data exists. |
| PRF-05 | Onboarding takes ≤ 60 s, can be skipped, and can be edited later | S | R1 | Usability test with n ≥ 5 |

### 7.2 Bean Capture (CAP)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| CAP-01 | Scan a label from the camera or photo library (JPEG, PNG, HEIC, WebP) with client-side compression | M | R1 | Existing behaviour retained. Files over 20 MB are rejected with a message. |
| CAP-02 | Extract: name, roaster, origin country, region, farm/producer, varieties, process, roast level, altitude, tasting notes, **roast date**, **net weight**, label language | M | R1 | Fields not on the label are returned empty, never invented (see AI-01) |
| CAP-03 | Every extracted field can be edited before saving. Corrected fields are recorded as user corrections. | M | R1 | The recipe uses the edited values. Corrections are logged for evaluation (with consent, DR-07). |
| CAP-04 | Low-confidence or missing key fields are flagged visually with a prompt to verify | S | R1 | Fields below the confidence threshold are highlighted |
| CAP-05 | Multiple photos per bag (front and back) | S | R2 | The extraction merges results from all photos |
| CAP-06 | Manual entry without a photo, with autocomplete for country, process, roast level and variety | M | R1 | A bag can be created in ≤ 45 s |
| CAP-07 | Duplicate detection: when a scan matches an existing bag (same roaster and name), offer to open it or add a new batch | S | R2 | Offered whenever the match confidence threshold is met |
| CAP-08 | Graceful failure: if extraction fails, the user can retry or continue to manual entry with the photo kept | M | R1 | No dead ends. The error message states the next action. |

### 7.3 Bean Library (BEAN)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| BEAN-01 | Each bag is stored as a **Bean** record, separate from brews. One Bean has many Brews. | M | R0 | Data model implemented. Legacy entries migrated (JRN-05). |
| BEAN-02 | The bean detail shows label data, photo, days since roast, brew history, best-rated recipe and average rating | M | R1 | — |
| BEAN-03 | Inventory: starting weight, automatic deduction of the dose for each logged brew, manual adjustment. Status: Active, Finished or Archived. | S | R1 | Remaining weight never goes below 0. The user is prompted to mark the bag Finished at ≤ 1 dose remaining. |
| BEAN-04 | Freshness indicator from the roast date (resting, peak or fading), with windows by roast level and method held in reference data | S | R1 | Hidden when there is no roast date |
| BEAN-05 | Library list with filters (status, origin, roaster, process, roast) and sorting (recent, rating, freshness) | S | R1 | — |
| BEAN-06 | Wishlist of beans to buy | C | R3 | — |

### 7.4 Recipe Generation (RCP)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| RCP-01 | Generate recipes per brew method. **V60 is a Must for R1 (D6).** AeroPress and French press are Shoulds for R2. Chemex, Kalita Wave and others are Coulds for R2. The engine must be built so that adding a method means adding a template, not changing code paths. | M/S/C | R1 (V60), R2 (others) | Each method has its own template, parameter ranges and step vocabulary (for example stir, plunge, press) |
| RCP-02 | Inputs: bean attributes, method, dose or target volume, taste preferences, equipment, days since roast, and prior brews of this bean (ratings and feedback) | M | R1 | Prior-brew input is a Should for R1 |
| RCP-03 | Output: dose, water, ratio, temperature, grind (descriptor, plus grinder setting where available), total time, ordered steps (per-pour and cumulative water, target times, technique notes), expected cup profile, and a "why this recipe" rationale of ≤ 2 sentences | M | R1 | Schema-validated |
| RCP-04 | **Recipe integrity is enforced in code:** step waters sum exactly to the total, times strictly increase, the final time equals the total time, and parameters stay within the method's safe ranges | M | R0 | 100% of delivered recipes pass validation across the golden set and in production telemetry |
| RCP-05 | **One source of truth for brewing rules** (SCA baselines and origin, process, roast and method modifiers), used by the AI prompt, the validator and the fallback alike | M | R0 | One rules module. No duplicated prompt rules. The skill documents reference it instead of restating it. |
| RCP-06 | Offline / AI-unavailable fallback: a deterministic rules-based recipe, labelled "standard recipe" | M | R0 | Works with no network connection |
| RCP-07 | The user can edit any parameter before brewing, and dependent values recalculate (for example, changing the dose rescales water and pours) | M | R1 | Recalculated recipe passes RCP-04 |
| RCP-08 | Save a recipe as a favourite ("house recipe") per bean or per method and reuse it | S | R1 | — |
| RCP-09 | Each brew stores an exact snapshot of the recipe used, plus the engine version, prompt version and source (AI, fallback, user-edited) | M | R1 | Supports evaluation and the dial-in history |
| RCP-10 | Share a recipe as an image card or link. Import a recipe (for example, a roaster's) from text, URL or photo. | C | R3 | — |

### 7.5 Guided Brew Mode (BRW)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| BRW-01 | Step-by-step timer showing the current step, cumulative water target, countdown to the next pour, and a preview of the upcoming step | M | R1 | Timer drift ≤ 1 s over 5 min |
| BRW-02 | The screen stays awake while brewing (Wake Lock where supported) | M | R1 | Falls back to a visible "keep screen on" notice where unsupported |
| BRW-03 | Audio and/or haptic cue at each step transition, user-toggleable | S | R1 | — |
| BRW-04 | Pause, resume, restart and skip a step | S | R1 | — |
| BRW-05 | Large touch targets and high contrast, readable at arm's length | M | R1 | Meets NFR-05 |
| BRW-06 | Works fully offline once the recipe is loaded | M | R1 | — |
| BRW-07 | On completion, goes straight to Taste & Rate with the actual time pre-filled | M | R1 | — |
| BRW-08 | Bluetooth smart-scale integration (live weight and flow rate) | C | R3 | — |

### 7.6 Brew Logging & Tasting (LOG)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| LOG-01 | Each brew is logged as a **Brew Session** linked to a Bean: timestamp, method, recipe snapshot, actual parameters (dose, water, temperature, grind setting, time), rating and notes | M | R1 | — |
| LOG-02 | Quick tasting input: overall rating 1–5, plus balance sliders (sour ↔ bitter, weak ↔ strong) | M | R1 | Completed in ≤ 15 s on a single screen |
| LOG-03 | Optional flavour descriptors from a structured lexicon aligned to the SCA/WCR Coffee Taster's Flavor Wheel, plus free text | S | R1 | — |
| LOG-04 | Manual log of a brew made outside guided mode | M | R1 | ≤ 30 s (J4) |
| LOG-05 | Edit and delete beans and brews, with confirmation and undo | M | R1 | Undo available for ≥ 10 s |
| LOG-06 | Optional photo of the brew | C | R2 | — |

### 7.7 Dial-in Coach (DIAL)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| DIAL-01 | When the user reports an off-balance cup, give one primary adjustment (and at most one secondary) with its expected effect and a plain-language reason | M | R1 | Shown on the rating screen |
| DIAL-02 | Suggestions follow extraction principles: sour or thin → raise extraction (finer grind, hotter water, longer contact); bitter, harsh or drying → lower it. Method constraints are respected. | M | R1 | 100% directional correctness on the dial-in scenario test set |
| DIAL-03 | One-tap "apply to next brew" creates the adjusted recipe for this bean | M | R1 | — |
| DIAL-04 | The coach uses this bean's brew history: it avoids repeating changes that failed and converges on the best-rated parameters | S | R1–R2 | Rules-based in R1, AI-enhanced in R2 (AI-04) |
| DIAL-05 | Track whether suggestions improved the next rating | M | R1 | Feeds the dial-in effectiveness KPI |

### 7.8 Journal & History (JRN)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| JRN-01 | Calendar and list views of brew sessions (existing views adapted to the new model) | M | R1 | — |
| JRN-02 | Search and filter by bean, origin, roaster, method, rating, date range and flavour | S | R1 | — |
| JRN-03 | Bean-centric and brew-centric views | S | R1 | — |
| JRN-04 | Export all data (JSON at full fidelity, CSV for brews). Import from a JSON export. | M | R1 | Export → import round-trip loses no data |
| JRN-05 | Migrate existing `localStorage` journal entries into the new model without loss (mapping in Appendix B) | M | R0 | Migration is idempotent, and a pre-migration backup is kept |

### 7.9 Origins Map (MAP)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| MAP-01 | Pins per origin country showing a count and the list of beans (existing feature retained) | M | R1 | — |
| MAP-02 | Full country reference data (ISO 3166-1) replaces the hardcoded list | M | R1 | Every coffee-producing country can be mapped. User and AI text is never rendered as raw HTML. |
| MAP-03 | Region-level pins where the region is recognised (for example Yirgacheffe, Huila, Nariño) | C | R2 | — |
| MAP-04 | "Coffee passport" statistics: countries, regions, processes and varieties tried; average rating by origin | S | R2 | — |
| MAP-05 | Origin knowledge card: altitude, typical processes and flavour tendencies | C | R2 | Generated once, reviewed and cached (AI-08) |

### 7.10 Insights & Personalisation (INS)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| INS-01 | Palate profile learned from ratings (origins, processes, roast levels, descriptors, strength), shown transparently and resettable | S | R2 | Shown only after ≥ 10 rated brews across ≥ 3 beans |
| INS-02 | Personal statistics: brews per week, rating trend, best beans, method mix | S | R2 | — |
| INS-03 | "Next bag" guidance: the attributes and origins the user is likely to enjoy | C | R2 | Attribute-level only. No product recommendations before D3. |
| INS-04 | Monthly recap | C | R3 | — |

### 7.11 Accounts, Sync & Privacy Controls (ACC)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| ACC-01 | Guest mode: the full core loop works without an account, with data stored on the device | M | R1 | — |
| ACC-02 | Optional account (email magic link and/or Google/Apple sign-in) with cloud backup and multi-device sync | S | R2 | — |
| ACC-03 | On first sign-in, device data migrates to the account without duplicates | S | R2 | — |
| ACC-04 | Self-service deletion of the account and all associated data | M | R2 | Completed within 30 days, with confirmation |
| ACC-05 | The user can view and export all data held about them | M | R2 | Reuses JRN-04 |

### 7.12 Operations & Administration (OPS)

| ID | Requirement | Pri | Rel | Acceptance criteria |
|---|---|---|---|---|
| OPS-01 | Server-side rate limiting and bot protection on every AI endpoint, per client and global, with a clear message to the user when a limit is hit | M | R0 | Load test confirms limits hold |
| OPS-02 | AI spend controls: daily and monthly caps, alerts, and automatic degradation to the fallback when a cap is reached | M | R0 | The cap cannot be exceeded by more than one request's cost |
| OPS-03 | Product analytics for the §3 KPI events, consent-aware and without personal data in payloads | M | R1 | KPI dashboard live at R1 launch |
| OPS-04 | Error and performance monitoring for client and serverless code | M | R1 | — |
| OPS-05 | Feature flags for staged rollout of AI features | S | R1 | — |
| OPS-06 | Prompts and model configuration versioned in source control. A change must pass the evaluation suite (AIG-02). | M | R0–R1 | — |
| OPS-07 | In-app "report a wrong scan or recipe" feedback | S | R1 | The report includes the recipe snapshot and versions, without personal data |

---

## 8. AI Capability Requirements

### 8.1 AI design principles (apply to every AI capability)

| ID | Principle |
|---|---|
| AIP-1 | **AI decides, code calculates.** AI selects and justifies parameters within bounds. Code computes quantities, timings and unit conversions and enforces safe ranges. No AI output reaches the user unvalidated. |
| AIP-2 | **Structured outputs.** Every AI call returns schema-validated JSON. Invalid output gets one repair attempt, then the deterministic fallback. |
| AIP-3 | **Graceful degradation.** Every AI capability has a non-AI fallback, and the core loop works offline. |
| AIP-4 | **The human stays in control.** Suggestions are explained and editable, and never silently overwrite user data. |
| AIP-5 | **Measured quality.** Each capability has an evaluation set, metrics and release thresholds. Prompt and model changes are gated on evals. |
| AIP-6 | **Provider-agnostic.** A thin server-side AI gateway, with the model chosen per capability on accuracy, latency and cost evidence. The chosen provider(s) must serve Hong Kong customers (D4). |
| AIP-7 | **Privacy by design.** Send the minimum data needed. No user identifiers go to AI providers. Providers must not train on user data. Images are not retained after processing unless the user saves them. |
| AIP-8 | **Cost-aware.** Each capability has a token budget. Results are cached where inputs repeat (for example, origin cards). |
| AIP-9 | **Open-weight models only (D7).** Every model must have publicly downloadable weights under a licence that permits commercial use (Apache 2.0 or MIT preferred; any other licence reviewed before adoption). Hosted-only variants are excluded, even from an open model family. Because the weights are open, the product can move to another host or self-host without changing the model. Label reading (AI-01) uses a multimodal model. |

### 8.2 AI capability catalogue

| ID | Capability | Business purpose | KPI supported | Pri | Rel | Status |
|---|---|---|---|---|---|---|
| AI-01 | Label Understanding | Capture a bag in seconds without typing | Scan accuracy, activation | M | R1 | Exists; enhance |
| AI-02 | Recipe Personalisation | A great first cup for this bean, this gear and these preferences | First-brew satisfaction | M | R1 | Exists; re-architect |
| AI-03 | Recipe Validation & Repair | No incorrect recipe ever reaches the user | Data integrity, trust | M | R0 | Partial; make it deterministic first |
| AI-04 | Dial-in Coach | A better next cup | Dial-in effectiveness, North Star | M | R1 (rules) / R2 (AI) | New |
| AI-05 | Tasting Note Normalisation | Comparable flavour data for search and insights | Supports AI-06 | S | R1 | New |
| AI-06 | Palate Profiling & Guidance | Help the user understand and extend their taste | Retention | S | R2 | New |
| AI-07 | Brew Assistant (Q&A) | Answer brewing questions using the user's own data | Retention | C | R3 | New |
| AI-08 | Origin Knowledge Cards | Context that makes the map worth exploring | Engagement | C | R2 | New |

### 8.3 Capability specifications

#### AI-01 — Label Understanding

| Aspect | Requirement |
|---|---|
| Model type | An open-weight **multimodal (vision-language) model** that reads the photo and returns structured fields directly (AIP-9). A specialist OCR model feeding a text model may be tested as a challenger, and is adopted only if it wins the evaluation. |
| Inputs | 1–2 label photos (CAP-05) at a resolution high enough to read small print such as roast date and altitude. The current 512 px cap is to be evaluated against this. |
| Outputs | The CAP-02 fields, each with a confidence level (high, medium, low). Absent fields are `null`. Country is normalised to ISO 3166-1. Original-language text is kept for the name. |
| Quality bar | Core fields ≥ 90% correct. **Fabrication rate (a field filled in that is not on the label) ≤ 2%.** Roast date ≥ 85% correct when printed. |
| Evaluation set | ≥ 100 ground-truthed bag photos covering ≥ 5 label languages and weighted to the Hong Kong market (English, Traditional Chinese, Japanese, Simplified Chinese, Korean), with varied lighting, glare and curved bags |
| Latency | p90 ≤ 6 s from upload to response |
| Fallback | Manual entry with the photo kept (CAP-08) |
| Feedback loop | User corrections (CAP-03) are logged, with consent, to grow the evaluation set |

#### AI-02 — Recipe Personalisation

| Aspect | Requirement |
|---|---|
| Inputs | Normalised bean attributes, method, dose or volume, preferences, equipment, days since roast, prior brews of this bean |
| Approach | (1) The rules engine (RCP-05) produces a baseline. (2) AI adjusts it within allowed bounds per parameter (for example temperature ±3 °C, ratio ±2, grind ±2 steps), chooses the pour structure, and writes technique notes and the rationale. (3) Code computes waters and timings and validates them (AI-03). |
| Outputs | RCP-03 |
| Quality bar | 100% validation pass after repair. Expert review score ≥ 4/5 on a golden set of 50 cases (D9). First-brew satisfaction ≥ 3.8 in production. |
| Latency | p90 ≤ 5 s |
| Fallback | The baseline rules recipe, labelled "standard" |
| Explainability | A rationale of ≤ 2 sentences that refers to this bean's attributes |

#### AI-03 — Recipe Validation & Repair

| Aspect | Requirement |
|---|---|
| Approach | A deterministic validator checks schema, arithmetic, timing and method-specific ranges. It repairs deterministically where possible (rescaling pours, re-spacing times) and otherwise uses the fallback. |
| LLM role | Optional and advisory only: a coherence check (does the recipe make directional sense for this origin, process and roast?). Its suggestions are re-validated before use and never override validated numbers. |
| Quality bar | 0 invalid recipes delivered (production telemetry, RCP-04) |

#### AI-04 — Dial-in Coach

| Aspect | Requirement |
|---|---|
| Inputs | Rating, balance feedback, recipe snapshot, actual parameters, bean attributes, this bean's brew history, method |
| Outputs | Primary adjustment (parameter, from → to, expected effect), an optional secondary adjustment, the rationale and a confidence level |
| Approach | **R1:** a deterministic decision table based on extraction theory. **R2:** an AI layer that weighs history and nuance, limited to the directions the rule table permits. |
| Quality bar | 100% directional correctness on the scenario test set. Dial-in effectiveness ≥ 60% in production. |
| Latency | ≤ 3 s; the R1 rules respond instantly |
| Fallback | The rule table |

#### AI-05 — Tasting Note Normalisation

| Aspect | Requirement |
|---|---|
| Purpose | Map label notes and user free text to lexicon categories (for example "blackcurrant" → Fruity › Berry) for search, insights and the palate profile |
| Quality bar | ≥ 90% agreement with human mapping on the test set |
| Mode | Asynchronous or batch, with no user-facing latency. Mappings are cached per unique term. |

#### AI-06 — Palate Profiling & Guidance

| Aspect | Requirement |
|---|---|
| Approach | **Statistics first** (weighted aggregation of ratings by attribute). The LLM writes the natural-language summary only. |
| Threshold | Shown only after ≥ 10 rated brews across ≥ 3 beans (INS-01) |
| Transparency | Every insight shows its evidence (for example "rated 4.5 on average across 6 washed Ethiopians"). The user can reset the profile. |

#### AI-07 — Brew Assistant (Could, R3)

Conversational help grounded in the user's own data and curated brewing knowledge. It is limited to coffee topics, cites the user's own brews when it uses them, and makes no health claims.

#### AI-08 — Origin Knowledge Cards (Could, R2)

Generated once per origin or region, reviewed and cached as reference data. Not generated per request.

### 8.4 AI evaluation & governance

| ID | Requirement | Pri | Rel |
|---|---|---|---|
| AIG-01 | Evaluation datasets kept in the repository: label images with ground truth (AI-01), recipe golden cases (AI-02/03), dial-in scenarios (AI-04), lexicon mappings (AI-05) | M | R0–R1 |
| AIG-02 | The eval suite runs automatically on every prompt or model change. A release is blocked if any metric falls below its threshold. | M | R1 |
| AIG-03 | Telemetry for each AI call: capability, model, prompt version, latency, tokens and cost, validation outcome, whether the fallback was used. No personal data and no images. | M | R1 |
| AIG-04 | Monthly review of AI quality and cost against the KPIs | S | R1 |
| AIG-05 | Model choice recorded per capability as an Architecture Decision Record with eval evidence | S | R1 |

---

## 9. Data Requirements

### 9.1 Conceptual data model

```
User ─1───*─ Equipment
  │
  1
  *
 Bean ─*───1─ Origin (reference: ISO country, region, coordinates)
  │   └*──0..1─ Roaster
  1
  *
 Brew ─1───1─ RecipeSnapshot
  │   └1──0..1─ TastingFeedback
  └──0..1─ DialInSuggestion (applied from the previous brew)
```

| Entity | Key attributes |
|---|---|
| User / Profile | id, units, default dose, taste preferences, consent flags, created at |
| Equipment | type (brewer, grinder, kettle, scale), make, model, grinder setting scale |
| Bean (bag) | id, name, roaster, origin country (ISO-2), region, producer, varieties[], process, roast level, roast date, altitude (m, range), label notes[], net weight (g), remaining (g), status, photos[], source (scan or manual), extraction metadata (model and prompt version, confidence per field, user-corrected fields) |
| Brew | id, bean id, timestamp, method, recipe snapshot, actual parameters, actual duration, guided (yes/no), rating, balance feedback, descriptors[], notes, id of the applied suggestion |
| RecipeSnapshot | parameters, steps[], rationale, engine version, prompt version, source (AI, fallback, user, edited) |
| DialInSuggestion | source brew id, changes[], rationale, accepted (yes/no), outcome rating delta |
| Reference data | Countries and coffee regions with coordinates. Process, roast level, method and grind enumerations. Method templates and safe ranges. Grinder setting maps. Freshness windows. Flavour lexicon. |

### 9.2 Data rules

| ID | Rule |
|---|---|
| DR-01 | Process, roast level, method and grind are stored as normalised enumerations. Country is stored as an ISO code plus a display name. |
| DR-02 | Units are stored canonically (g, ml, °C, seconds) and converted only for display |
| DR-03 | Images are stored outside the primary record store (IndexedDB blobs on the device; object storage in the cloud), with thumbnails for lists |
| DR-04 | The schema is versioned. Migrations are automatic, idempotent and non-destructive, and a backup is kept before each migration. |
| DR-05 | **User data is never deleted without the user's action.** Under storage pressure the user is warned and offered export or photo clean-up. |
| DR-06 | User content is retained until the user deletes it. AI telemetry is retained for ≤ 90 days and contains no images or free text. |
| DR-07 | Corrections, ratings and notes are used to improve AI only with opt-in consent |

---

## 10. Non-Functional Requirements

| ID | Category | Requirement | Pri | Rel |
|---|---|---|---|---|
| NFR-01 | Performance | LCP ≤ 2.5 s on a mid-range phone over 4G. Scan p90 ≤ 6 s, recipe p90 ≤ 5 s, scan-to-recipe end to end ≤ 10 s. | M | R1 |
| NFR-02 | Offline | Library, journal, guided brew, manual log and fallback recipes work offline. Scans taken offline are queued and processed when the connection returns. | M (core) / S (queue) | R1 |
| NFR-03 | Installability | The PWA can be installed (manifest, service worker, icons) and asks for persistent storage | M | R1 |
| NFR-04 | Compatibility | The two latest versions of iOS Safari, Chrome for Android, and desktop Chrome, Safari, Edge and Firefox | M | R1 |
| NFR-05 | Accessibility | WCAG 2.2 AA. Brew mode is legible at arm's length. Colour is never the only way information is shown. | M | R1 |
| NFR-06 | Security | No secrets in any client bundle, and all AI calls go through the server (dev mode included). Input validation and size limits on every endpoint. Output encoding for all user and AI text. Dependency vulnerability scanning in CI. | M | R0 |
| NFR-07 | Abuse & cost | Per-client and global rate limits, bot protection on AI endpoints, and spend caps (OPS-01/02) | M | R0 |
| NFR-08 | Privacy & compliance | Comply with the **Hong Kong Personal Data (Privacy) Ordinance (PDPO)** and its six Data Protection Principles (D4). This means: a Personal Information Collection Statement at first use; a privacy policy; consent for analytics and for AI-improvement data use; data access and correction requests answered within 40 days; disclosure of processing outside Hong Kong (AI, analytics); and data export and deletion. AI governance follows the PCPD's *Artificial Intelligence: Model Personal Data Protection Framework*. | M | Before public launch |
| NFR-09 | Reliability | An AI provider outage does not block the core loop. Serverless availability ≥ 99.5% per month. Sync is safe under conflicting edits. | S | R1–R2 |
| NFR-10 | Durability | Zero data loss caused by app behaviour. Daily cloud backups once accounts exist. | M | R1 / R2 |
| NFR-11 | Maintainability | Typed schemas shared by client and server (TypeScript or a schema library). Rules engine and validator unit-tested with ≥ 90% line coverage. CI runs lint, type check, tests and evals. | M | R0 |
| NFR-12 | Observability | Structured server logs, client error tracking, and a KPI dashboard | M | R1 |
| NFR-13 | Localisation | English UI in R1, with an i18n-ready architecture so a Traditional Chinese (zh-HK) UI can follow (D11). Labels in any language are extracted to English, and the original text is kept. Hong Kong defaults: metric units, °C, and DD/MM/YYYY dates, with ambiguous label dates read day-first. | S | R1 |
| NFR-14 | Cost | AI cost per MAU within the §3 target. AI spend within the monthly cap (D12). | S | R1 |
| NFR-15 | Usability | A new user completes J1 without help in ≤ 3 min, excluding brew time (usability test, n ≥ 5) | S | R1 |

---

## 11. Assumptions, Constraints & Dependencies

**Assumptions**

| ID | Assumption | Validation |
|---|---|---|
| A1 | Use is personal home brewing, with one user per device in R1 | Analytics, user interviews |
| A2 | Users brew with a smartphone within reach | Usability test |
| A3 | Most specialty bags state origin and process. Many, but not all, state a roast date. | AI-01 evaluation set |
| A4 | Users will rate brews if rating takes ≤ 15 s and returns value straight away (a dial-in suggestion) | Rating completion rate |
| A5 | The product is free during R1–R2. The monetisation model is decided before R3 (D3). | — |
| A6 | Delivery is by a small team with AI-assisted development, which favours managed services and minimal operations | — |

**Constraints**

| ID | Constraint |
|---|---|
| C1 | The current stack (React, Vite, Vercel serverless) is retained unless a requirement cannot be met on it |
| C2 | iOS Safari may clear script-written storage for sites that are not installed after about 7 days without use. This is why installation as a PWA, persistent storage, export reminders and, from R2, cloud sync are all required. |
| C3 | AI provider pricing, rate limits and model availability can change without notice. This is why AIP-6 requires a provider-agnostic gateway. |
| C4 | The OpenStreetMap tile usage policy does not permit heavy production use, so a compliant tile provider is needed before public launch |
| C5 | Several major AI API providers do not serve Hong Kong. The current provider (Groq) appears to restrict Greater China, although its position on Hong Kong is unconfirmed. AI must therefore run on open-weight models (AIP-9) through a provider that confirms it serves Hong Kong customers. |

**External dependencies:** AI provider APIs, the Vercel hosting platform, a map tile provider, and from R2 an authentication provider and a cloud database with object storage.

---

## 12. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | AI recipes feel generic or wrong, and users churn | M | H | Rules-first baseline (AI-02), evals and expert review (D9), the dial-in loop corrects quickly |
| R2 | AI cost spike from abuse or bots | M | H | OPS-01/02 and NFR-07 delivered in R0, before any growth activity |
| R3 | Extraction errors from small print, glare or language | H | M | Editable fields, confidence flags, multi-photo capture, resolution evaluation |
| R4 | On-device data loss (browser cleared, iOS storage eviction) | M | H | IndexedDB with persistent storage, PWA install prompt, export reminders, cloud sync in R2 |
| R5 | Users do not log or rate brews, so the learning loop starves | M | H | Rating in ≤ 15 s, automatic transition from brew mode, immediate payoff through the dial-in suggestion |
| R6 | Scope creep and a return to undirected iteration | H | M | This BRD as the baseline, change control (§15), release exit criteria (§13) |
| R7 | Provider lock-in or model deprecation | M | M | AI gateway (AIP-6); evals make a model swap a measured, low-risk change |
| R8 | Privacy non-compliance at launch, or later when accounts launch | L | H | NFR-08 PDPO checklist as an exit criterion for R1 and again for R2 |
| R9 | The AI provider is unavailable to Hong Kong customers (C5) | M | H | Migrate to an HK-eligible provider in R0. Configure a second provider for failover. Open weights keep self-hosting available as an exit. |

---

## 13. Proposed Release Phasing

*This is input to the Feature & AI Solution Plan, not a commitment. Durations will be estimated in that plan.*

| Release | Theme | Requirements in scope | Exit criteria |
|---|---|---|---|
| **R0 — Foundation** | Make it safe and solid | OPS-01, OPS-02, OPS-06, RCP-04, RCP-05, RCP-06, AI-03, BEAN-01, JRN-05, DR-04, DR-05, NFR-06, NFR-07, NFR-11, AIG-01 (initial sets) | No AI endpoint without limits. 0 invalid recipes on the golden set. Legacy data migration passes tests. CI green. |
| **R1 — Daily Driver (MVP)** | Complete the core loop | CAP-01–04, 06, 08 · BEAN-02–05 · RCP-01 (V60), 02, 03, 07, 08, 09 · BRW-01–07 · LOG-01–05 · DIAL-01–05 · JRN-01–04 · MAP-01, 02 · PRF-01–03, 05 · ACC-01 · OPS-03–05, 07 · AI-01, AI-02, AI-04 (rules), AI-05 · AIG-02–05 · NFR-01–05, 08, 12, 13, 15 | KPI instrumentation live. Usability test passed. All AI eval thresholds met. PDPO checklist complete (NFR-08). |
| **R2 — Personal & Synced** | Learn and persist | ACC-02–05 (accounts re-confirmed at the R1 review, D5) · PRF-04 · CAP-05, 07 · RCP-01 (AeroPress, French press, then Chemex and Kalita Wave) · MAP-03–05 · INS-01–03 · LOG-06 · AI-04 (AI layer), AI-06, AI-08 · NFR-08, 09, 10 | PDPO checklist re-run for accounts and cloud data. Sync conflict tests passed. |
| **R3 — Explore** (candidate) | Grow and monetise | RCP-10, BRW-08, BEAN-06, INS-04, AI-07, monetisation (D3) | Business case approved |

---

## 14. Decisions

### 14.1 Decisions log (closed)

| ID | Decision | Outcome | Date | Effect on this BRD |
|---|---|---|---|---|
| D2 | Primary persona | **Home brewer: P2 Home Enthusiast**, with P1 still able to succeed | 2026-10-23 | §5.2 |
| D4 | Launch market | **Hong Kong** | 2026-10-23 | NFR-08 (PDPO), NFR-13 (HK defaults), C5, AI-01 eval languages |
| D5 | Timing of accounts | **R1 launches without accounts.** Guest mode, on-device data, export and import. Accounts stay planned for R2, to be re-confirmed at the R1 review. | 2026-10-23 | ACC-01 (R1); ACC-02–05 (R2) |
| D6 | Brew methods in R1 | **V60 only** | 2026-10-23 | §4.1, RCP-01, §13 |
| D7 | AI models | **Open-weight (open-source) models only. A multimodal model is used wherever label reading (OCR) is needed.** The provider and specific models are selected by evaluation (see `SOLUTION_PLAN.md`). | 2026-10-23 | AIP-6, AIP-9, AI-01, C5, R9 |

### 14.2 Open decisions

| ID | Decision | Options | Recommendation | Needed by |
|---|---|---|---|---|
| D1 | Product name and positioning | "BrewMap" / "Bean Sommelier" (the name used in the AI context documents) / a new name | Keep "BrewMap" as the working name, and decide before public launch | R1 launch |
| D3 | Business model | Free hobby product / freemium (AI usage limits) / subscription / roaster partnerships | Free through R2, with instrumentation in place for freemium (AI usage is a natural premium boundary) | Before R3 |
| D8 | Platform | PWA / native wrapper (for example Capacitor) / fully native | PWA in R1. Reconsider a wrapper if iOS limits (haptics, storage) block KPIs. | R1 |
| D9 | Expert reviewer for recipes | Barista or Q Grader contact / community panel | Engage one experienced Hong Kong barista or Q Grader to review the 50-case golden set | Mid-R1 |
| D10 | Rating scale | 1–5 / 1–10 (the scale in the AI context documents) | 1–5 overall rating plus balance sliders; quicker, and enough for dial-in | R1 design |
| D11 | UI language | English only / English + Traditional Chinese (zh-HK) | English in R1 with i18n scaffolding. Traditional Chinese in R2. | R1 design |
| D12 | Monthly AI spend cap | Any amount | US$20 per month hard cap, with alerts at 50% and 80% (rationale in `SOLUTION_PLAN.md` §7) | Start of R0 |

## 15. Change Control

1. This document is the requirements baseline. Change it through pull requests to `docs/BRD.md`, updating the version and change log.
2. **Requirement IDs are permanent.** A deprecated requirement is struck through, not deleted. A new requirement takes the next free ID in its area.
3. Every feature pull request names the requirement IDs it implements (for example "Implements LOG-01, LOG-02").
4. Changes to priority, release or scope need Product Owner approval and are recorded in the change log.
5. Once decided, open decisions (§14.2) move to the decisions log (§14.1) with the date and outcome.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| Bloom | The first small pour that lets trapped CO₂ escape before the main pours |
| Dial-in | Adjusting grind, temperature, ratio or time over successive brews to reach the best cup for a bean |
| Extraction | How much soluble material water dissolves from the grounds. Under-extraction tastes sour or thin; over-extraction tastes bitter or drying. |
| Ratio | Coffee-to-water ratio by weight, for example 1:16 |
| Days off roast | Days since the roast date. It drives the freshness and resting guidance. |
| Process | How the coffee cherry is processed at origin: washed, natural, honey, anaerobic or wet-hulled |
| SCA | Specialty Coffee Association, the source of the brewing baselines used here |
| Eval set | A curated dataset with known correct answers, used to measure AI quality |
| Fallback | A deterministic, non-AI behaviour used when AI is unavailable or its output fails validation |
| MoSCoW | Prioritisation scale: Must, Should, Could, Won't |
| North Star metric | The single metric that best captures the value users get from the product |
| PWA | Progressive Web App: a web app that can be installed and can work offline |
| WAU / MAU | Weekly / monthly active users |

---

## Appendix A — Current Codebase Map

| File | Responsibility today |
|---|---|
| `src/App.jsx` | App shell and tab navigation (Scanner, Journal, Map) |
| `src/components/LabelScanner.jsx` | Scan flow, image processing, rule-based fallback recipe engine (`ORIGIN_PROFILES`, `PROCESS_ADJUSTMENTS`, `ROAST_ADJUSTMENTS`), journal save |
| `src/api.js` | Client API. Dev mode calls Groq directly, with duplicated prompts. |
| `api/analyze.js` | Serverless vision label extraction |
| `api/recipe.js` | Serverless recipe generation and verifier merge |
| `api/verify.js` | Local structural checks plus the LLM coherence audit |
| `src/components/BrewJournal.jsx` | Journal calendar and log views |
| `src/components/WorldMap.jsx` | Leaflet origins map with hardcoded country coordinates |
| `src/skills/coffee-context/coffee-context-skill.md`, `coffee-brew-app/.claude/skills/brew-guide-generator.md` | Context documents for the AI coding assistant. Their schemas and parameters differ from the code (G6). |

## Appendix B — Legacy Data Migration Mapping (JRN-05)

Legacy `localStorage` key `brewmap_journal` holds an array of entries. Each entry becomes **one Bean and one Brew**:

| Legacy field | Target |
|---|---|
| `id` | `Bean.legacyId` and `Brew.legacyId` (for idempotent migration) |
| `savedAt` | `Bean.createdAt`, `Brew.timestamp` |
| `imageDataUrl` | `Bean.photos[0]`, moved to blob storage (DR-03) |
| `name`, `region`, `altitude` | `Bean.name`, `Bean.region`, `Bean.altitude` (parsed to metres where possible) |
| `origin` | `Bean.originCountry` (normalised to ISO-2; raw value kept if no match) |
| `roastLevel`, `process` | `Bean.roastLevel`, `Bean.process` (normalised enumerations) |
| `tastingNotes[]` | `Bean.labelNotes[]` |
| `variety` | `Bean.varieties[]` (split on `,` and `/`) |
| `labelLanguage` | `Bean.extraction.labelLanguage` |
| `brewGuide` | `Brew.recipeSnapshot` (method = V60, source = `legacy`) |
| — | `Brew.rating = null`, `Brew.guided = false`, `Bean.status = Active` |
