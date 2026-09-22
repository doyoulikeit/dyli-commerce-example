# Isolated live-UI verification

This harness renders the actual live React components and commerce hook with an
explicitly simulated wallet and API. Catalog artwork and metadata are read-only
snapshots from a local starter server. It is not imported by the application.
Do not treat its selected test rewards, payment receipts, rates or holdings as an
integration with the actual DYLI gacha engine.

1. Run the starter's read-only dev server on port 3107.
2. Install `esbuild` into a temporary directory, outside either repository.
3. Set `ESBUILD_PACKAGE_PATH` to that installation's `esbuild/lib/main.js` and
   `VERIFY_OUTPUT` to a temporary output directory.
4. With Node 24+, run `node tests/browser/server.mjs`. Open localhost:3108 in an
   isolated browser profile. The fixture wallet, API writes and shipping RPC are
   local simulations; only catalog reads go to port 3107.

Check at 390×844 and 1440×1000:

- Box details always precede checkout; quantity offers 1–10.
- A two-box balance purchase sends one ERC-20 transfer, then one prepaid Box buy.
- Sequential reveals accept one Sell and one Vault; one finalization follows.
- The fixture account changes from $500 to $482.50 after $30 spent and $12.50 sold.
- The selected vaulted collectible opens its own details and shipping picker.
- Address completion leads to selectable UPS/USPS fixture rates, then review.
- The already-approved shipping path sends one transaction and confirms it.
- Closing success opens Shipments; fulfillment imagery and statuses are visible.
- Mobile sheets occupy the full viewport width; no horizontal page overflow.

The fixture does not certify real authentication, Stripe redirects/webhooks,
testnet contracts, shipping approval receipts, carrier fulfillment, or payout
liquidity. Those require the acceptance checklist in `docs/LIVE-INTEGRATION.md`
and a separately provisioned lab or an explicitly approved production test.

## Reveal and activity preview

With the same temporary esbuild settings, run
`VERIFY_VIEW=reveal node tests/browser/server.mjs` and open `http://127.0.0.1:3109`.
This view reads public Slab Starter artwork directly from DYLI; no local starter
server or credentials are required. All outcomes and callbacks are isolated
presentation fixtures, not real purchases or gacha draws. Restart the preview
server after editing components; it bundles once on startup.

- `?quantity=1`, `?quantity=3`, or `?quantity=10`: pre-buy Normal/Turbo settings,
  full-screen reveal, top-right Skip, editable Sell/Vault review.
- `?quantity=3&error=1`: confirmation failure with choices preserved.
- `?activity=1&quantity=3`: expandable quantity, pull imagery and sale outcomes.
- `?progress=1`: compact, non-dismissible progress panel.
- `?details=1`: full-screen desktop box details with the original mobile sheet;
  fixture prices, odds and art come from the public range response.

Check phone and desktop sizes. Settings are saved under a fixture-only wallet key;
reload to check persistence. No settings appear in the paid reveal. Turbo skips the
clues and preselects only opted-in Commons/Uncommons/Rares with a buyback value.
Auto Skip jumps to the multi-pull summary; Skip alone never decides what to sell or
vault. Saved/manual choices must not be overwritten. Confirmation stays disabled
until every reward has a choice, and no sale settles before confirmation. Check
both single and multiple pulls, all-auto-sell and mixed choices, Back/Skip, and
confirmation failure. Loading disables the current sheet and its background,
without stacking a second progress modal over checkout or reveal.

## Vault offers preview

With the temporary esbuild settings above, run `VERIFY_VIEW=offers node tests/browser/server.mjs`
and open `http://127.0.0.1:3110`. No local starter or credentials are needed; all RPC,
offers, approvals and wallet sends are simulated. The actual Vault item sheet shows
a dollar offer, expiry, Sell, and a small Ship link.

Check `?approval`, `?empty`, `?expired`, `?rejected`, `?uncertain`, and `?recording`.
Clear this fixture origin's local storage between independent cases. For recovery,
close and reopen the item in the same page: an uncertain sale must never send again.
A successful sale updates the fixture balance from $100 to $175 and removes the item.
Check desktop and phone widths and inspect `window.fixtureAudit` for duplicate sends.

## Shipment tracking preview

Run `VERIFY_VIEW=shipping node tests/browser/server.mjs` with the same temporary
esbuild settings and open `http://127.0.0.1:3111/?tracking`. The actual shipment
activity component renders two fixture orders merged into `ESUS360467167`.
Verify one tracking link, the In transit status, and the last-update time at
desktop and phone widths. The link opens the matching Track My Shipment page
in a new tab; no carrier number is required. This is simulated tracking data.

## Balance preview

`?balance` uses the actual balance sheet with a fixture wallet (never a real send).
Verify the deposit QR remains full-sized, the network warning and full address are
visible, and withdrawal requires an amount/recipient review before confirmation.
The fixture wallet starts at 10.123456 USDC. `?balance&pending=1`,
`?balance&rejected=1`, and `?balance&uncertain=1` exercise receipt waiting, rejected
signing, and ambiguous broadcasts. Its recovery key is scoped to the isolated
`0x1111…1111` fixture wallet. Production deposits and withdrawals must be tested
with explicit approval using a small real balance; this fixture cannot certify
live paymaster availability or move tokens.
