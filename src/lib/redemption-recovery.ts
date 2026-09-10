import type { ApiRecord, Redemption } from "./types";

export type ShipmentRecovery = { id: string; hash?: string; attempted?: boolean };

export function parseShipmentRecovery(raw: string | null): ShipmentRecovery | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.id !== "string" || !value.id ||
        (value.hash != null && (typeof value.hash !== "string" || !/^0x[a-f\d]{64}$/i.test(value.hash))) ||
        (value.attempted != null && typeof value.attempted !== "boolean")) throw new Error();
    return value;
  } catch {
    throw new Error("Your saved shipment could not be read. Check your wallet activity before starting another shipment.");
  }
}

export function shipmentMayHaveBeenSent(redemption: Redemption | null, saved: ShipmentRecovery | null) {
  return Boolean(saved?.hash || saved?.attempted || redemption?.redemption_tx_hash ||
    (redemption && ["processing", "completed", "confirmed", "requires_action"].includes(redemption.status)));
}

export function redemptionNeedsRefresh(redemption: Redemption, now = Date.now()) {
  if (redemption.status === "expired" || redemption.status === "cancelled") return true;
  if (!["quoted", "prepared"].includes(redemption.status)) return false;
  const expiry = Date.parse(String(redemption.expires_at || ""));
  // Leave enough time to prepare/sign without racing the payment deadline.
  return !Number.isFinite(expiry) || expiry - now <= 30000;
}

export function shippingOptionReference(option: ApiRecord) {
  return String(option.courier_id || option.id || "");
}

export function redemptionDraft(redemption: Redemption) {
  const source = redemption.address;
  const fields = { name: "name", address1: "address_line_1", address2: "address_line_2", city: "city", state: "state", postal_code: "postal_code", country: "country_alpha2", phone: "phone" };
  const address = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, String(source[field] || "")]));
  const quantities = Object.fromEntries(redemption.items.map(item => [String(item.token_id), Number(item.quantity)]));
  return { address, quantities };
}

export function isShippingQuoteError(code: unknown) {
  return ["redemption_quote_expired", "redemption_not_quotable", "shipping_option_required",
    "shipping_option_unavailable", "shipping_options_unavailable"].includes(String(code));
}
