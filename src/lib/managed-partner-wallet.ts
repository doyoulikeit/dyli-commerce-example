import "server-only";
import { commerce } from "./dyli";
import type { Identity } from "./types";

// Call only after your existing provider has verified this HTTP request.
// The wallet token cannot choose another existing-auth customer.
export async function verifyManagedPartnerWallet(
  verifiedSession: { userId: string; email?: string | null; name?: string | null },
  walletAccessToken: string,
  requestedWallet?: string,
): Promise<Identity> {
  const payload = await commerce("/auth/session", {
    method: "POST",
    headers: { "x-customer-access-token": walletAccessToken },
    body: JSON.stringify({ external_customer_id: verifiedSession.userId, wallet_address: requestedWallet }),
  });
  const identity = payload.identity as Identity | undefined;
  if (!identity || identity.userId !== verifiedSession.userId || identity.externalCustomerId !== verifiedSession.userId ||
      !/^0x[a-f0-9]{40}$/i.test(identity.walletAddress || "") ||
      (requestedWallet && identity.walletAddress.toLowerCase() !== requestedWallet.toLowerCase())) {
    throw Object.assign(new Error("The wallet does not belong to the signed-in customer"), { status: 403 });
  }
  return { ...identity, email: verifiedSession.email || null, name: verifiedSession.name || null };
}
