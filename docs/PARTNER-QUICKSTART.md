# Run your Box storefront

This path uses the [full storefront example](https://github.com/doyoulikeit/dyli-commerce-example), your own Privy login, and embedded card checkout plus an Abstract USDC balance. Commerce v1 includes boxes, vaulting, sell-backs and redemptions.

## 1. Register your app

At [Create an API key](https://www.dyli.io/requestapi), use a DYLI Pro developer account and choose:

- **Commerce API** and a website/storefront.
- **Use your own Privy app** for a new storefront.
- **DYLI-hosted checkout and balance** for payments.

Enter your company, use case and HTTPS storefront domain. A temporary Vercel deployment you control is fine; your finished site doesn't need to be live yet. The domain controls checkout returns, not just DYLI's records. [Request a domain change](https://www.dyli.io/docs/api/commerce-support#domains-and-login) before switching to your launch URL. Save the Commerce key; it identifies the app automatically.

Create a dedicated Privy app for your storefront and register its allowed domains. Keep its server secret private. You do not need DYLI's Privy app or your own Stripe account.

**Already have login?** Choose “Use your own login” and connect the [client/server adapters](EXISTING-AUTH.md).

**DYLI-managed login:** [Contact us to activate](https://www.dyli.io/requestapi?inquiry=managed_login#commerce-support). We set up a separate Privy app for your storefront, not shared DYLI sign-in. The example reads the public app ID and approved domains from bootstrap. You don't need a Privy secret for this option.

If `auth.available` is `false`, keep login disabled and contact support. Catalog access can still work. To change an existing app's login provider, [send a request](https://www.dyli.io/requestapi?inquiry=domain_login#commerce-support). Rotating the key won't change it.

## 2. Set up the repo

Use Node 24 or newer:

```sh
git clone https://github.com/doyoulikeit/dyli-commerce-example.git
cd dyli-commerce-example
npm ci
cp .env.example .env.local
```

If you already have `.env.local`, edit it instead of overwriting it. For this own-Privy path, fill in:

```dotenv
DYLI_API_KEY=YOUR_COMMERCE_API_KEY
NEXT_PUBLIC_PRIVY_APP_ID=YOUR_PRIVY_APP_ID
PRIVY_SECRET_KEY=YOUR_PRIVY_SERVER_SECRET
STOREFRONT_ORIGIN=https://your-storefront.example
NEXT_PUBLIC_DEMO_MODE=false
```

Replace the placeholders. Use the HTTPS origin registered with DYLI and Privy, with no path or trailing slash. Keep the env file out of Git.

**No API URLs or slug setting are needed.** Commerce calls default to `https://www.dyli.io/api/commerce/v1`; catalog enrichment uses `https://www.dyli.io/api/public/v1`. Both use the server-side key.

`false` is live integration with **real production money and inventory**. To explore the non-paying UI first, set `NEXT_PUBLIC_DEMO_MODE=true`; Privy is not used in that mode. The example still needs a Commerce key for its live catalog. For a custom UI, you can use mock data without credentials or the Public Read API with a free Read key; Read keys cannot call Commerce.

**Optional: your own Alchemy RPC.** Create an [Alchemy app with Abstract enabled](https://www.alchemy.com/docs/docs/reference/abstract-api-quickstart), then uncomment `NEXT_PUBLIC_ALCHEMY_API_KEY=` in `.env.local` and paste your app's key. No RPC URL is needed; the wallet uses DYLI's network. Leave it unset to use Abstract's public RPC. This is a browser-visible key, so use a dedicated app and [restrict its allowed domains](https://www.alchemy.com/docs/docs/how-to-add-allowlists-to-your-apps-for-enhanced-security), including localhost when testing. Never use an Alchemy admin access key. Server balance reads use the public RPC independently; `.env.example` has a separate advanced override for those. Gas sponsorship still comes from DYLI, not Alchemy.

## 3. Check and run

```sh
npm run doctor
npm run dev
```

Open [localhost:3000](http://localhost:3000). Doctor only makes GET requests. All checks should pass before you test live checkout.

Allow localhost in Privy to test locally. **Card checkout returns to the page you started from**, including localhost or 127.0.0.1. Remote return domains must be registered with DYLI. Localhost still uses real production payments and inventory by default.

## 4. Choose your Boxes

For a storefront dedicated to your own boxes, add this optional server setting:

```dotenv
INCLUDED_IDS=12997,12998
```

Use real box IDs, separated by commas. Omit it to show all boxes permitted for
your app. The home page, Boxes catalog, detail route and new quotes respect it.
It never grants access to a box excluded by DYLI's app-level allowlist.

### Earnings and your fee

Every Commerce app earns **10% of its settled box profit** automatically. Profit
means base box sales minus cash buybacks and the cost of items customers keep.
A bought-back item is not also charged as an item cost.
Losses offset gains; unfinished or test purchases earn nothing.
Your DYLI profile → Storefront → **Commerce** shows orders, quantities, buybacks,
item costs, profit and earnings. Use the normal **Claim** tab to withdraw available earnings.
Key rotation preserves the history.

Optionally charge customers an additional fee. Choose one server env setting:

```dotenv
FLAT_FEE=2
# OR: PERCENT_FEE=5
```

`FLAT_FEE=2` adds $2 **per box**: two $35 boxes show Items $70, **Platform fee
$2 × 2 = $4**, total $74 before any card-processing charge. `PERCENT_FEE=5`
adds 5% of the box subtotal instead. Both Balance and Card collect the complete
server-priced total. Your fee is recorded separately and paid out through DYLI
earnings; no separate Stripe account is required. Set one value to `0` for no
added fee. Leave both unset to inherit the app's saved fees (zero by default).

Restart local dev or redeploy after changing these settings. The starter refuses
to start a payment if DYLI does not confirm the configured fee.

### App-wide configuration (advanced)

The app's saved config controls branding, box access and fees. For marketplace and P2P, [configure community settings](MARKETPLACE-AND-TRADING.md). To preview a box-focused setup with zero partner fee:

```sh
npm run pilot:configure -- --name="My Box Shop" --box-id=YOUR_BOX_ID
```

Replace the ID with a real positive integer from the catalog. Repeat `--box-id` for more Boxes. This is a dry run; add `--apply` only after reviewing the target environment and preview. An empty API allowlist means all Boxes, not none.

A zero partner fee does not remove the Box price, card processing or shipping. Gas sponsorship is discovered from DYLI's bootstrap; this starter requires it before checkout. Paying by card does not fund gas automatically.

**Next: [test before launch](PILOT-LAUNCH.md).** A successful doctor check is not an end-to-end payment test.
