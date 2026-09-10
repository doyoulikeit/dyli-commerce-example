# Before you launch

Start with a narrow launch: one partner, explicit Box allowlist, batches of 1–10, card/balance, Vault/Sell, and a fixed set of approved domains. Keep unavailable Shop/listing/offer APIs out of the live pitch.

## Handoff package

- Repository snapshot/template and lockfile; share a reviewed revision, not a changing dirty worktree.
- This quickstart, API/OpenAPI docs, and `sdk/commerce-client.mjs` plus TypeScript declarations.
- Commerce key delivered privately; a separate lab URL/key only if DYLI has provisioned one. The app is discovered from the key.
- Registered development/preview origins and the chosen login setup: your own Privy app, verified existing-login adapters, or separately activated DYLI-managed login.
- Actual Box IDs, fee policy, test funding instructions and a named integration support contact.
- A desktop/mobile walkthrough and evidence from the acceptance tests below.

The SDK is dependency-free source included in the repository, not a published npm package. `request()` exposes the full API without hiding transaction states; quote/card/order/open helpers require explicit idempotency keys and never automatically retry writes.

## Acceptance matrix (record results before invitation)

| Scenario | Required evidence |
| --- | --- |
| Sign in on local and approved preview domains | Correct wallet/customer; foreign-app and unlinked wallet rejected |
| Brand-new card customer with an empty wallet | A reviewed gas-funding/sponsorship path permits gacha actions without asking for a second purchase payment |
| Unauthorized domain or missing auth | No login/checkout bypass |
| Only partner Boxes | Catalog and direct quote reject out-of-scope IDs |
| Zero-fee purchase | Partner fee is zero in quote, order and payment total |
| Card, including delayed webhook | One paid order; no outcome before verification |
| Balance, EOA and supported smart wallet | Exact transfer and payer authorization; no duplicate debit |
| Batches 1 and 10 | Correct ordered rewards and one paid order per batch |
| Mixed Vault/Sell | Correct holdings and confirmed buyback balance |
| Refresh, timeout, two tabs, expired authorization | Resume same payment/order; never automatically resend uncertain broadcasts |
| Shipping, if enabled | Ownership, address/rate invalidation, exact approval, recorded redemption and real tracking when available |
| Desktop and mobile | Keyboard focus, readable totals, visible actions and no overflow |

Use isolated real test services for these tests. Local mocks are useful for UI and error handling, but do not prove the hosted auth/webhook/contract/carrier integrations.

## Controlled production activation

DYLI should separately approve the production domain, key, auth app and Box allowlist. Check the deployed schema/contract, inventory, liquidity, processor mode and webhook endpoint. Set conservative API limits and invite caps, and name owners for refunds, reconciliation, support and rollback. Document any spend limits that are operational rather than programmatically enforced; do not advertise nonexistent caps.

Monitor paid-but-unfulfilled orders, duplicate/rejected payment evidence, opening age, payout reconciliation, webhook retries, 429/5xx rate and latency. A kill switch should stop new purchases without abandoning already paid orders. Keep a receipt-based recovery runbook and inspect recoverable state before refunding.

## Release checklist

Before sharing a customized repository, exclude env files, credentials, customer records, operator notes and private integration hooks. Check Git history as well as current files. Confirm your license and asset usage rights, run dependency/secret scans, and use the private reporting process in [SECURITY.md](../SECURITY.md). Publishing source does not complete deployment, provisioning or live-payment acceptance.
