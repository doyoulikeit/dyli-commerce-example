"use client";
import Link from "next/link";

import { LoaderCircle } from "lucide-react";
import { CommerceLogo } from "@/components/brand-identity";

export function AccountGate({
  name,
  error,
  linking,
  busy,
  onConnect,
  onRetry,
  onSignOut,
}: {
  name: string;
  error: string;
  linking: boolean;
  busy: string;
  onConnect: () => void;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const loading = !error || !!busy;
  const previousAccount =
    /still has assets|previous network|previous DYLI account|pending purchases.*review/i.test(
      error,
    );
  const heading = previousAccount
    ? "Your earlier account needs review"
    : linking
      ? "Connect your collection"
      : "Couldn’t load your account";
  const message = previousAccount
    ? "This wallet still has items, funds, or an unfinished opening on its previous network. Those need to be resolved before it can connect on Base. You can try the demo or log out and use another account."
    : linking
      ? "We couldn’t connect your wallet automatically. Try again, or log out and sign back in."
      : "Your account couldn’t load. Please try again.";
  return (
    <main className="lc-account-loading" aria-busy={loading}>
      <CommerceLogo name={name} />
      <div className="lc-account-loading-message">
        {loading ? (
          <>
            <LoaderCircle
              className="lc-account-loading-spinner"
              aria-hidden="true"
            />
            <p role="status">Getting your account ready…</p>
          </>
        ) : (
          <>
            <h1>{heading}</h1>
            <p role="alert">{message}</p>
            <button
              className="lc-primary"
              onClick={linking ? onConnect : onRetry}
            >
              {previousAccount
                ? "Check again"
                : linking
                  ? "Connect wallet"
                  : "Try again"}
            </button>
          </>
        )}
        {!loading && (
          <div className="dyli-account-exit">
            <Link prefetch={false} href="/?demo=1" className="lc-secondary">
              Try demo
            </Link>
            <button
              type="button"
              className="dyli-text-button"
              disabled={!!busy}
              onClick={onSignOut}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
