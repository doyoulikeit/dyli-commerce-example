# Login and wallets

You need a Commerce key for your app and a Base wallet for each customer. These are separate things.

- Your API key lets your backend call DYLI.
- Your login tells your app who the customer is.
- Their wallet holds their items and USDC, and signs actions.

Customers do not need DYLI Pro or a separate DYLI login. Only the developer needs Pro for a Commerce key.

## Choose your setup

| What you have | What to do | Need DYLI to set up Privy? |
| --- | --- | --- |
| Login and Base wallets | Keep both. Connect the [client and server adapters](EXISTING-AUTH.md). | No |
| Login, but no wallets | Create your own Privy app. Connect your login to Privy's JWT login and add embedded wallets. Choose existing login and your own embedded-wallet provider in DYLI. | No |
| No login or wallets yet | Create your own Privy app for both. Follow the [quickstart](PARTNER-QUICKSTART.md). | No |
| You want DYLI to run the wallet provider | Request managed setup in [Commerce setup](https://www.dyli.io/requestapi#commerce-setup). Wait for activation. | Yes |

Privy is a wallet provider. It can create a wallet inside your app when someone signs in. They do not need to install a wallet extension.

Privy's JWT login currently needs their Scale plan. Check their provider requirements before choosing it for an existing login.

Already using another Base wallet provider? Keep it. Privy is optional.

## Connect a customer's wallet

1. Your backend checks the customer's login and uses their stable customer ID.
2. Register their wallet once. DYLI returns a message for that wallet to sign. Confirm the signature through your backend.
3. Use the same customer ID and wallet for checkout, openings, holdings and shipping.

The example shows **Connect wallet** if a new wallet needs registration. This signs a message. It does not charge the customer.

DYLI links the wallet to a customer profile and tracks their pulls, holdings and orders. One wallet cannot be linked to two customer IDs in the same app. Buyback USDC goes to that customer's wallet. If your app uses its own credits, you track those credits.

## Who pays gas?

Gas is the small network fee for sending a transaction.

With DYLI-managed wallets, DYLI pays gas for pack openings, sell-backs, marketplace actions, trades, gifts, USDC withdrawals and shipping. Customers do not need to add ETH. The example automatically sponsors its supported wallet actions.

Customers still pay the pack price, purchase price or shipping charge. Sponsorship covers the network fee.

With your own wallets, arrange sponsorship with your wallet provider or fund Base ETH for gas. The example's existing-login adapter needs to connect your provider's sender.

The example uses Base mainnet, chain ID `8453`. Base Sepolia, `84532`, is only for a separately supplied test lab. Demo mode simulates the UI and does not create a lab.

[Wallet registration API](https://www.dyli.io/docs/api/commerce-reference#customer-wallet-registration) | [Gas fees](https://www.dyli.io/docs/api/commerce-wallet-sponsorship)
