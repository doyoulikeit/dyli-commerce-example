"use client";
import { useEffect, useRef } from "react";

export function useWalletRegistration({ ready, authenticated, address, needsRegistration, busy, chainId, embedded, register }: {
  ready: boolean; authenticated: boolean; address: string; needsRegistration: boolean; busy: string;
  chainId?: number; embedded: boolean; register: () => Promise<boolean>;
}) {
  const attempted = useRef("");
  useEffect(() => {
    if (!authenticated) { attempted.current = "";return; }
    const key = `${chainId}:${address}`;
    if (!ready || !address || !needsRegistration || busy || !embedded || attempted.current === key) return;
    // One verified embedded-wallet registration per account, with manual retry
    // after a provider failure or MFA dismissal. This never starts a payment.
    attempted.current = key;
    void register();
  }, [ready, authenticated, address, needsRegistration, busy, chainId, embedded, register]);
}
