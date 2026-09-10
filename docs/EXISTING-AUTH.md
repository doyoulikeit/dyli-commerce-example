# Keep your existing login

An exchange, mobile app, or storefront does not have to adopt Privy to use DYLI. Choose **Use your own login** when registering your Commerce app. The developer needs DYLI Pro; customers do not need DYLI accounts or Pro subscriptions to authenticate in your app.

Your backend authenticates the customer. Its app-bound DYLI Commerce key authorizes server-to-server requests. DYLI still verifies payments, wallet signatures, ownership, and order state. An API key is not permission to invent a wallet balance or mark an arbitrary payment as confirmed.

## Two adapters in the full example

1. `src/components/partner-auth-adapter.tsx`: connect your existing sign-in/out, access-token retrieval, and wallet SDK to the `CommerceAuth` interface in `commerce-auth.tsx`. It supplies the active wallet, chain switching, transaction submission, and message signing. The transaction hook continues to validate chain/from/to/data/value before invoking your wallet.
2. `src/lib/partner-identity.ts`: implement `verifyPartnerIdentity` using your provider's **server-side verifier** and trusted customer/wallet records. Return the verified stable `userId`, `externalCustomerId`, linked `walletAddress`, optional name and email. This file is server-only. Every protected local route calls this verifier before touching a customer or order.

Both adapters intentionally fail closed until implemented. They are extension points, not a fake login or a production integration for an unknown provider. The standard Privy adapters remain available for the other two onboarding choices; the live commerce hook no longer calls Privy directly.

The DYLI connection is just `DYLI_API_KEY`. DYLI discovers the application and slug from that key. Your existing auth system can use its own existing config; do not copy its secrets to DYLI. Bootstrap selects `existing` automatically from your registered application, so another DYLI auth env selector is unnecessary.

## Security requirements

- Verify signatures, issuer, audience, expiration, and revocation/session validity with your provider's server SDK. Decoding a JWT is not verification.
- Resolve the wallet from trusted linked-wallet records. Never establish ownership from `walletAddress`, email, a customer ID, or unsigned local storage sent by the client.
- Keep external IDs stable and unique within the app. Prefix them by issuer when integrating several providers. Preserve wallet binding after a quote/payment; a wallet change must not redirect an existing order.
- The example sends bearer tokens to its own API. If you adapt it to cookies, include credentials and enforce CSRF/origin protections on every mutation; verify the session server-side.
- Use only approved checkout return origins. Production must not derive redirects from an untrusted Host header.
- Never expose DYLI's API key in a mobile binary or browser. Mobile clients call your backend.
- Treat wallet signing as a separate integration. Existing login does not automatically supply a wallet, gas or signing authority. Preserve user confirmation and validate supported chains/contracts.
- Test expired/foreign-user tokens, unlinked wallets, cross-account orders, duplicate submissions, and interrupted purchases in an isolated lab.

## Payments stay separate

You can keep your own card checkout, Apple Pay, or ledger. Your backend verifies that customer payment and separately settles DYLI through the supported treasury USDC flow. A receipt string or `paid: true` is not settlement proof. You own refunds/disputes in your processor, and sell-back USDC goes to the registered customer wallet unless your separately reviewed product handles reconciliation.

For fewer moving parts, use DYLI-managed Stripe checkout, embedded in the example, or customer-wallet USDC. See [payment ownership](PAYMENT-OWNERSHIP.md). A requested payment preference does not activate a processor or remove readiness checks.
