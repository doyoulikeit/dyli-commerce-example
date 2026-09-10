import "server-only";
import { AuthError, requireIdentity } from "@/lib/privy-server";
import { commerce } from "@/lib/dyli";
import type { ApiRecord, Identity } from "@/lib/types";
import { takeBudget } from "@/lib/rate-limit";

export async function requireLiveContext(request: Request, wallet?: string) {
  // Demo deployments must not have a hidden real-money write API.
  if (["true", "force"].includes(process.env.NEXT_PUBLIC_DEMO_MODE || "")) {
    throw new AuthError(403, "Live transactions are disabled in demo mode");
  }
  const identity = await requireIdentity(request, wallet);
  await takeBudget("customer", identity.externalCustomerId);
  const readiness = await commerce("/");
  const capabilities = readiness.capabilities as ApiRecord | undefined;
  const gacha = capabilities?.box_play as ApiRecord | undefined;
  if (gacha?.contract_version !== "gacha" || gacha?.max_quantity !== 10) {
    throw new AuthError(
      503,
      "This storefront requires DYLI Commerce gacha 1.2. Connect the upgraded environment before continuing.",
    );
  }
  return { identity, readiness };
}

export async function requireLiveIdentity(request: Request, wallet?: string) {
  return (await requireLiveContext(request, wallet)).identity;
}

export function customerFor(identity: Identity) {
  return {
    external_customer_id: identity.externalCustomerId,
    wallet_address: identity.walletAddress,
    wallet_chain: "abstract",
    email: identity.email || undefined,
    name: identity.name || undefined,
    partner_auth: { provider: "privy", subject: identity.userId },
  };
}

export async function ownedQuoteResponse(id: string, identity: Identity) {
  if (!/^[\da-f-]{36}$/i.test(id))
    throw new AuthError(400, "A quote ID is required");
  const payload = await commerce(`/quotes/${encodeURIComponent(id)}`);
  const quote = payload.quote as ApiRecord | undefined;
  if (!quote || quote.external_customer_id !== identity.externalCustomerId) {
    throw new AuthError(403, "Quote does not belong to this account");
  }
  return payload;
}

export async function ownedQuote(id: string, identity: Identity) {
  return (await ownedQuoteResponse(id, identity)).quote as ApiRecord;
}

export function requestKey(value: unknown) {
  const key = String(value || "");
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(key))
    throw new AuthError(400, "A valid idempotency key is required");
  return key;
}
