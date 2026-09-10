import "server-only";
import { cache } from "react";
import { commerce } from "@/lib/dyli";
import { parseCommerceRuntime, parseAbstractPaymaster, type CommerceRuntime } from "@/lib/commerce-runtime";
import type { ApiRecord } from "@/lib/types";

export const loadCommerceRuntime = cache(async (): Promise<CommerceRuntime> => {
  const payload = await commerce("/bootstrap");
  const authMode = process.env.DYLI_AUTH_MODE || (payload.auth as ApiRecord | undefined)?.mode || "dyli_managed";
  if (authMode === "partner" || authMode === "privy") {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
    const chainId = Number((payload.wallet as ApiRecord | undefined)?.chain_id);
    if (!appId || !process.env.PRIVY_SECRET_KEY?.trim() || ![2741, 11124].includes(chainId)) {
      throw new Error("Partner auth requires your Privy app ID, server secret and a supported DYLI network");
    }
    const storefront = payload.storefront as ApiRecord | undefined;
    const auth = payload.auth as ApiRecord | undefined;
    const origin = typeof auth?.storefront_origin === "string" ? auth.storefront_origin : null;
    if (!origin) throw new Error("Register your storefront origin with DYLI before checkout");
    return {
      authMode: "partner", appId, chainId: chainId as 2741 | 11124,
      allowedOrigins: Array.isArray(auth?.allowed_origins) ? auth.allowed_origins.filter((value): value is string => typeof value === "string") : [origin],
      storefrontOrigin: origin,
      sponsorTransactions: false,
      paymaster: parseAbstractPaymaster(payload.wallet as ApiRecord | undefined),
      name: process.env.NEXT_PUBLIC_STOREFRONT_NAME || String(storefront?.name || "Vaulted"),
      boxesOnly: process.env.NEXT_PUBLIC_BOXES_ONLY === "true" || storefront?.boxes_only === true,
    };
  }
  if (!["dyli_managed", "existing"].includes(String(authMode))) throw new Error("Unsupported DYLI_AUTH_MODE");
  if (authMode !== (payload.auth as ApiRecord | undefined)?.mode) throw new Error("Authentication mode must match your registered Commerce application");
  const runtime = parseCommerceRuntime(payload);
  return {
    ...runtime,
    name: process.env.NEXT_PUBLIC_STOREFRONT_NAME || runtime.name,
    boxesOnly: process.env.NEXT_PUBLIC_BOXES_ONLY === "true" || runtime.boxesOnly,
  };
});
