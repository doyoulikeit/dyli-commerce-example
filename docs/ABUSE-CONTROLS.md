# Protect your storefront

The example uses shared counters in **DYLI's existing Supabase**, accessed through
the server-only Commerce key. No Redis account, Supabase credentials or additional
database setup is needed in your storefront. Counters work across server instances
and restarts; they are not a process-memory fallback.

## Before deploying

Your connected DYLI API must support `POST /storefront/limits`. This is a separate
protection lane, not part of your normal Commerce read/write quota. It increments
a request counter; it doesn't create a quote, order or payment. The starter never
exposes this endpoint as an arbitrary browser proxy.

Missing API keys, unavailable counters or an older API return `503` and stop the
protected operation. Run `npm run protection:check` before deploying. Unlike
`doctor`, this increments one non-financial counter. No payment is retried.

## Default budgets

| Budget | Limit per 60-second window |
| --- | ---: |
| API reads per client IP | 90 |
| API mutations per client IP | 40 |
| Live requests per verified customer | 90 |
| Actual upstream reads across the storefront | 220 |
| Actual upstream writes across the storefront | 80 |
| Protection checks per Commerce key | 1,800 |

Upstream budgets count server-rendered requests and fan-out calls too, so rotating
IPs or requesting many uncached catalog pages can't bypass the store-wide cap.
Cached data doesn't consume upstream requests. Calls outside this example with
the same key still consume DYLI's quota; use one key per storefront.

These are fixed windows, so bursts can occur at a window boundary. DYLI's regular
key limits still apply. Test bulk openings, polling, recovery and mobile networks
before launch. Rejected requests return `429` and `Retry-After`. Keep pending
orders recoverable; never resend payments in response to a rate limit.

Vercel's overwritten `x-vercel-forwarded-for` supplies the client IP. On another
host, set `STOREFRONT_CLIENT_IP_HEADER` only to a header your trusted reverse proxy
overwrites, and prevent direct access to the application server. Otherwise all
unidentified clients safely share a bucket. Never trust a shopper-supplied
`X-Forwarded-For`. Only keyed hashes—not raw IPs or customer IDs—go to the counter
endpoint. Expired subject counters are pruned as protection traffic continues.

## Monitoring and edge protection

DYLI logs `storefront_rate_limited` at the first over-limit hit per bucket/window.
The example logs `storefront_rate_limit_unavailable` when protection cannot run.
Connect hosting log alerts to counter failures and sustained `429`/`503` rates.
Also monitor auth failures, DYLI quota and payment recovery failures. Do not put
tokens, addresses or provider response bodies in logs.

Application limits don't stop requests from reaching your hosting bill. Add WAF
limits for `/api/*` and sign-in traffic: log first, review real traffic, test in
preview, then enforce. Avoid blocking legitimate polling, shared-network clients
or checkout returns. This repo doesn't publish WAF rules or connect an alert
destination for you.
