import "server-only";

import { PrivyClient, type User } from "@privy-io/server-auth";

import type { Identity } from "@/lib/types";
import { commerce } from "@/lib/dyli";
import { loadCommerceRuntime } from "./runtime-server";
import { verifyPartnerIdentity } from "./partner-identity";

let client: PrivyClient | null = null;

function getPrivyClient() {
  if (client) return client;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_SECRET_KEY?.trim();
  if (!appId || !appSecret) throw new AuthError(503, "Privy server credentials are not configured");
  client = new PrivyClient(appId, appSecret);
  return client;
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new AuthError(401, "Sign in required");
  return header.slice(7).trim();
}

function accountName(user: User) {
  const providers = [user.google, user.github, user.apple] as Array<Record<string, unknown> | undefined>;
  const named = providers.find((provider) => provider && typeof provider.name === "string");
  return named?.name ? String(named.name) : null;
}

function ethereumWallets(user: User) {
  const linked = user.linkedAccounts
    .filter((account): account is Extract<User["linkedAccounts"][number], { type: "wallet" }> => account.type === "wallet")
    .filter((wallet) => wallet.chainType === "ethereum")
    .map((wallet) => wallet.address.toLowerCase());
  if (user.wallet?.chainType === "ethereum") linked.push(user.wallet.address.toLowerCase());
  return [...new Set(linked)];
}

export async function requireIdentity(request: Request, requestedWallet?: string): Promise<Identity> {
  const runtime = await loadCommerceRuntime();
  if (runtime.authMode === "existing") {
    let identity: Identity;
    try { identity = await verifyPartnerIdentity(request, requestedWallet); }
    catch (error) {
      const status = (error as { status?: number })?.status;
      throw new AuthError(status === 401 || status === 403 ? status : 503,
        status === 401 || status === 403 ? "Sign in again to continue" : "Your sign-in integration is not available yet");
    }
    if (typeof identity?.userId !== "string" || !identity.userId || typeof identity.externalCustomerId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/|\-]{0,199}$/.test(identity.externalCustomerId) || !/^0x[a-f0-9]{40}$/i.test(identity.walletAddress || "")) throw new AuthError(401, "Unable to verify this account");
    if (requestedWallet && identity.walletAddress.toLowerCase() !== requestedWallet.toLowerCase()) throw new AuthError(403, "That wallet does not belong to this account");
    return identity;
  }
  if (runtime.authMode === "dyli_managed") {
    const payload = await commerce("/auth/session", {
      method: "POST",
      headers: { "x-customer-access-token": bearerToken(request) },
      body: JSON.stringify({ wallet_address: requestedWallet }),
    });
    const identity = payload.identity as Identity | undefined;
    if (!identity?.userId || !identity.externalCustomerId || !/^0x[a-f0-9]{40}$/i.test(identity.walletAddress || "")) {
      throw new AuthError(503, "DYLI could not verify this account");
    }
    return identity;
  }
  const privy = getPrivyClient();
  let claims;
  try {
    claims = await privy.verifyAuthToken(bearerToken(request));
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401, "Your session has expired");
  }
  const user = await privy.getUserById(claims.userId);
  const wallets = ethereumWallets(user);
  const wallet = requestedWallet?.toLowerCase() || wallets[0];
  if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) throw new AuthError(409, "Your Collection wallet is still being created");
  if (!wallets.includes(wallet)) throw new AuthError(403, "That wallet does not belong to this account");

  return {
    userId: user.id,
    externalCustomerId: `privy:${user.id.replace(/^did:privy:/, "")}`.slice(0, 200),
    walletAddress: wallet,
    email: user.email?.address || null,
    name: accountName(user),
  };
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  return null;
}
