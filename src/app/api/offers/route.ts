import { apiErrorResponse, commerce } from "@/lib/dyli";
import { AuthError, authErrorResponse } from "@/lib/privy-server";
import { requireLiveContext, requestKey } from "@/lib/live-server";
import type { ApiRecord } from "@/lib/types";

const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const integer = /^(0|[1-9][0-9]{0,77})$/;
const respond = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  try {
    const body = await request.json() as ApiRecord;
    const { identity, readiness } = await requireLiveContext(request, String(body.walletAddress || ""));
    const capabilities = readiness.capabilities as ApiRecord | undefined;
    const action = String(body.action || "query");
    if (["query", "prepare"].includes(action) && (capabilities?.post_vault_offers as ApiRecord | undefined)?.ready !== true) {
      throw new AuthError(503, "Vault selling is not available yet. Please try again later.");
    }
    if (action === "list") {
      const history = await commerce(`/offer-acceptances?external_customer_id=${encodeURIComponent(identity.externalCustomerId)}&limit=100`);
      return respond({ ...history, acceptances: (Array.isArray(history.acceptances) ? history.acceptances as ApiRecord[] : []).filter(value =>
        value.external_customer_id === identity.externalCustomerId && String(value.wallet_address).toLowerCase() === identity.walletAddress.toLowerCase()) });
    }
    if (action === "query" || action === "prepare") {
      const tokenId = String(body.tokenId || "");
      if (!integer.test(tokenId)) throw new AuthError(400, "Choose a valid vault item");
      if (action === "query") return respond(await commerce("/offers/query", {
        method: "POST", body: JSON.stringify({ external_customer_id: identity.externalCustomerId, token_id: tokenId }),
      }));
      const offerId = String(body.offerId || ""), amount = String(body.expectedAmount || "");
      if (!integer.test(offerId) || !integer.test(amount)) throw new AuthError(400, "Choose a valid offer");
      return respond(await commerce("/offer-acceptances", {
        method: "POST", headers: { "Idempotency-Key": `offer:${requestKey(body.idempotencyKey)}` },
        body: JSON.stringify({ external_customer_id: identity.externalCustomerId, token_id: tokenId,
          offer_id: offerId, expected_amount: amount }),
      }));
    }
    if (action !== "get" && action !== "confirm") throw new AuthError(400, "Unknown offer action");
    const id = String(body.acceptanceId || "");
    if (!uuid.test(id)) throw new AuthError(400, "A valid sale ID is required");
    const payload = await commerce(`/offer-acceptances/${id}`);
    const acceptance = payload.acceptance as ApiRecord | undefined;
    if (!acceptance || acceptance.external_customer_id !== identity.externalCustomerId ||
        String(acceptance.wallet_address).toLowerCase() !== identity.walletAddress.toLowerCase()) {
      throw new AuthError(403, "Sale does not belong to this account");
    }
    if (action === "get") return respond(payload);
    const hash = String(body.txHash || "");
    if (!/^0x[a-f\d]{64}$/i.test(hash)) throw new AuthError(400, "A valid transaction hash is required");
    return respond(await commerce(`/offer-acceptances/${id}/confirm`, { method: "POST", body: JSON.stringify({ tx_hash: hash }) }));
  } catch (error) {
    return authErrorResponse(error) || apiErrorResponse(error);
  }
}
