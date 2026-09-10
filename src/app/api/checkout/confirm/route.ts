import { apiErrorResponse, commerce } from "@/lib/dyli";
import { authErrorResponse } from "@/lib/privy-server";
import { requireLiveIdentity } from "@/lib/live-server";
import type { ApiRecord } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApiRecord;
    const identity = await requireLiveIdentity(request, String(body.walletAddress || ""));
    let paymentSessionId = String(body.paymentSessionId || "");
    const stripeSessionId = String(body.stripeSessionId || "");
    if (!paymentSessionId && stripeSessionId) {
      const resolved = await commerce(`/stripe-checkouts/resolve?stripe_session_id=${encodeURIComponent(stripeSessionId)}`);
      paymentSessionId = String((resolved.checkout as ApiRecord | undefined)?.id || "");
    }
    if (!paymentSessionId) return Response.json({ error: "Payment session is required" }, { status: 400 });

    const checkoutState = await commerce(`/stripe-checkouts/${encodeURIComponent(paymentSessionId)}`);
    const checkout = checkoutState.checkout as ApiRecord | undefined;
    const quoteId = String(checkout?.quote_id || "");
    if (!quoteId) return Response.json({ error: "Checkout state is unavailable" }, { status: 409 });
    const quoteState = await commerce(`/quotes/${encodeURIComponent(quoteId)}`);
    const quote = quoteState.quote as ApiRecord | undefined;
    if (quote?.external_customer_id !== identity.externalCustomerId) {
      return Response.json({ error: "Checkout does not belong to this account" }, { status: 403 });
    }

    if (body.action === "cancel") {
      const result = await commerce(`/stripe-checkouts/${encodeURIComponent(paymentSessionId)}/cancel`, { method: "POST", body: "{}" });
      if (result.cancelled !== true) return Response.json({ error: "Cancellation was not confirmed. Your purchase is saved." }, { status: 409 });
      return Response.json({ cancelled: true }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const result = await commerce(`/stripe-checkouts/${encodeURIComponent(paymentSessionId)}/confirm`, {
      method: "POST",
      body: JSON.stringify({ stripe_session_id: stripeSessionId || undefined }),
    });
    const order = result.order as ApiRecord | undefined;
    if (!order || order.external_customer_id !== identity.externalCustomerId) {
      return Response.json({ error: "Checkout does not belong to this account" }, { status: 403 });
    }
    const quoteItems = Array.isArray(quote?.items) ? quote.items as ApiRecord[] : [];
    return Response.json({ ...result, order: { ...order, items: quoteItems }, isBox: quoteItems.length === 1 && String(quoteItems[0]?.type || "") === "box" });
  } catch (error) {
    return authErrorResponse(error) || apiErrorResponse(error);
  }
}
