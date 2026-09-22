import { apiErrorResponse, commerce } from "@/lib/dyli";
import { authErrorResponse } from "@/lib/privy-server";
import { requireLiveIdentity } from "@/lib/live-server";
import type { ApiRecord } from "@/lib/types";

async function ownedRedemption(id: string, externalCustomerId: string) {
  const payload = await commerce(`/redemptions/${encodeURIComponent(id)}`);
  const redemption = payload.redemption as ApiRecord | undefined;
  if (!redemption || redemption.external_customer_id !== externalCustomerId) {
    throw new Response("Shipment does not belong to this account", { status: 403 });
  }
  return payload;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApiRecord;
    const identity = await requireLiveIdentity(request, String(body.walletAddress || ""));
    const action = String(body.action || "quote");

    if (action === "quote") {
      if (!identity.email) return Response.json({ error: "Add an email to your Privy account before shipping" }, { status: 409 });
      const submitted = (body.address || {}) as ApiRecord;
      const address = {
        name: submitted.name || identity.name,
        email: identity.email,
        phone: submitted.phone,
        address_line_1: submitted.address1,
        address_line_2: submitted.address2,
        city: submitted.city,
        state: submitted.state,
        postal_code: submitted.postal_code,
        country_alpha2: submitted.country,
      };
      const validation = await commerce("/redemptions/address-validation", {
        method: "POST",
        body: JSON.stringify({ external_customer_id: identity.externalCustomerId, address }),
      });
      const submittedItems = Array.isArray(body.items)
        ? body.items
        : [{ tokenId: body.tokenId, quantity: 1 }];
      const items = submittedItems.map((item) => {
        const input = (item || {}) as ApiRecord;
        return { token_id: String(input.tokenId || input.token_id || ""), quantity: Number(input.quantity || 1) };
      });
      const idempotencyKey = String(body.idempotencyKey || "").slice(0, 200);
      const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);
      if (!items.length || items.length > 20 || totalQuantity > 20 || items.some((item) => !/^\d+$/.test(item.token_id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)) {
        return Response.json({ error: "Choose up to 20 valid Collection items per shipment" }, { status: 400 });
      }
      if (!idempotencyKey) return Response.json({ error: "An idempotency key is required" }, { status: 400 });
      return Response.json(await commerce("/redemptions", {
        method: "POST",
        headers: { "Idempotency-Key": `redemption:${idempotencyKey}` },
        body: JSON.stringify({
          external_customer_id: identity.externalCustomerId,
          items,
          address: validation.address || address,
          include_ddp: body.includeDdp === true,
          insurance: body.insurance === true,
        }),
      }));
    }

    const redemptionId = String(body.redemptionId || "");
    const current = await ownedRedemption(redemptionId, identity.externalCustomerId);
    if (action === "get") return Response.json(current);
    if (action === "prepare") {
      return Response.json(await commerce(`/redemptions/${encodeURIComponent(redemptionId)}/prepare`, {
        method: "POST",
        body: JSON.stringify({
          shipping_selection: body.shippingSelection,
          redemption_collection_responses: body.collectionResponses || [],
        }),
      }));
    }
    if (action === "confirm") {
      const txHash = String(body.txHash || "");
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return Response.json({ error: "A valid transaction hash is required" }, { status: 400 });
      return Response.json(await commerce(`/redemptions/${encodeURIComponent(redemptionId)}/confirm`, {
        method: "POST",
        body: JSON.stringify({ tx_hash: txHash }),
      }));
    }
    return Response.json({ error: "Unknown shipment action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
    return authErrorResponse(error) || apiErrorResponse(error);
  }
}
