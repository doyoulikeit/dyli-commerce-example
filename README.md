# DYLI Commerce example

Run your own collectibles storefront with DYLI's live inventory, checkout, marketplace and trading.

**[Choose login and wallets](docs/WALLETS.md) | [Setup and run](docs/PARTNER-QUICKSTART.md)** · [Commerce overview](https://www.dyli.io/docs/api/commerce)

## Available in v1

Commerce includes packs, vaulting, sell-backs, shipping, secondary marketplace and P2P trading. Open 1-10 of a pack, buy or list collectibles, make offers, trade items and ship from the vault.

When the connected API reports `capabilities.post_vault_offers.ready`, opening an
item in **Vault** also shows its available DYLI buyback amount, expiration and
**Sell for …** button alongside Ship. The customer signs in their existing wallet.
Initial eligible buybacks keep the original price and 48-hour deadline; later
offers keep DYLI's normal rules. Sale IDs/hashes are saved for recovery, and
Activity can resume confirmation even after an item leaves the vault.

Card and Base USDC balance payments are built in. A custom checkout can accept
other crypto through a swap or bridge, then settle the exact quote in Base USDC
with payer authorization. See [custom payments](docs/PAYMENT-OWNERSHIP.md).

The balance popup also supports direct **Base USDC deposits and withdrawals**:
copy/scan the wallet address to deposit, or enter a recipient and amount, review,
then confirm a withdrawal. It reuses the key-discovered token/network and existing
Base network settings. Withdrawals need Base ETH for gas. This is a transfer
on Base, not a bank cash-out or cross-chain bridge. Pending withdrawals are
saved per wallet and checked against on-chain receipts before another send.

The homepage shows Marketplace below Packs, with **View all** for search, filters, offers and your own listings. Shop and Trades use DYLI's existing contracts and the customer's Base USDC wallet. Choose whether to include outside DYLI listings and collectors with [community settings](docs/MARKETPLACE-AND-TRADING.md). The running server applies your explicit env settings automatically. Card checkout is available for packs, not peer transactions.

## Pack experience

The storefront includes DYLI branding, light/dark themes, searchable packs, live hits and odds, and a mobile pack sheet with a fixed checkout footer. Catalog cards stay lightweight; pack previews and openings reuse DYLI’s lazily loaded 3D renderer with reduced-motion and image fallbacks. Bulk review lets customers select vault or available buybacks before one explicit confirmation.

The API now supplies optional public `artwork` metadata for the model, textures and poster. Reuse the renderer and React wrapper in your own app: [pack UI and asset guide](docs/PACK-EXPERIENCE.md).

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

Want your own wallet RPC? Set the optional `NEXT_PUBLIC_ALCHEMY_API_KEY` to your own Base-enabled Alchemy app key. The example builds the URL for you; otherwise it uses Base's public RPC. See the [quickstart](docs/PARTNER-QUICKSTART.md#2-set-up-the-repo) for browser-key restrictions.

Optional server settings: `INCLUDED_IDS` selects your packs; `FLAT_FEE` or `PERCENT_FEE` adds your customer fee (including zero). Commerce earns a 10% settled profit share, with your added fee reported separately in DYLI → Storefront → Commerce. See [packs, fees and earnings](docs/PARTNER-QUICKSTART.md#4-choose-your-packs).

## Live or demo?

- `NEXT_PUBLIC_DEMO_MODE=false`: real accounts, production money and inventory, including on localhost.
- `NEXT_PUBLIC_DEMO_MODE=true`: non-paying [UI demo](docs/DEMO-MODE.md), without customer login. A Commerce key is still required to load this example's live catalog.

A custom UI can start with mock data without a key, or the Public Read API with a free Read key. Read keys cannot call Commerce endpoints, including this example's catalog and bootstrap.

A lab needs a separately provisioned URL and key. Copying this repo does not create one. [Ask DYLI about testing](https://www.dyli.io/docs/api/commerce-support#testing).

**A passing doctor check is not end-to-end certification.** Test login, payments, wallet gas, openings, sell-back and any shipping before inviting paying customers.

Before deployment, run `npm run protection:check`. The example uses DYLI's
Supabase-backed request limits with the same API key. No extra database credentials are needed.
If the counter service is unavailable, requests continue; explicit limits still
return 429, and authentication and DYLI's API quotas still apply. Configure host-level limits
and alerts using the [abuse-control guide](docs/ABUSE-CONTROLS.md).

## When you need more

For managed login, domain changes, payments or testing, use the [Commerce support form](https://www.dyli.io/requestapi?inquiry=other#commerce-support). Sign in to send a request. DYLI emails you a copy, and you can see the status and date in your request history. DYLI-managed setup needs activation. Your own login and wallets, including your own Privy app, are self service. See [login and wallets](docs/WALLETS.md).

- [Before launch](docs/PILOT-LAUNCH.md)
- [Display packs and pulls without cropping](https://www.dyli.io/docs/api/commerce-artwork)
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
