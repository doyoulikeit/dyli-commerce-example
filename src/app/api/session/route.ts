import { readWalletBalance, walletReadContext } from "@/lib/wallet-server";
import { apiErrorResponse, commerce, readApi } from "@/lib/dyli";
import { authErrorResponse } from "@/lib/privy-server";
import { customerFor, requireLiveContext } from "@/lib/live-server";
import type { ApiRecord } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { identity, readiness } = await requireLiveContext(request, url.searchParams.get("wallet") || undefined);
    const customer = await commerce(`/customers/${encodeURIComponent(identity.externalCustomerId)}`, {
      method: "PUT", body: JSON.stringify(customerFor(identity)),
    });
    const external = encodeURIComponent(identity.externalCustomerId);
    const [holdings, ordersPayload, redemptionsPayload, boxPlaysPayload] = await Promise.all([
      readApi(`/holdings/${identity.walletAddress}?pageSize=100&includeTotals=true&includeValue=true`),
      commerce(`/orders?external_customer_id=${external}&limit=100&offset=0`),
      commerce(`/redemptions?external_customer_id=${external}&limit=100&offset=0`),
      commerce(`/box-plays?external_customer_id=${external}&limit=100&offset=0`),
    ]);
    const balance = await readWalletBalance(walletReadContext(readiness), identity.walletAddress as `0x${string}`);
    const owned = (items: unknown) => Array.isArray(items)
      ? (items as ApiRecord[]).filter((item) => item.external_customer_id === identity.externalCustomerId) : [];
    return Response.json({
      identity, customer: customer.customer, holdings,
      balance,
      orders: owned(ordersPayload.orders),
      redemptions: owned(redemptionsPayload.redemptions),
      boxPlays: owned(boxPlaysPayload.box_plays),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error) || apiErrorResponse(error);
  }
}
