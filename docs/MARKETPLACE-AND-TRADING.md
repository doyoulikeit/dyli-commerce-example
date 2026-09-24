# Marketplace and trading

Marketplace appears below Boxes on the homepage. Choose **View all** to browse listings and offers, search, filter by brand or type, set a price range, and sort by price. **My listings** and **My offers** show your open orders. Click a collectible to buy, make an offer, or manage your own listing. From the vault, choose **List for sale** or **Trade**. Trades has a collector search, an item-and-cash composer, incoming requests and sent/history views.

Activity shows your marketplace and trade actions with item images, quantities and transaction status.

Desktop filters sit beside the listings. On mobile, **Filters** opens a bottom sheet. Choose your filters and tap **Show results** to apply them, or close the sheet to keep your current results.

These are real transactions, not demo balances. Both use DYLI's existing Abstract contracts. Customers sign with their own wallet. Marketplace payments and optional trade cash are Abstract USDC. Card checkout remains available for boxes, not these peer transactions.

## Choose your community

Add any settings you want to change to `.env.local`:

```dotenv
MARKETPLACE_ENABLED=true
TRADING_ENABLED=true
INCLUDE_DYLI_MARKETPLACE=false
INCLUDE_DYLI_COLLECTORS=false
```

Restart locally or redeploy after editing. The running server applies these explicit settings to your DYLI app automatically. Unspecified settings stay unchanged. No separate setup command is required. The browser cannot change the owner settings.

Use the same settings in each deployment that shares a Commerce key. These settings belong to the app, not an individual deployment. To preview them without saving:

```sh
npm run community:configure
```

You can also save manually with `npm run community:configure -- --apply`. Both paths use `PATCH /config`; neither makes purchases. Server checks are coalesced and cached briefly, and only differing settings are written. Builds do not update app configuration.

- **Include DYLI marketplace:** show and transact against outside DYLI listings and offers. Off means only orders created through this Commerce app.
- **Include DYLI collectors:** find and trade with collectors outside this app. Off means people synchronized as customers of this app.
- **Marketplace / trading enabled:** turn off new actions and discovery for that feature. Existing receipt confirmation remains available.

Both inclusion settings default off. They are discovery settings, not privacy controls. Listings and offers created here always appear on DYLI. Trades are stored in DYLI's normal trade inbox and activity, including trades with DYLI collectors. On-chain activity is public.

With DYLI collectors off, your inbox only includes trades with this app's customers or created through this app. Your app's existing trades stay in its history when you turn broader discovery off.

The app reads `capabilities.community` to decide which navigation to show. If a feature is unavailable, contact DYLI through the [Commerce help page](https://www.dyli.io/docs/api/commerce-support). Your key alone cannot turn on a platform capability that has not been activated.

## Payments and recovery

Your backend verifies login and supplies the customer's ID. DYLI prepares the exact transaction after checking the order, wallet, ownership and app settings. The customer may first approve item transfers or the required USDC amount.

The example saves each attempt and transaction reference before moving on. A slow response does not start another purchase. Reopen **Review action** to check the existing receipt. If a wallet submission has an uncertain result without a reference, check wallet history before doing anything else.

Listings and offers expire after the chosen period. Preparation does not reserve items or funds. Offers currently cover one item; listings support up to 20 copies. Trades support up to 20 different items per side, up to 20 copies of each, and cash on one side only. Diamonds remain a DYLI-native feature.

DYLI's native marketplace fees apply. Box `FLAT_FEE`, `PERCENT_FEE`, and the box profit share do not add a fee or earnings share to marketplace orders or trades.

## Before inviting customers

Use two test customers to list, buy, make and accept an offer, send and accept a trade, and cancel an unaccepted trade. Verify both vaults, balances, and DYLI visibility. Repeat with each inclusion setting off, then on. Test a page refresh after submission and verify that confirmation does not send a second transaction. Do not use production funds for these checks unless you intend to make real purchases.
