# ADR-09: Model selection per capability

**Status:** Proposed: awaiting the bake-off · **Requirements:** AIG-05, AIP-9 · **Decision:** D7

## Context
Production ran the legacy Groq models (Llama 4 Scout for labels, Llama 3.3 70B for recipes). Groq has since retired both, and the Product Owner cannot open a Groq account from Hong Kong (risk PR1). Decision D7 requires open-weight models. Until the bake-off, production uses the interim set-up below.

## What has to happen
1. Open accounts with the shortlisted Hong Kong-eligible providers and confirm licence, JSON mode and data terms (Solution Plan §5.3–5.4).
2. Photograph 50 bags and fill in `evals/labels/ground-truth.json` (see `evals/labels/README.md`).
3. Run `npm run eval:labels` for 3–5 candidates at 768, 1024 and 1280 px, and `npm run eval:recipes -- --ai` for the top two.
4. Record here: primary and failover model per capability, provider, licence, image size, the results table, cost per call, and the comparison with the incumbent.
5. Set `AI_*` and `AI_FALLBACK_*` in Vercel, then `AI_DISABLE_LEGACY_GROQ=true`.

## Interim set-up (23 November 2026)
The Product Owner asked for a provider with no cost and no identity check. Chosen: **Cloudflare Workers AI, free plan**, with **Mistral Small 3.1 24B** (`@cf/mistralai/mistral-small-3.1-24b-instruct`, Apache 2.0) for both labels and recipes. It is configuration only (`AI_*` settings, prices 0); no provider code.

- **Free allowance:** 10,000 neurons a day. Measured: a scan uses about 67 neurons and a recipe about 28, so roughly 100 new bags a day. When the allowance runs out, calls fail and the app falls back to manual entry and the standard recipe (CAP-08, RCP-06).
- **Candidates tried** with prompt `scan.v1` on two synthetic labels (one English, one Traditional Chinese), through BrewMap's own routes:

| Model (free plan) | Scan time | Result |
|---|---|---|
| Mistral Small 3.1 24B | 9–12 s | English label: every field right. Chinese label: values left untranslated, two characters misread |
| Llama 4 Scout 17B | 26–35 s | Reads both well, but slower than the 25 s scan timeout and the 30 s function limit |
| Qwen 3.8 27B | 48 s with thinking off | Best on the Chinese label; far too slow. With thinking on, no answer within 700 tokens |
| Gemma 4 26B | 17 s | Spent all its tokens thinking; no answer |
| DeepSeek V4.1 Flash | — | Not on the free plan |

- **Label eval** (`npm run eval:labels`, 2 labels, indicative only): fabrication 0% (gate passed), schema-valid 100%, core fields 100% in English and 0% in Chinese, p90 latency 12.7 s against the 6 s target.
- **Code change it needed:** the model sometimes quotes list fields as lists in `evidence`. Such evidence is now dropped instead of failing the reading, which can only send a field to the fabrication gate. A confidence given for an empty field is ignored, so blank fields are not flagged.
- **Known limits:** weak on Chinese and Japanese labels (the user corrects the form); slower than the latency target. Data terms on the free plan are still to be confirmed (step 1).

This does not replace the bake-off: it keeps label reading working at no cost until the steps above are done.

## Decision
Not yet taken.
