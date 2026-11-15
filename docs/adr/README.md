# Architecture Decision Records

Each record states one decision, why it was taken and what it costs. A record is never edited after acceptance; a change is a new record that supersedes it. Source: Solution Plan §3.3.

| ID | Decision | Status | Implemented |
|---|---|---|---|
| [ADR-01](ADR-01-on-device-storage.md) | User data on the device in IndexedDB, through Dexie | Accepted | R0 |
| [ADR-02](ADR-02-shared-domain-core.md) | One domain core in `src/domain/`, used by client, API and evals | Accepted | R0 |
| [ADR-03](ADR-03-ai-gateway.md) | AI gateway over the OpenAI-compatible API, providers set by configuration | Accepted | R0 |
| [ADR-04](ADR-04-deterministic-validation.md) | Deterministic validation and repair replace the LLM verifier | Accepted | R0 |
| [ADR-05](ADR-05-pwa.md) | Installable PWA through `vite-plugin-pwa` | Accepted | R1 |
| [ADR-06](ADR-06-abuse-controls.md) | Turnstile, Upstash rate limits and a monthly spend cap | Accepted | R0 |
| [ADR-07](ADR-07-hong-kong-region.md) | API functions in the Vercel Hong Kong region (`hkg1`) | Accepted, to confirm on the plan | R0 |
| [ADR-08](ADR-08-test-stack.md) | Vitest, fast-check, Playwright and an eval harness | Accepted | R0 |
| [ADR-09](ADR-09-model-selection.md) | Model selection per capability | **Proposed: awaiting the bake-off** | — |
