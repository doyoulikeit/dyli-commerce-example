# DYLI Commerce example

Run your own Box storefront with DYLI's live inventory and checkout.

**[Start here: setup and run](docs/PARTNER-QUICKSTART.md)** · [Commerce overview](https://www.dyli.io/docs/api/commerce)

## Available in v1

Commerce v1 is **boxes-only**, with vaulting, sell-backs and physical redemptions: sign in → choose 1–10 of one box → pay → open → Vault or Sell. Eligible vaulted items can be shipped through a separate checkout.

Card and Abstract USDC balance payments are built in. A custom checkout can accept
other crypto through a swap or bridge, then settle the exact quote in Abstract USDC
with payer authorization. See [custom payments](docs/PAYMENT-OWNERSHIP.md).

The balance popup also supports direct **Abstract USDC deposits and withdrawals**:
copy/scan the wallet address to deposit, or enter a recipient and amount, review,
then confirm a withdrawal. It reuses the key-discovered token/network and existing
paymaster configuration—no additional environment variables. This is a transfer
on Abstract, not a bank cash-out or cross-chain bridge. Pending withdrawals are
saved per wallet and checked against on-chain receipts before another send.

Coming soon: secondary marketplace listings and offers, P2P trading and eBay integration. These are not live Commerce v1 features; optional demo screens don't enable them.

## Quick setup

Use Node 24+. Register a **Commerce** key at [dyli.io/requestapi](https://www.dyli.io/requestapi) with a DYLI Pro developer account.

```sh
npm ci
cp .env.example .env.local
# Fill in your key and the login section matching your registration.
npm run doctor
npm run dev
```

If an env file already exists, edit it instead of overwriting it. Open [localhost:3000](http://localhost:3000).

The key discovers your app; **no slug or API URL setting is needed** for production. Your own Privy login also needs its app ID, server secret and registered HTTPS storefront origin. Existing-login adapters and optional managed login are covered in the [quickstart](docs/PARTNER-QUICKSTART.md).

Want your own wallet RPC? Set the optional `NEXT_PUBLIC_ALCHEMY_API_KEY` to your own Abstract-enabled Alchemy app key. The example builds the URL for you; otherwise it uses Abstract's public RPC. See the [quickstart](docs/PARTNER-QUICKSTART.md#2-set-up-the-repo) for browser-key restrictions.

Optional server settings: `INCLUDED_IDS` selects your boxes; `FLAT_FEE` or `PERCENT_FEE` adds your customer fee (including zero). Commerce earns a 10% settled profit share, with your added fee reported separately in DYLI → Storefront → Commerce. See [boxes, fees and earnings](docs/PARTNER-QUICKSTART.md#4-choose-your-boxes).

## Live or demo?

- `NEXT_PUBLIC_DEMO_MODE=false`: real accounts, production money and inventory by default—even on localhost.
- `NEXT_PUBLIC_DEMO_MODE=true`: non-paying [UI demo](docs/DEMO-MODE.md), using live catalog data.

A lab needs a separately provisioned URL and key. Copying this repo does not create one.

**A passing doctor check is not end-to-end certification.** Test login, payments, wallet gas, openings, sell-back and any shipping before inviting paying customers.

Before deployment, run `npm run protection:check`. The example uses DYLI's
Supabase-backed request limits with the same API key—no extra database credentials.
If protection is unavailable, requests fail closed. Configure host-level limits
and alerts using the [abuse-control guide](docs/ABUSE-CONTROLS.md).

## When you need more

- [Before launch](docs/PILOT-LAUNCH.md)
- [Security and private vulnerability reports](SECURITY.md)
- [Keep your existing login](docs/EXISTING-AUTH.md)
- [Own payment processor or app balance](docs/PAYMENT-OWNERSHIP.md)
- [Live integration and recovery](docs/LIVE-INTEGRATION.md)
- [Server SDK](sdk/README.md)

```sh
npm run lint
npm test
npm run build
```

## License

[MIT](LICENSE) for the code and documentation. [Branding and inventory artwork](NOTICE.md)
have separate rights. See the [dependency review](docs/DEPENDENCIES.md) before launch.
