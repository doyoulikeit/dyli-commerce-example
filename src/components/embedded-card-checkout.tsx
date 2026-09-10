"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe, type StripeEmbeddedCheckout } from "@stripe/stripe-js";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import type { CardCheckout } from "@/lib/card-checkout";

export function EmbeddedCardCheckout({ checkout, onComplete }: {
  checkout: Extract<CardCheckout, { mode: "embedded" }>;
  onComplete: () => Promise<boolean>;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const completeRef = useRef(onComplete);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "verifying" | "retry" | "failed">("loading");
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    let active = true;
    let embedded: StripeEmbeddedCheckout | undefined;
    const initialize = async () => {
      try {
        const stripe = await loadStripe(checkout.publishableKey);
        if (!stripe) throw Error("Stripe did not load");
        if (!active) return;
        const instance = await stripe.createEmbeddedCheckoutPage({
          clientSecret: checkout.clientSecret,
          onComplete: () => {
            if (!active) return;
            setState("verifying");
            void completeRef.current().then(ok => {
              if (active && !ok) setState("retry");
            }).catch(() => { if (active) setState("retry"); });
          },
        });
        embedded = instance;
        if (!active) { instance.destroy(); return; }
        if (mount.current) instance.mount(mount.current);
        setState(current => current === "loading" ? "ready" : current);
      } catch {
        if (active) setState("failed");
      }
    };
    void initialize();
    return () => { active = false; embedded?.destroy(); };
  }, [checkout.clientSecret, checkout.publishableKey, attempt]);
  return <div className="lc-embedded-card">
    <p className="lc-secure-label"><LockKeyhole size={13} />Secure payment by Stripe</p>
    {state === "loading" && <div className="lc-embedded-status" role="status"><LoaderCircle className="lc-account-loading-spinner" />Loading secure checkout…</div>}
    <div ref={mount} hidden={["verifying", "retry", "failed"].includes(state)} />
    {state === "failed" && <div className="lc-embedded-status" role="alert"><p>Secure checkout couldn’t load.</p><button className="lc-secondary" onClick={() => { setState("loading"); setAttempt(current => current + 1); }}>Try again</button></div>}
    {state === "verifying" && <div className="lc-embedded-status" role="status"><LoaderCircle className="lc-account-loading-spinner" /><p>Confirming your payment…</p><small>You won’t be charged again.</small></div>}
    {state === "retry" && <div className="lc-embedded-status"><p>Your payment was submitted.</p><button className="lc-primary" onClick={async () => { setState("verifying"); if (!await completeRef.current()) setState("retry"); }}>Check payment status</button></div>}
  </div>;
}
