# ADR-03: AI gateway over the OpenAI-compatible API

**Status:** Accepted · **Requirements:** AIP-6, AIP-9, OPS-06, AIG-03 · **Decision:** D7 (open-weight models only)

## Context
The prototype called one provider directly from three places, with no schema checks, no failover and no telemetry. Decision D7 requires open-weight models, and the provider may change after the bake-off (ADR-09).

## Decision
`api/_lib/ai/gateway.ts` is the only way to call a model. It sends OpenAI-compatible chat completions in JSON mode, validates the reply against a zod schema, asks once for a repair, then fails over to the next provider. Providers come from configuration (`AI_*`, then `AI_FALLBACK_*`, then the legacy Groq setup until migration), and `isOpenWeightModel` rejects closed or hosted-only models at run time. Prompts carry version strings. Each call writes one JSON telemetry line (provider, model, prompt version, latency, tokens, cost, outcome) with no images, prompts or user text.

## Consequences
- Changing provider or model is a configuration change, measured first with the eval harness.
- The name-based open-weight check is a guard, not a licence review; ADR-09 records the licence of the chosen models.
- Every token spent, including failed and repaired calls, counts against the spend cap (ADR-06).
