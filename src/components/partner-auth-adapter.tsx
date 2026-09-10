"use client";

import { useState } from "react";
import type { CommerceAuth } from "./commerce-auth";

// Replace this hook with your existing auth/wallet SDK. This safe starting point
// never manufactures a customer, accepts a wallet from localStorage, or signs.
// Pair it with src/lib/partner-identity.ts on the server.
export function usePartnerAuthAdapter(): CommerceAuth {
  const [error, setError] = useState("");
  const unavailable = async (): Promise<never> => { throw new Error("Connect your wallet adapter before transacting"); };
  return {
    ready: true, authenticated: false, error,
    login: () => setError("Connect your sign-in provider in partner-auth-adapter.tsx to continue."),
    logout: async () => { setError(""); },
    getAccessToken: async () => null,
    sendTransaction: unavailable,
    signMessage: unavailable,
  };
}
