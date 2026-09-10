# Small server-side Commerce client

Copy this directory into a Node 24+ backend, or use the full Next.js starter. There are no runtime dependencies and no package install beyond Node's built-in fetch. TypeScript declarations accompany the module. Do not import it into browser or native app bundles.

```js
import { createCommerceClient } from './commerce-client.mjs';

const dyli = createCommerceClient({
  apiKey: process.env.DYLI_API_KEY,
  baseUrl: process.env.DYLI_COMMERCE_BASE_URL, // optional assigned lab
});
const configuration = await dyli.bootstrap();
const readiness = await dyli.readiness();
```

The key identifies its registered app on every request; `configuration.partner.slug` is discovered automatically. No slug or preliminary lookup is required for other endpoints. Existing integrations may still pass `partnerSlug` as an optional assertion: DYLI rejects a mismatch, including another app under the same owner. Caller-supplied tenant headers cannot override the SDK configuration.

For managed sign-in, forward the caller's access token from your authenticated HTTP handler to `dyli.verifySession(token, requestedWallet)`. Use the returned identity to derive the customer ID and wallet; do not use a browser-provided customer ID. Never log the token.

For a server-validated purchase:

```js
// Resolve customer identity first, then sync it with PUT /customers/{id}.
// Keep a durable operation ID across requests/retries. Do not generate one here on retry.
const result = await dyli.quote({
  external_customer_id: verifiedCustomerId,
  items: [{ ...catalogItem.purchase.quote_item, quantity: 1 }],
}, `quote:${operationId}`);
```

The item must come from the allowed catalog. The API computes price/fees and validates availability. A Box quantity may be 1–10; other live product types currently require one. For cards use `stripeCheckout(quoteId, body, key)`; for verified USDC use payer authorization then `createOrder(body, key)`. `openBox(orderId, key)` starts or resumes an already-paid Box order; it does not sign wallet transactions or create payment evidence.

Use `request('/box-plays/...')` for the documented buy/results/decision/finalize states. Always preserve transaction hashes and idempotency keys. A timeout is not proof of failure. Errors expose HTTP status and DYLI's request ID for support; secrets never belong in logs.

See the authoritative [Commerce API](https://www.dyli.io/docs/api/commerce) and its OpenAPI document. The SDK intentionally does not invent a second payment state machine, silently retry money movements, or wrap third-party receipts into a paid flag.
