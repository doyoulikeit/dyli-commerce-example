"use client";
import Link from "next/link";

import { LoaderCircle } from "lucide-react";
import { CommerceLogo } from "@/components/brand-identity";

export function AccountGate({ name, error, linking, busy, onConnect, onRetry, onSignOut }: {
  name: string; error: string; linking: boolean; busy: string;
  onConnect: () => void; onRetry: () => void; onSignOut: () => void;
}) {
  const loading = !error || !!busy;
  return <main className="lc-account-loading" aria-busy={loading}>
    <CommerceLogo name={name} />
    <div className="lc-account-loading-message">
      <h1>{loading ? "Connecting your collection" : linking ? "Connect your collection" : "Couldn’t load your account"}</h1>
      {loading ? <><LoaderCircle className="lc-account-loading-spinner" aria-hidden="true" /><p role="status">Getting your account ready…</p></> : <>
        <p role="alert">{linking ? "We couldn’t connect your wallet automatically. Try again, or log out and sign back in." : "Your account couldn’t load. Please try again."}</p>
        <button className="lc-primary" onClick={linking ? onConnect : onRetry}>{linking ? "Connect wallet" : "Try again"}</button>
      </>}
      <div className="dyli-account-exit"><Link prefetch={false} href="/?demo=1" className="lc-secondary">Try demo</Link><button type="button" className="dyli-text-button" disabled={!!busy} onClick={onSignOut}>Log out</button></div>
    </div>
  </main>;
}
