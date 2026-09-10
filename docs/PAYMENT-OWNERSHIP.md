# Payment ownership

The product UI can stay simple while money movement remains explicit. DYLI never accepts a browser assertion that someone paid.

## DYLI-managed checkout

The partner authenticates the customer and obtains an authoritative quote. This starter embeds the Stripe checkout returned by DYLI; custom clients can also request hosted checkout. DYLI owns the Stripe account, webhook signature check, payment verification and order creation. The partner needs no Stripe secret or webhook. After completion, resolve/confirm the session through Commerce; do not trust a success URL or browser callback. Resume the same session/order after a timeout.

Hosted wallet options depend on Stripe/device/domain eligibility. Do not promise that Apple Pay is available on every device or equate a custom native Apple Pay integration with hosted checkout.

## Customer USDC balance

The balance is actual USDC on the network/token returned by DYLI. Send the exact authoritative amount to its prescribed recipient, retain the transaction hash, sign the payer-bound authorization, and submit the order. If sending may have succeeded, recover the receipt instead of transferring again. A wallet signature alone is not payment evidence.

The gacha purchase transaction is separate from paying for the Commerce order. A verified prepaid order permits the customer-action gacha transaction with zero additional onchain purchase cost. The starter discovers DYLI's Abstract paymaster from bootstrap and uses it for supported wallet actions. Checkout stops if sponsorship is unavailable; a card payment does not itself deposit gas into the wallet. Custom clients must use the returned sponsorship settings or supply gas.

## Bring your own payment experience

Customers can start with other crypto too. Your checkout can use a swap or bridge (for example, Relay) to deliver the exact quoted amount in Abstract USDC, then submit the supported payer authorization and settlement transaction. DYLI verifies the final USDC payment, not a swap quote or a bridge's success screen. This example does not include a swap/bridge UI; your integration must handle fees, slippage, delays and failed routes before treating the customer as paid.

Your backend verifies the processor's webhook or atomically debits your ledger, records your durable payment reference, and uses your treasury wallet to settle DYLI's authoritative quote. The treasury signer signs the authorization; the customer's registered wallet receives the items and signs the opening actions. Use `/quotes/{id}/payment-authorization` and `/orders`, not a custom paid flag.

Keep your own durable mapping: customer payment ID → DYLI quote → settlement hash → DYLI order → Box play. Recover by IDs/idempotency keys when responses are lost. Do not automatically recharge, retransmit or refund on an ambiguous response. Check both systems first.

Your backend owns your provider's refunds, disputes, ledger correctness and reconciliation. DYLI owns its verified order and fulfillment state. Sell-back USDC goes to the customer's registered wallet; a partner ledger should credit only after verified settlement, and only under an explicit custody/settlement design. Never credit merely because the user tapped Sell.

## Fees

`PATCH /config` with `{"fee_rules":{"enabled":false}}` produces zero **partner** fee. An enabled fixed fee of zero also works when no minimum is set. DYLI item price, processor fee, gas and shipping remain distinct. The client renders the returned price breakdown; it must not derive the payable total from presentation settings.

## Not part of this starter

Arbitrary third-party payment-confirmation callbacks, automatic processor refunds, a custodial partner ledger, and native Apple Pay certificate/merchant setup are not implemented here. They need an explicit commercial, security and operational design before adding them. This does not block a partner from using its own verified billing plus the supported treasury settlement flow.
