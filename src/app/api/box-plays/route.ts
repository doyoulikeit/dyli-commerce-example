import { apiErrorResponse, commerce } from "@/lib/dyli";
import { authErrorResponse } from "@/lib/privy-server";
import { requireLiveIdentity } from "@/lib/live-server";
import type { ApiRecord } from "@/lib/types";
import { boxPlayNeedsOpening } from "@/lib/live-commerce";

async function ownedOrder(id: string, externalCustomerId: string) {
  const payload = await commerce(`/orders/${encodeURIComponent(id)}`);
  const order = payload.order as ApiRecord | undefined;
  if (!order || order.external_customer_id !== externalCustomerId) {
    throw new Response("Order does not belong to this account", { status: 403 });
  }
  return order;
}

async function ownedPlay(id: string, externalCustomerId: string) {
  const payload = await commerce(`/box-plays/${encodeURIComponent(id)}`);
  const play = payload.box_play as ApiRecord | undefined;
  if (!play || play.external_customer_id !== externalCustomerId) {
    throw new Response("Box play does not belong to this account", { status: 403 });
  }
  return payload;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApiRecord;
    const identity = await requireLiveIdentity(request, String(body.walletAddress || ""));
    const action = String(body.action || "create");

    if (action === "create") {
      const orderId = String(body.orderId || "");
      await ownedOrder(orderId, identity.externalCustomerId);
      return Response.json(await commerce("/box-plays", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId, external_customer_id: identity.externalCustomerId }),
      }));
    }

    const playId = String(body.playId || "");
    const current = await ownedPlay(playId, identity.externalCustomerId);
    if (action === "get") return Response.json(current);
    if (action === "decision") {
      const play = current.box_play as ApiRecord;
      if (boxPlayNeedsOpening({ status: String(play.status) })) {
        return Response.json({ ...current, ready: false, restart: true });
      }
      const decisions = body.decisions;
      if (!Array.isArray(decisions) || !decisions.length || decisions.length > 10 || decisions.some((choice) => !["claim", "sell_back"].includes(String(choice)))) {
        return Response.json({ error: "Choose claim or sell_back for every pull" }, { status: 400 });
      }
      return Response.json(await commerce(`/box-plays/${encodeURIComponent(playId)}/decision`, {
        method: "POST",
        body: JSON.stringify({ decisions, tx_hash: body.txHash || undefined }),
      }));
    }
    if (!["results", "finalize"].includes(action)) {
      return Response.json({ error: "Unknown box action" }, { status: 400 });
    }
    const txHash = String(body.txHash || "");
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return Response.json({ error: "A valid transaction hash is required" }, { status: 400 });
    }
    return Response.json(await commerce(`/box-plays/${encodeURIComponent(playId)}/${action}`, {
      method: "POST",
      body: JSON.stringify({ tx_hash: txHash }),
    }));
  } catch (error) {
    if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
    return authErrorResponse(error) || apiErrorResponse(error);
  }
}
