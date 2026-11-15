# ADR-02: One domain core in `src/domain/`

**Status:** Accepted · **Requirements:** RCP-05, RCP-06, NFR-11 · **Gap:** G6

## Context
The prototype held brewing rules in three places: the client, the AI prompt and the verifier prompt. They drifted, and the server trusted numbers sent by the client.

## Decision
All brewing knowledge lives in `src/domain/`: enumerations, schemas (zod), the rules tables, normalisation, the recipe engine, the validator and dial-in advice. The client, the API functions and the eval harness import the same code. The server recomputes every recipe from bean attributes and never accepts amounts or times from the client. The AI prompt is generated from the rules tables (`describeRulesForPrompt`).

## Consequences
- One change updates the app, the API, the prompt and the evals together. Each recipe records `engineVersion` and `rulesVersion`.
- The domain carries the strictest test bar (90% lines and functions, 80% branches) and a 10,000-case property test.
- The client bundle carries zod and the rules tables, which adds weight to the first load.
