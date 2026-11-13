import { apiErrorResponse, commerce } from "@/lib/dyli";
import { AuthError, authErrorResponse } from "@/lib/privy-server";
import { requireLiveIdentity } from "@/lib/live-server";
import { loadCommerceRuntime } from "@/lib/runtime-server";
import type { ApiRecord } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as ApiRecord;
    const identity = await requireLiveIdentity(request, String(body.walletAddress || ""));
    const runtime = await loadCommerceRuntime();
    if (!runtime.packSponsorship || runtime.authMode !== "dyli_managed")
      throw new AuthError(409, "Managed pack sponsorship is not available for this app");
    const action = String(body.action || "");
    if (!["intent", "rpc", "recovery"].includes(action) || typeof body.box_play_id !== "string" || body.item_gift_id)
      throw new AuthError(400, "Choose a supported pack wallet action");
    if (body.external_customer_id !== identity.externalCustomerId)
      throw new AuthError(403, "This wallet request belongs to another customer");
    const payload = await commerce(`/box-plays/${encodeURIComponent(body.box_play_id)}`);
    const play = payload.box_play as ApiRecord | undefined;
    if (!play || play.external_customer_id !== identity.externalCustomerId ||
        String(play.wallet_address).toLowerCase() !== identity.walletAddress.toLowerCase())
      throw new AuthError(403, "This pack does not belong to the signed-in wallet");
    const fields = action === "intent" ? ["calls", "callData"]
      : action === "rpc" ? ["intent", "method", "params"] : ["intent", "id", "resubmit"];
    const input: ApiRecord = { external_customer_id: identity.externalCustomerId, box_play_id: play.id };
    for (const field of fields) if (body[field] !== undefined) input[field] = body[field];
    return Response.json(await commerce(`/wallet/${action}`, {
      method: "POST",
      headers: { "x-customer-access-token": request.headers.get("authorization")!.slice(7).trim() },
      body: JSON.stringify(input),
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error) || apiErrorResponse(error); }
}
