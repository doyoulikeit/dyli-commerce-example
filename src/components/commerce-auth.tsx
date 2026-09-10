"use client";

import { createContext, useContext } from "react";
import type { AbstractPaymaster } from "@/lib/commerce-runtime";

// Provider-neutral boundary used by the storefront. Implement this with your
// existing session and wallet SDK; the Commerce UI never needs Privy hooks.
export type CommerceAuth = {
  ready: boolean;
  authenticated: boolean;
  error?: string;
  login: () => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  wallet?: { address: string; switchChain: (chain: number) => Promise<unknown> };
  sendTransaction: (transaction: { to: `0x${string}`; data: `0x${string}`; value: bigint; chainId: number }, options: {
    address: string; sponsor: boolean; paymaster?: AbstractPaymaster | null; expiresAt?: string; uiOptions: { showWalletUIs: boolean };
  }) => Promise<{ hash: `0x${string}` }>;
  signMessage: (message: { message: string }, options: { address: string }) => Promise<{ signature: string }>;
};
export const CommerceAuthContext = createContext<CommerceAuth | null>(null);
export function useCommerceAuth() {
  const auth = useContext(CommerceAuthContext);
  if (!auth) throw new Error("A Commerce auth adapter is required");
  return auth;
}
