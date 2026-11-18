# Guest demo

Open `/?demo=1` on a running storefront to try the pack experience without signing in. The live homepage and account-connection screen also have **Try demo** links. `NEXT_PUBLIC_DEMO_MODE=true` makes the guest demo the default for the whole deployment.

The demo reads DYLI's live catalog, pack contents, published odds and current buyback values through the server. It uses virtual funds and local choices. It does not create a customer, ask for a wallet signature, charge a card, reserve stock, settle a buyback or request a shipment.

## Try the flow

1. Swipe or browse packs on the homepage. Use the info button for top hits and odds.
2. Pick a quantity and choose Rip or Blitz directly. Checkout uses virtual Card or Balance, starting with $500.
3. Choose **Normal** to rip individual packs, or **Blitz** to skip the buildup. Multi-pulls have a pack grid and **Reveal all**.
4. Select **Vault** or an available **Sell** offer, then confirm the summary. Sales add virtual funds; vaulted pulls appear in Collection.
5. Use the account menu's **Reset demo** to start over. **Exit demo** returns to the live storefront.

Closing or reloading an unfinished opening leaves a **Continue opening** action at the top of the page. It keeps the same simulated pulls and saved choices; finish it before starting another opening. Collection, balance and activity persist in this tab's `sessionStorage`. If browser storage is unavailable, the demo still works in memory. It uses separate keys from live checkout recovery.

## Run locally

Use Node 24+, install with `npm ci`, add your server-side Commerce key to `.env.local`, then run `npm run dev`. Visit [localhost:3000/?demo=1](http://localhost:3000/?demo=1).

A Commerce key is needed for this example's server-side catalog reads. A missing key or a Read-only key cannot populate this Commerce catalog. No Privy login is needed in guest mode. Keep `DYLI_API_KEY` server-side; never use a `NEXT_PUBLIC_` prefix.

## Files to reuse

- `src/components/storefront.tsx`: guest session, simulated checkout, collection and activity.
- `src/lib/demo-pulls.ts`: published-range and available-quantity weighting. Draws are simulated and do not predict future live results.
- `src/components/live-reveal.tsx`: shared Normal, Blitz, multi-pack grid and review presentation for live and demo.
- `src/components/pack-artwork.tsx`: shared 3D opening, poster and reduced-motion fallback.

Guest mode is a presentation demo, not a sandbox for real payment or inventory testing. See [testing](https://www.dyli.io/docs/api/commerce-testing) and the [pack experience guide](PACK-EXPERIENCE.md).
