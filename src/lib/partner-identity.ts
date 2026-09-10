import "server-only";
import type { Identity } from "./types";

// Implement with your provider's SERVER session verifier and trusted wallet
// records. Verify token signature/issuer/audience/expiry, or your signed session.
// Resolve the wallet belonging to that customer; never trust request-body IDs.
// If using cookies instead of bearer tokens, also enforce CSRF on mutations.
export async function verifyPartnerIdentity(request: Request, requestedWallet?: string): Promise<Identity> {
  void request;
  void requestedWallet;
  throw Object.assign(new Error("Connect your server-side identity verifier before enabling customer actions"), { status: 503 });
}
