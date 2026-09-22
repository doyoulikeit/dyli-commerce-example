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

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const statusKey = (value: unknown) => text(value).toLowerCase().replace(/[\s-]+/g, "_");

function trackingStatus(order: ApiRecord, hasTracking: boolean) {
  const status = statusKey(order.shipment_status);
  if (order.delivered === true || ["delivered", "successfully_delivered"].includes(status)) return "Delivered";
  const labels: Record<string, string> = {
    pending: "Preparing shipment", created: "Preparing shipment", pre_transit: "Label created",
    label_created: "Label created", info_received: "Label created", information_received: "Label created",
    in_transit: "In transit", transit: "In transit", out_for_delivery: "Out for delivery",
    available_for_pickup: "Ready for pickup", ready_for_pickup: "Ready for pickup",
    exception: "Delivery exception", delivery_exception: "Delivery exception", failed_attempt: "Delivery attempted",
    returned: "Returned to sender", return_to_sender: "Returned to sender", return: "Returned to sender",
    cancelled: "Cancelled", canceled: "Cancelled", fulfilled: "Shipped", shipped: "Shipped",
    tracking_available: "Tracking available",
  };
  if (labels[status]) return labels[status];
  if (status && status !== "unknown") return status.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
  return hasTracking ? "Tracking available" : "Shipment requested";
}

function safeTrackingUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function shipmentTracking(shipment: ApiRecord) {
  const seen = new Set<string>();
  return asRows(asRecord(shipment.result).orders).flatMap((order, orderIndex) => {
    const packages = asRows(order.shipments);
    return (packages.length ? packages.map(parcel => ({ ...order, ...parcel })) : [order]).flatMap((parcel, index) => {
      // Commerce resolves 3PL tracking merges before returning this shipment ID.
      const shipmentId = text(parcel.shipment_id);
      const easyshipId = /^ES[A-Z0-9]{6,}$/i.test(shipmentId) ? shipmentId : "";
      const number = text(parcel.tracking_number);
      const url = easyshipId ? `https://www.trackmyshipment.co/shipment-tracking/${encodeURIComponent(easyshipId)}`
        : safeTrackingUrl(parcel.tracking_url);
      const reference = easyshipId || number;
      const key = easyshipId || (number ? `${number}:${url || ""}` : url) || `${orderIndex}:${index}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, reference, carrier: text(parcel.carrier), number, url,
        status: trackingStatus(parcel, !!(reference || url)),
        unavailable: parcel.tracking_unavailable === true,
        updatedAt: text(parcel.tracking_updated_at),
      }];
    });
  });
}

export function shipmentActivity(shipment: ApiRecord) {
  const tracking = shipmentTracking(shipment);
  if (tracking.length) {
    if (tracking.every(parcel => parcel.status === "Delivered")) return "Delivered";
    if (tracking.some(parcel => parcel.status === "Delivered")) return "Partially delivered";
    const statuses = new Set(tracking.map(parcel => parcel.status));
    if (statuses.size === 1 && tracking[0].status !== "Shipment requested") return tracking[0].status;
    if (statuses.size > 1) return "Shipments in progress";
  }
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
