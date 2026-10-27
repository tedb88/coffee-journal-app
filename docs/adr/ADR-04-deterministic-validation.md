# ADR-04: Deterministic validation and repair replace the LLM verifier

**Status:** Accepted · **Requirements:** RCP-04, AI-03 · **Gap:** G7

## Context
The prototype asked a second model to check the first model's recipe. The check was non-deterministic, could not repair anything, and added cost and latency.

## Decision
"AI decides, code calculates." The model returns a bounded adjustment plan (temperature ±3 °C, ratio ±2, grind ±2 steps, bloom, pour count and weights, notes). The engine clamps the plan, calculates every amount and time, and validates the result. Anything invalid falls back to the rules baseline. No recipe leaves the engine unvalidated, and the client validates what it receives again.

## Consequences
- Validity is guaranteed by construction; a property test checks 10,000 random beans, doses, preferences and plans.
- One AI call per recipe instead of two.
- The model cannot produce a recipe outside the V60 bounds, even when that would be a deliberate choice; such cases go to the expert review (D9).
