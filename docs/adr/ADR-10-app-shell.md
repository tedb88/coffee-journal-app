# ADR-10: App shell, routing and the design system in code

**Status:** Accepted · **Requirements:** NFR-05, NFR-11 · **Inputs:** UX design note v0.1, BrewMap design system

## Context
R1 replaces the prototype's three tabs with the redesigned key journey: eight flow screens plus four top-level tabs (Today, Beans, Journal, Map). The design system defines the tokens, components and rules the screens must follow.

## Decision
- **Hash routing** (`src/app/router.ts`): routes such as `#/beans/<id>` work on the static host with no rewrite rules and no router dependency.
- **Design system in code** (`src/ui/`): `tokens.css` is generated from the design system's `tokens.json`; `components.css` and `components.tsx` port its components. Screens use only these tokens and components. Brew mode (dark) is a `data-theme="dark"` scope; the rest follows the phone's colour scheme.
- **Data flow:** screens read from IndexedDB through the repositories and reload after any write (`src/app/store.ts`). What one journey carries between screens (a scan, a recipe draft) lives in `src/app/flow.ts`; the draft survives a reload, photo bytes stay in memory.
- **Screens hold no brewing logic.** Freshness, the guided-brew timeline, the next-brew plan and dial-in history live in `src/domain` with unit tests.

## Consequences
- No new runtime dependencies. The bundle grows by the screens only.
- A change to the design system means regenerating `tokens.css` and updating the ported components.
- Hash URLs are less tidy than paths; acceptable for an app shared by link rarely.
