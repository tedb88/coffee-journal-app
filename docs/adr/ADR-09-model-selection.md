# ADR-09: Model selection per capability

**Status:** Proposed: awaiting the bake-off · **Requirements:** AIG-05, AIP-9 · **Decision:** D7

## Context
Production still runs the legacy Groq models (Llama 4 Scout for labels, Llama 3.3 70B for recipes), and Groq's availability to Hong Kong customers is unconfirmed (risk PR1). Decision D7 requires open-weight models.

## What has to happen
1. Open accounts with the shortlisted Hong Kong-eligible providers and confirm licence, JSON mode and data terms (Solution Plan §5.3–5.4).
2. Photograph 50 bags and fill in `evals/labels/ground-truth.json` (see `evals/labels/README.md`).
3. Run `npm run eval:labels` for 3–5 candidates at 768, 1024 and 1280 px, and `npm run eval:recipes -- --ai` for the top two.
4. Record here: primary and failover model per capability, provider, licence, image size, the results table, cost per call, and the comparison with the incumbent.
5. Set `AI_*` and `AI_FALLBACK_*` in Vercel, then `AI_DISABLE_LEGACY_GROQ=true`.

## Decision
Not yet taken.
