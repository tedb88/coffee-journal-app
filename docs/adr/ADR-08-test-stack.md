# ADR-08: Vitest, fast-check, Playwright and an eval harness

**Status:** Accepted · **Requirements:** NFR-11, AIG-01

## Decision
- **Vitest** for unit and integration tests of the domain, data layer (with `fake-indexeddb`), API routes (with an in-memory store and a scripted `fetch`) and eval metrics. Coverage with v8; the domain must keep 90% lines and functions and 80% branches.
- **fast-check** property test: 10,000 random inputs never produce an invalid recipe.
- **Playwright** journeys on a mobile Chromium profile: scan → confirm → customise → recipe → journal → map; failed scan to manual entry; manual entry; legacy migration; delete.
- **Eval harness** (`evals/run.ts`): the recipe golden set offline in CI (the R0 gate), and AI recipe and label runs against configured models.
- **CI** (GitHub Actions): lint, format check, type check, tests with coverage, build, recipe eval, production dependency audit, end-to-end.
