# ADR-06: Turnstile, Upstash rate limits and a monthly spend cap

**Status:** Accepted · **Requirements:** OPS-01, OPS-02, NFR-06, NFR-07 · **Gap:** G3 · **Decision:** D12 (US$20 a month)

## Context
The AI endpoints were open: anyone could run up the provider bill. There are no user accounts (D5), so per-user keys are not available.

## Decision
`api/_lib/protect.ts`, in this order:
1. **Method and bot check.** POST only; a Cloudflare Turnstile token is verified when `TURNSTILE_SECRET_KEY` is set.
2. **Rate limits** per client (hashed IP plus an anonymous device id): scans 10 an hour and 30 a day; recipes 30 an hour and 100 a day; 2,000 AI calls a day in total. Fixed windows in Upstash Redis over REST.
3. **Payload limits:** 4 MB of base64 per photo, 20 KB per recipe request.
4. **Spend cap:** each call's cost is added to a monthly counter; at the cap (US$20 by default, `AI_MONTHLY_CAP_USD`) AI stops until the next month. Alerts at 50%, 80% and 100% go to the log and, if set, `ALERT_WEBHOOK_URL`.

**Fail closed.** In production, AI stays off unless Turnstile and Upstash are both configured, because limits held in one function instance's memory do not hold across instances. The owner can override with `ALLOW_UNPROTECTED_AI=true`. With AI off, the app still works: manual entry and rules recipes.

## Consequences
- Free tiers of Turnstile and Upstash cover the expected load.
- Fixed windows allow a short burst at a window edge; acceptable at these limits.
- The cap is checked before each call, so one in-flight call can take spend slightly past it.
