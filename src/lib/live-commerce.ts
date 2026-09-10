import type {
  ApiRecord,
  BoxPlay,
  CatalogItem,
  TransactionInstruction,
} from "./types.ts";
import type { OpeningPreferences } from "./opening-preferences.ts";

export const asRecord = (value: unknown): ApiRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : {};
export const asRows = (value: unknown): ApiRecord[] =>
  Array.isArray(value) ? value.map(asRecord) : [];
export const usd = (value: unknown) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value) || 0,
  );
export const waitingForAccount = (ready: boolean, authenticated: boolean, wallet: string, sessionWallet?: string) =>
  !ready || (authenticated && (!wallet || wallet.toLowerCase() !== sessionWallet?.toLowerCase()));

export function settlementSummary(decisions: Array<"claim" | "sell_back">, rewards: Array<{ buyback_amount: number }>) {
  const sold = decisions.filter(choice => choice === "sell_back").length;
  const claimed = decisions.filter(choice => choice === "claim").length;
  const cents = rewards.reduce((total, reward, index) => total +
    (decisions[index] === "sell_back" ? Math.round(Number(reward.buyback_amount || 0) * 100) : 0), 0);
  const cash = usd(cents / 100);
  return {
    sold, claimed, cash,
    title: sold && claimed ? "A little cash. A little collection." : sold ? "Turn your pulls into cash" : "Make them yours",
    action: sold && claimed ? "Confirm sell & vault" : sold ? `Sell for ${cash}` : `Vault ${claimed} ${claimed === 1 ? "item" : "items"}`,
    progress: sold && claimed ? "Selling and vaulting your pulls…" : sold ? "Adding cash to your balance…" : "Adding your pulls to your vault…",
    success: sold && claimed ? `${cash} added to your balance · ${claimed} vaulted` : sold ? `${cash} added to your balance` : `${claimed} ${claimed === 1 ? "collectible" : "collectibles"} added to your vault`,
  };
}
export const assetImage = (item: ApiRecord): string | null => {
  const images = Array.isArray(item.images) ? item.images : [];
  const first = [item.image_url, item.image, images[0]].find(
    (value) => typeof value === "string" && /^https?:\/\//.test(value),
  );
  return typeof first === "string" ? first : null;
};
export const boxItem = (item: CatalogItem) =>
  item.surface === "boxes" || item.purchase.quoteItem?.type === "box";
export const quantityLimit = (item: CatalogItem) =>
  Math.max(0, Math.min(boxItem(item) ? 10 : 1, item.availability ?? 0));

export function checkoutOrigin(
  configured: string | undefined,
  requestUrl: string,
  production: boolean,
) {
  if (production && !configured?.trim())
    throw new Error(
      "STOREFRONT_ORIGIN must be configured before accepting card payments",
    );
  const url = new URL(configured?.trim() || requestUrl);
  if (
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol) ||
    (production && url.protocol !== "https:")
  )
    throw new Error("Configure a secure storefront origin for card payments");
  return url.origin;
}

export type PurchaseRecovery = {
  version: 1;
  key: string;
  wallet: string;
  item: CatalogItem;
  quote?: ApiRecord;
  payment?: ApiRecord;
  paymentHash?: string;
  paymentAttempted?: boolean;
  stripeSessionId?: string;
  stripeUiMode?: "hosted" | "embedded";
  stripeReturnUrl?: string;
  orderId?: string;
  playId?: string;
  buyHash?: string;
  openingReference?: string;
  finalizeHash?: string;
  decisions?: Array<"claim" | "sell_back">;
  openingPreferences?: OpeningPreferences;
};

export const canClearBalanceRecovery = (flow: PurchaseRecovery | null) =>
  !!flow && !!(flow.paymentAttempted || flow.paymentHash) &&
  !flow.stripeSessionId && !flow.orderId && !flow.playId &&
  !flow.buyHash && !flow.finalizeHash;

export function parseRecovery(
  value: string | null,
  wallet: string,
): PurchaseRecovery | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PurchaseRecovery;
    return parsed.version === 1 &&
      parsed.wallet === wallet.toLowerCase() &&
      typeof parsed.key === "string" &&
      parsed.item?.id
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function validateTransaction(
  tx: TransactionInstruction,
  wallet: string,
  chainId: number,
) {
  if (
    ![2741, 11124].includes(chainId) ||
    tx.chain_id !== chainId ||
    tx.chain !== "abstract" ||
    tx.from.toLowerCase() !== wallet.toLowerCase() ||
    !/^0x[\da-f]{40}$/i.test(tx.to) ||
    !/^0x(?:[\da-f]{2})+$/i.test(tx.data) ||
    !/^(0|0x0)$/.test(tx.value)
  ) {
    throw new Error("Transaction does not match this wallet or network");
  }
  return tx;
}

export const pendingBoxPlays = (plays: BoxPlay[]) =>
  plays.filter((play) => play.status !== "completed");
export const receiptRequired = (flow: PurchaseRecovery) =>
  Boolean(
    flow.paymentAttempted ||
      flow.paymentHash ||
      flow.stripeSessionId ||
      flow.orderId,
  );

// A saved quote is only a display cache. Call this with the freshly authenticated
// server response, never the quote/payment object restored from browser storage.
export function balancePaymentCents(
  quote: ApiRecord,
  expectedId: unknown,
  now = Date.now(),
) {
  if (quote.id !== expectedId || quote.status !== "open")
    throw new Error("Get a new quote before paying");
  if (
    !Number.isFinite(Date.parse(String(quote.expires_at))) ||
    Date.parse(String(quote.expires_at)) - now < 120000
  ) {
    throw new Error("This price is expiring. Get a new quote before paying.");
  }
  const cents = Number(asRecord(quote.price_breakdown).total_cents);
  if (!Number.isSafeInteger(cents) || cents <= 0)
    throw new Error("Invalid quote total");
  return cents;
}

export function catalogFromOrderLine(line: ApiRecord): CatalogItem {
  const id = String(line.box_id || line.listing_id || line.id || "");
  const isBox = line.type === "box";
  return {
    id,
    key: `order:${id}`,
    surface: isBox ? "boxes" : "listings",
    type: String(line.type),
    name: String(line.name || "Collectible"),
    image: assetImage(line),
    description: "",
    price: Number(line.unit_amount_cents || 0) / 100,
    currency: "USD",
    brand: String(line.brand || ""),
    category: String(line.category || ""),
    subcategory: String(line.subcategory || ""),
    availability: Number(line.quantity),
    raw: line,
    purchase: {
      supported: false,
      action: "view",
      reason: null,
      quoteItem: null,
    },
  };
}
