import { readWalletBalance, readWalletHoldings, walletReadContext } from "@/lib/wallet-server";
import { enrichActivityItems } from "@/lib/activity-items";
import { asRecord, asRows } from "@/lib/live-commerce";
import { apiErrorResponse, commerce, readApi } from "@/lib/dyli";
import { authErrorResponse } from "@/lib/privy-server";
import { customerFor, requireLiveContext } from "@/lib/live-server";
import type { ApiRecord } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { identity, readiness } = await requireLiveContext(request, url.searchParams.get("wallet") || undefined);
    const external = encodeURIComponent(identity.externalCustomerId);
    const capabilities = readiness.capabilities as ApiRecord | undefined;
    const offersReady = (capabilities?.post_vault_offers as ApiRecord | undefined)?.ready === true;
    const context = walletReadContext(readiness);
    const wallet = identity.walletAddress as `0x${string}`;
    const fresh = url.searchParams.get("fresh") === "1";
    const [customer, balance, holdings, ordersPayload, redemptionsPayload, boxPlaysPayload, offersPayload] = await Promise.all([
      commerce(`/customers/${external}`, { method: "PUT", body: JSON.stringify(customerFor(identity)) }),
      readWalletBalance(context, wallet),
      readApi(`/holdings/${identity.walletAddress}?pageSize=100&includeTotals=true&includeValue=true`,
        fresh ? { headers: { "Cache-Control": "no-cache" } } : {})
        .then(value => fresh ? readWalletHoldings(context, wallet, value) : value),
      commerce(`/orders?external_customer_id=${external}&limit=100&offset=0`),
      commerce(`/redemptions?external_customer_id=${external}&limit=100&offset=0`),
      commerce(`/box-plays?external_customer_id=${external}&limit=100&offset=0`),
      offersReady ? commerce(`/offer-acceptances?external_customer_id=${external}&limit=100`) : Promise.resolve({ acceptances: [] }),
    ]);
    const owned = (items: unknown) => Array.isArray(items)
      ? (items as ApiRecord[]).filter((item) => item.external_customer_id === identity.externalCustomerId) : [];
    const orders = owned(ordersPayload.orders), boxPlays = owned(boxPlaysPayload.box_plays);
    const redemptions = owned(redemptionsPayload.redemptions);
    const sales = owned(offersPayload.acceptances).filter(value => String(value.wallet_address).toLowerCase() === wallet.toLowerCase());
    const activity = await enrichActivityItems(sales, redemptions, [
      ...asRows(holdings.items), ...orders.flatMap(order => asRows(order.items)),
      ...boxPlays.flatMap(play => asRows(play.rewards).map(reward => ({ ...asRecord(reward.product), token_id: reward.token_id }))),
      ...redemptions.flatMap(redemption => asRows(redemption.items)),
    ], async tokens => asRows((await readApi(`/metadata/advanced?tokenIds=${tokens.join(",")}`)).items));
    return Response.json({
      identity, customer: customer.customer, holdings,
      balance,
      orders, redemptions: activity.shipments, boxPlays,
      offerAcceptances: activity.sales,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error) || apiErrorResponse(error);
  }
}
