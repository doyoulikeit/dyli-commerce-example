import { apiErrorResponse, commerce } from "@/lib/dyli";
import { authErrorResponse, AuthError } from "@/lib/privy-server";
import {
  customerFor,
  ownedQuoteResponse,
  requireLiveIdentity,
  requestKey,
} from "@/lib/live-server";
import type { ApiRecord } from "@/lib/types";
import { checkoutReturnUrls } from "@/lib/commerce-runtime";
import { loadCommerceRuntime } from "@/lib/runtime-server";
import { boxIsIncluded, storefrontPolicy } from "@/lib/storefront-policy";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApiRecord;
    const identity = await requireLiveIdentity(
      request,
      String(body.walletAddress || ""),
    );
    const customer = customerFor(identity);
    const action = String(body.action || "quote");
    const key = requestKey(body.idempotencyKey);
    if (action === "quote") {
      const item = body.quoteItem as ApiRecord | undefined;
      const quantity = Number(item?.quantity);
      if (
        !item ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > (item.type === "box" ? 10 : 1)
      ) {
        throw new AuthError(400, "Choose 1–10 boxes or one collectible");
      }
      // Only references/quantity go upstream; DYLI checks the partner allowlist,
      // resolves inventory and prices, and calculates fees (including zero).
      const quoteItem =
        item.type === "box"
          ? { type: "box", box_id: item.box_id, quantity }
          : { type: "listing", listing_id: item.listing_id, quantity };
      if (item.type === "box" && !boxIsIncluded(item.box_id)) {
        throw new AuthError(404, "This box is not available in this storefront");
      }
      const feeRules = item.type === "box" ? storefrontPolicy().feeRules : undefined;
      await commerce(
        `/customers/${encodeURIComponent(identity.externalCustomerId)}`,
        { method: "PUT", body: JSON.stringify(customer) },
      );
      const result = await commerce("/quotes", {
          method: "POST",
          headers: { "Idempotency-Key": `quote:${key}` },
          body: JSON.stringify({
            external_customer_id: identity.externalCustomerId,
            items: [quoteItem],
            ...(feeRules ? { fee_rules: feeRules } : {}),
          }),
        });
      if (feeRules) {
        const pricing = (result.quote as ApiRecord)?.price_breakdown as ApiRecord;
        const expectedFee = feeRules.enabled ? feeRules.type === "fixed"
          ? Math.round(Number(feeRules.fixed_amount) * 100) * quantity
          : Math.round(Number(pricing?.subtotal_cents) * (Number(feeRules.percent) / 100)) : 0;
        if (!pricing?.fee_rules || pricing.partner_fee_cents !== expectedFee) {
          throw new AuthError(503, "DYLI has not confirmed this storefront’s fee settings. No payment was started.");
        }
      }
      return Response.json(result);
    }
    const quoteId = String(body.quoteId || "");
    const authoritativeQuote = await ownedQuoteResponse(quoteId, identity);
    if (action === "read")
      return Response.json(authoritativeQuote, {
        headers: { "Cache-Control": "private, no-store" },
      });
    if (action === "card") {
      const { successUrl } = checkoutReturnUrls(
        await loadCommerceRuntime(),
        body.returnUrl,
        process.env.STOREFRONT_ORIGIN,
      );
      const result = await commerce(`/quotes/${quoteId}/stripe-checkout`, {
          method: "POST",
          headers: { "Idempotency-Key": `stripe:${key}` },
          body: JSON.stringify({
            external_customer_id: identity.externalCustomerId,
            external_order_id: `order:${key}`,
            customer,
            fulfillment: { mode: "vault" },
            ui_mode: "embedded", return_url: successUrl,
          }),
        });
      return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (!["authorize", "confirm_balance"].includes(action))
      throw new AuthError(400, "Unknown checkout action");
    const txHash = String(body.txHash || "");
    if (!/^0x[\da-f]{64}$/i.test(txHash))
      throw new AuthError(400, "A payment transaction hash is required");
    const payment = {
      chain: "abstract",
      tx_hash: txHash,
      payer: identity.walletAddress,
      payer_signature: body.signature,
    };
    const input = {
      customer,
      external_customer_id: identity.externalCustomerId,
      fulfillment: { mode: "vault" },
      payment,
    };
    if (action === "authorize") {
      const previous = await commerce(
        `/orders?external_customer_id=${encodeURIComponent(identity.externalCustomerId)}&external_order_id=${encodeURIComponent(`order:${key}`)}&limit=1`,
      );
      const order = Array.isArray(previous.orders)
        ? (previous.orders[0] as ApiRecord | undefined)
        : undefined;
      if (order) {
        if (
          order.quote_id !== quoteId ||
          (order.payment as ApiRecord)?.tx_hash !== txHash
        )
          throw new AuthError(
            409,
            "This purchase key was already used for another payment",
          );
        return Response.json({ order, idempotent: true });
      }
      return Response.json(
        await commerce(`/quotes/${quoteId}/payment-authorization`, {
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    }
    return Response.json(
      await commerce("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": `order:${key}` },
        body: JSON.stringify({
          ...input,
          quote_id: quoteId,
          external_order_id: `order:${key}`,
        }),
      }),
    );
  } catch (error) {
    return authErrorResponse(error) || apiErrorResponse(error);
  }
}
