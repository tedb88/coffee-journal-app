# ADR-07: API functions in the Vercel Hong Kong region (`hkg1`)

**Status:** Accepted; region availability on the current Vercel plan to be confirmed at deployment · **Decision:** D4 (Hong Kong)

## Decision
`vercel.json` sets `"regions": ["hkg1"]` for the functions, close to Hong Kong users and to an HK model endpoint.

## Consequences
- Lower latency towards the p90 ≤ 6 s scan target.
- If the plan does not allow choosing the region, Vercel ignores the setting and uses its default; check the deployment's function region after the first deploy.
