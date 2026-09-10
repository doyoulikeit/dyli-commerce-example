# Live Commerce starter

Use `NEXT_PUBLIC_DEMO_MODE=true` to explore the UI without payments. That mode rejects every real-money local API route. `false` uses authenticated accounts, real wallet balances, server quotes, verified payments, gacha outcomes and redemption records. Production is the default API environment, including on localhost. An isolated lab is available only if DYLI separately provides its URL and key. Demo balances and collections never become live assets.

## Run locally

Use Node 24+, `npm ci`, and the [partner quickstart](PARTNER-QUICKSTART.md). The recommended new-storefront setup uses your own Privy app; existing-login adapters and separately activated DYLI-managed login are alternatives. The Commerce key identifies the registered app without a slug setting. Bootstrap provides public network, sponsorship and presentation settings. Private credentials stay on their owning backend. DYLI's Abstract paymaster is discovered automatically; the starter blocks new checkout if it is unavailable.

Card checkout returns to the page that initiated checkout, preserving its path and query. The server validates remote origins against DYLI registration; localhost, 127.0.0.1 and IPv6 loopback are also allowed for development. This changes navigation only, not payment mode. Register local URLs with your login provider as well. `STOREFRONT_ORIGIN` is a fallback for clients that omit a return URL. The API never trusts a request Host header to authorize redirects.

An unpaid card checkout can be cancelled from the saved-purchase banner. DYLI expires the Checkout Session at Stripe before the starter clears recovery. Paid, processing, or uncertain payments remain saved. This is not a refund; use Continue to recover a completed purchase.

Normal card checkout is embedded in the starter. DYLI creates the Stripe session and returns its publishable key; no Stripe secret or extra publishable-key env is required in the starter. Card data goes directly to Stripe. The completion callback calls the authenticated confirmation route, which verifies payment server-side before opening boxes. A bank authentication step may still redirect back to the current storefront URL. Closing the sheet saves the purchase; Continue restores it, and Cancel expires only an unpaid checkout. Session client secrets are kept in memory, not localStorage.

`npm run dev` starts the app. `npm run build`, `npm run lint` and `npm test` check the starter without authorizing live payments. Production launch also needs an approved end-to-end payment test; a passing build is not payment certification.

## Small integration boundary

- `src/lib/dyli.ts`: server-only DYLI fetch client. The API key never reaches the browser; DYLI resolves its app binding. Redirects are rejected; requests time out.
- `src/lib/privy-server.ts` / `live-server.ts`: verify the caller and their wallet, derive the external customer ID, and check resource ownership. Privy is replaceable; never accept an unverified browser customer ID.
- `/api/checkout`: quote, read authoritative quote, embedded Stripe, payer authorization, verified USDC order. Price and fee come from DYLI, not the DOM or saved browser data.
- `/api/box-plays`: one paid order → one batch of up to 10 → real ordered rewards → per-pull Vault/Sell → receipt confirmation. No client RNG and no legacy flip contracts.
- `/api/session`: real holdings, balance, orders and redemptions. Account lists currently fetch their first 100 entries; add pagination for larger portfolios.
- `/api/redemptions`: ownership, address validation, live rates, exact USDC approval, customer transaction and confirmation. “Completed” means the redemption was recorded, not that a carrier has delivered it.

The live UI and the simulator are separate components. Shipping and payment records remain authoritative on DYLI. Browser storage contains only recovery/display information; it is never evidence of payment or ownership.

Public catalog composition is cached for one minute using a server-only partner/configuration fingerprint. Balances, account records, quotes and mutations are not cached. The existing non-Cache-Components Next.js configuration is retained; the cache identity explicitly includes its environment/configuration closures.

## Partner branding, catalog and fees

Set the name and catalog rules using `/config` or the dry-run-first `npm run pilot:configure` helper. The live site discovers branding and Box-only navigation; local presentation overrides are optional. Configure `catalog_rules.allowed_box_ids` with actual gacha product IDs and disable unwanted surfaces. The API enforces the allowlist at quote time. A frontend filter is not a security boundary. No change to DYLI's database or inventory schema is needed by the integrator.

For local storefront overrides, use server-only `INCLUDED_IDS=12997,12998` and
either `FLAT_FEE=2` (per box) or `PERCENT_FEE=5` (percent of subtotal).
See [setup examples](PARTNER-QUICKSTART.md#earnings-and-your-fee). Fees are injected
by `/api/checkout`, not accepted from browser input. DYLI snapshots `fee_rules`
on the quote, calculates cents, and collects the entire total through either
USDC or Stripe. Retries use that same immutable quote. A missing fee-capable API
response blocks payment rather than silently omitting the fee.

`PATCH /config` with `{"fee_rules":{"enabled":false}}` remains a zero-fee wrapper.
Existing app-level fixed rules remain **per order**; set `per_unit: true` for
per-box pricing. Env overrides use `per_unit: true`. Zero never removes the box
price, Stripe processing, gas or shipping. Do not expose the Commerce key or
allow a shopper to submit fee settings.

DYLI allocates 10% of settled box profit (base sales minus cash buybacks and
kept-item costs) to the key owner, plus collected added fees.
A bought-back item incurs the cash buyback only, not an additional item cost.
Claiming uses DYLI's existing
verified earnings and withdrawal reservations, not a separate starter balance.
`GET /analytics` is a private, server-to-server app report; never proxy it to
ordinary customers. The profile report aggregates the owner's apps and retains
history across rotated/revoked keys. Additional fees do not increase the profit
share base; incomplete and non-paying test purchases are excluded.

## Payment choices

DYLI-managed Stripe is embedded by default; eligible devices may use Apple Pay. The completion callback or redirect is not proof of payment: the server resolves/validates the Checkout Session and confirms the DYLI order. DYLI independently verifies its webhook.

Balance means the customer's real Abstract USDC. This starter sends the exact quote total once, then signs DYLI's payer-bound intent. Do not substitute a fake balance or `paid` flag. For a native app using your own Apple Pay or ledger, verify/debit it on your backend and settle DYLI from your treasury using Commerce's USDC flow. The treasury payer and the customer's delivery wallet may differ. Your backend owns your processor's refunds/disputes/reconciliation; arbitrary third-party receipts are not DYLI settlement.

Claims and sell-back USDC settle to the registered customer wallet, not automatically to your treasury or app ledger. If you maintain a separate balance, reconcile the confirmed settlement before crediting it. A reveal or a selected Sell button is not a payout. This starter requires Web Locks support for new balance payments and shipments so another browser tab cannot race the same wallet operation.

## Recovery and remaining launch gates

Payment and opening IDs/hashes are saved before the next request. A wallet-wide Web Lock prevents parallel tab submissions. A restored quote is re-read from the authenticated server before transferring. An uncertain broadcast is stopped for receipt recovery rather than resent. A refreshed/restarted gacha authorization is identified by `opening_reference`; clearing old opening hashes does not create a new payment.

Do not enable paid checkout until the DYLI environment reports the required product/payment capability. Non-Box fulfillment still requires DYLI's configured executor (or explicitly managed queue); this starter does not fabricate completed holdings. Listing/offer creation is not a live capability of Commerce 1.2 and is intentionally not simulated in live mode. Refunds and unexpected paid-but-unfulfilled orders require operator reconciliation. Existing POC listing/offer interactions remain POC-only.

Before launch, exercise lab Stripe webhook plus return-page recovery, EIP-1271/EOA balance authorization, batches of 1/10, mixed Vault/Sell, expiry restart, two tabs, address changes, shipping approval/retry and the real resulting holdings. No production migration, deployment, charge or transaction is performed by the local verification suite.
