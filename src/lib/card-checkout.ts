import type { ApiRecord } from "./types.ts";

export type CardCheckout = {
  sessionId: string;
  mode: "embedded";
  clientSecret: string;
  publishableKey: string;
} | { sessionId: string; mode: "hosted"; url: string };

export function parseCardCheckout(checkout: ApiRecord): CardCheckout {
  const sessionId = String(checkout.stripe_session_id || "");
  const match = sessionId.match(/^cs_(live|test)_[a-zA-Z0-9]+$/);
  if (!match) throw new Error("Secure checkout is unavailable. Your purchase is saved.");
  if (checkout.ui_mode === "embedded") {
    const clientSecret = String(checkout.client_secret || "");
    const publishableKey = String(checkout.publishable_key || "");
    if (!clientSecret.startsWith(`${sessionId}_secret_`) ||
      !publishableKey.startsWith(`pk_${match[1]}_`)) {
      throw new Error("Secure checkout configuration is incomplete. Your purchase is saved.");
    }
    return { sessionId, mode: "embedded", clientSecret, publishableKey };
  }
  const url = new URL(String(checkout.checkout_url));
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password)
    throw new Error("Invalid secure checkout destination");
  return { sessionId, mode: "hosted", url: url.href };
}

export const unpaidCardError = (error: unknown) =>
  !!error && typeof error === "object" && "code" in error &&
  ["stripe_payment_pending"].includes(String(error.code));
