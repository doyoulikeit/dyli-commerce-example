# Optional UI demo

A session-based collectibles storefront powered by live DYLI data. The catalog, marketplace inventory, box artwork, box contents, published odds, prices, and buyback values come from DYLI; identity, checkout, Collection, and Activity stay in the browser session.

## Demo features

- Live graded and sealed Shop limited to Pokémon and One Piece, with packs, boxes, and bundles
- Live, in-stock Boxes that are not marked for restocking
- Live Box details, chase artwork, inventory, and published odds
- Two-step welcome flow that asks for a name and grants `$500.00`
- Card or Balance checkout simulation with multi-quantity controls
- Immediate Box opening with live range inventory used for each draw
- Keep-to-Collection and sell-to-Balance decisions
- Session Collection, value, and Activity
- Responsive desktop and mobile layouts

No payment or transaction is submitted in POC mode. Every page load seeds the session balance at `$500.00`; simulated purchases subtract from it and sell-backs add funds. Session purchases, pulls, and activity are stored in `sessionStorage`, while the balance refreshes to `$500.00` on reload.

## Configure the demo

```bash
npm ci
# Add NEXT_PUBLIC_DEMO_MODE=true to your existing private .env.local.
```

Keep a server-side **Commerce key** for catalog reads: this example calls Commerce endpoints even in demo mode. A free Read key or missing key won't populate its live catalog. No Privy login is needed for simulated purchases. For a custom UI, mock data needs no key and the Public Read API accepts a free Read key. Optional POC-only address autocomplete settings:

```bash
NEXT_PUBLIC_STOREFRONT_NAME=Vaulted
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
```

Keep `DYLI_API_KEY` server-side. Never expose it with a `NEXT_PUBLIC_` prefix.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data boundaries

- `src/lib/storefront-server.ts` composes the live commerce catalog and public box metadata.
- `src/app/api/boxes/[id]` loads a Box, its published ranges, and the items currently in those ranges.
- `src/components/storefront.tsx` owns the welcome profile, temporary checkout, balance, Box draw, Collection, and Activity for the current browser session.

The Box simulator first selects a live published odds bucket and then selects from that bucket's current DYLI inventory, weighted by the quantity in the Box. It does not use a local prize list.

## Verify

```bash
npm run lint
npm test
npm run build
```

See the [DYLI Commerce documentation](https://www.dyli.io/docs/api/commerce) and [Box API documentation](https://www.dyli.io/docs/api/boxes).
