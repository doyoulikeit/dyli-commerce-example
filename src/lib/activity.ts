import type { ApiRecord, BoxPlay, OfferAcceptance } from "./types.ts";

const asRecord = (value: unknown): ApiRecord => value && typeof value === "object" && !Array.isArray(value) ? value as ApiRecord : {};
const asRows = (value: unknown) => Array.isArray(value) ? value.map(asRecord) : [];

export function saleActivity(sale: OfferAcceptance, now = Date.now()) {
  if (sale.status === "completed") return { label: "Sold", action: null };
  if (sale.tx_hash || ["processing", "requires_action"].includes(sale.status))
    return { label: "Confirming sale", action: "Check confirmation" };
  if (sale.status === "expired" || Date.parse(sale.expires_at) <= now)
    return { label: "Offer expired", action: "View sale" };
  return { label: "Sale started", action: "Continue sale" };
}

export function shipmentActivity(shipment: ApiRecord) {
  const orders = asRows(asRecord(shipment.result).orders);
  if (orders.length && orders.every(order => order.delivered === true || order.shipment_status === "delivered")) return "Delivered";
  if (orders.some(order => order.tracking_number)) return "Tracking available";
  return ({ completed: "Shipment requested", confirmed: "Shipment requested", prepared: "Ready to ship",
    processing: "Confirming shipment", requires_action: "Needs review", quoted: "Delivery options ready",
    expired: "Quote expired", cancelled: "Cancelled" } as Record<string, string>)[String(shipment.status)] || "Shipment in progress";
}

export function orderActivity(order: ApiRecord, plays: BoxPlay[]) {
  const items = asRows(order.items);
  const quantity = items.reduce((total, item) => {
    const amount = Number(item.quantity);
    return total + (Number.isSafeInteger(amount) && amount > 0 ? amount : 0);
  }, 0);
  // Join by order, never by product: two purchases of one box have different pulls.
  const pulls = plays.filter(play => play.order_id === order.id).flatMap(play =>
    play.rewards.map((reward, index) => {
      const choice = reward.disposition || play.decisions[index];
      const completed = play.status === "completed";
      return { ...reward, key: `${play.id}:${reward.index}`, completed,
        label: choice === "sell_back" ? completed ? "Sold" : "Sell selected"
          : choice === "claim" ? completed ? "Vaulted" : "Vault selected" : "Pulled",
        sold: completed && choice === "sell_back",
        vaulted: completed && choice === "claim",
      };
    }),
  );
  const sold = pulls.filter(pull => pull.sold).length;
  const vaulted = pulls.filter(pull => pull.vaulted).length;
  const pricing = asRecord(order.price_breakdown);
  return { items, quantity, pulls, sold, vaulted,
    total: pricing.total ?? (pricing.total_cents == null ? null : Number(pricing.total_cents) / 100),
    cash: pulls.reduce((cents, pull) => cents + (pull.sold ? Math.round(pull.buyback_amount * 100) : 0), 0) / 100,
  };
}
