import type { ApiRecord, Redemption, TransactionInstruction } from "./types";

export type ShipmentRecovery = { id: string; hash?: string; attempted?: boolean; approvalHash?: string; approvalAttempted?: boolean };

export function parseShipmentRecovery(raw: string | null): ShipmentRecovery | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.id !== "string" || !value.id ||
        (value.hash != null && (typeof value.hash !== "string" || !/^0x[a-f\d]{64}$/i.test(value.hash))) ||
        (value.attempted != null && typeof value.attempted !== "boolean") ||
        (value.approvalHash != null && !/^0x[a-f\d]{64}$/i.test(value.approvalHash)) ||
        (value.approvalAttempted != null && typeof value.approvalAttempted !== "boolean")) throw new Error();
    return value;
  } catch {
    throw new Error("Your saved shipment could not be read. Check your wallet activity before starting another shipment.");
  }
}

export async function sendShipmentTransaction({ recovery, approval = false, transaction, expiresAt, send, save }: {
  recovery: ShipmentRecovery; approval?: boolean; transaction: TransactionInstruction; expiresAt?: string;
  send: (tx: TransactionInstruction, expiresAt?: string) => Promise<`0x${string}`>;
  save: (value: ShipmentRecovery) => void;
}) {
  const hashField = approval ? "approvalHash" : "hash", attemptField = approval ? "approvalAttempted" : "attempted";
  if (recovery[hashField]) return recovery[hashField] as `0x${string}`;
  if (recovery[attemptField]) throw new Error("A transaction was started. Enter its reference from your wallet history to continue.");
  const pending = { ...recovery, [attemptField]: true };
  save(pending);
  try {
    const hash = await send(transaction, expiresAt);
    save({ ...pending, [hashField]: hash });
    return hash;
  } catch (failure) {
    const error = failure as { broadcastAttempted?: boolean; code?: number | string; transactionHash?: string };
    if (error.broadcastAttempted === false || (error.broadcastAttempted !== true && [4001, "ACTION_REJECTED"].includes(error.code!)))
      save({ ...recovery, [attemptField]: false });
    else if (error.transactionHash && /^0x[a-f\d]{64}$/i.test(error.transactionHash))
      save({ ...pending, [hashField]: error.transactionHash });
    throw failure;
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
