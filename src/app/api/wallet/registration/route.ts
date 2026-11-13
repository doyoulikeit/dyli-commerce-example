import { apiErrorResponse, commerce } from "@/lib/dyli";
import { AuthError, authErrorResponse } from "@/lib/privy-server";
import { requireLiveIdentity, requestKey } from "@/lib/live-server";
import { loadCommerceRuntime } from "@/lib/runtime-server";
import type { ApiRecord } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as ApiRecord;
    const identity = await requireLiveIdentity(request, String(body.walletAddress || ""));
    if (!(await loadCommerceRuntime()).walletRegistration)
      throw new AuthError(409, "Wallet registration is not available for this app");
    const customer = encodeURIComponent(identity.externalCustomerId);
    if (body.action === "prepare") {
      return Response.json(await commerce(`/customers/${customer}/wallet-authorizations`, {
        method: "POST", headers: { "Idempotency-Key": requestKey(body.idempotencyKey) },
        body: JSON.stringify({ wallet_address: identity.walletAddress }),
      }), { headers: { "Cache-Control": "private, no-store" } });
    }
    if (body.action !== "confirm" || !/^[a-f\d-]{36}$/i.test(String(body.authorizationId)))
      throw new AuthError(400, "A wallet authorization is required");
    return Response.json(await commerce(`/customers/${customer}/wallet-authorizations/${encodeURIComponent(String(body.authorizationId))}/confirm`, {
      method: "POST", body: JSON.stringify({ signature: body.signature }),
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error) || apiErrorResponse(error); }
}
