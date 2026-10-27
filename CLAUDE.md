# Working on BrewMap

BrewMap is built spec-first. The documents decide; the code implements them.

## Before changing anything

1. Find the requirement in [docs/BRD.md](docs/BRD.md) and the design in [docs/SOLUTION_PLAN.md](docs/SOLUTION_PLAN.md). UI work also follows [docs/UX_DESIGN.md](docs/UX_DESIGN.md) and the BrewMap design system it links.
2. If the change is not covered by a requirement, or contradicts one, stop and raise it. Update the document first (with a version bump and a decision ID if needed), then the code.
3. Architecture changes need an ADR in [docs/adr/](docs/adr/README.md). Never edit an accepted ADR; supersede it.

## Rules that must not break

- **One source of brewing rules** (RCP-05): all numbers live in `src/domain/rules`. Do not copy rules into components, prompts or the API.
- **AI decides, code calculates** (ADR-04): models return bounded plans; the engine computes and validates every recipe. Never show or save a recipe that fails `checkRecipe`.
- **No fabrication** (AI-01): a field not printed on the label stays empty. Prompt or normaliser changes must keep the fabrication rate ≤ 2% in the label eval.
- **Open-weight models only** (D7, AIP-9), called through `api/_lib/ai/gateway.ts`. No provider SDKs, no direct calls.
- **Every AI endpoint is protected** (ADR-06): `guard()` first, the spend cap before each call, fail closed in production.
- **User data is never deleted without the user's action** (DR-05). Schema changes are new Dexie versions with upgrades (DR-04).
- **Label and user text is never rendered as HTML** (MAP-02).
- **No secrets in the client.** Only `VITE_*` values reach the bundle.
- **English UI** (D11), sentence case, plain words.

## How to work

- New code is TypeScript with `.js` import specifiers. Legacy JSX screens are replaced in R1.
- Cite requirement IDs in tests and in comments where the reason is not obvious.
- Every change ships with tests. Run `npm run check` and `npm run e2e` before committing.
- Prompt changes get a new version string in `api/_lib/ai/prompts.ts` and an eval run (`npm run eval:recipes -- --ai`, `npm run eval:labels`).
- Commit messages say what changed and why, in the imperative. Do not put model or assistant identifiers in commits, code or docs.
