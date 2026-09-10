import "server-only";

import type { ApiRecord, CatalogItem, CatalogSurface } from "@/lib/types";
import { createCommerceClient, CommerceError } from "../../sdk/commerce-client.mjs";
import { publicApiError } from "@/lib/public-error";
import { limitUpstream, rateLimitResponse } from "@/lib/rate-limit";

const COMMERCE_BASE = process.env.DYLI_COMMERCE_BASE_URL || "https://www.dyli.io/api/commerce/v1";
// One base URL override is enough for an isolated lab; do not accidentally read
// production holdings or inventory while sending writes to a sandbox.
const READ_BASE = process.env.DYLI_READ_BASE_URL || new URL("/api/public/v1", COMMERCE_BASE).toString();

export class DyliApiError extends Error {
  status: number;
  payload: ApiRecord;

  constructor(status: number, payload: ApiRecord) {
    super(String(payload.message || payload.error || `DYLI request failed (${status})`));
    this.name = "DyliApiError";
    this.status = status;
    this.payload = payload;
  }
}

function requireApiKey() {
  const apiKey = process.env.DYLI_API_KEY?.trim();
  if (!apiKey) throw new DyliApiError(503, { error: "DYLI_API_KEY is not configured" });
  return apiKey;
}

async function request(base: string, path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("x-api-key", requireApiKey());
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  await limitUpstream(init.method);

  // Next's canonical API root has no trailing slash. Keep redirect rejection so
  // credentials cannot be forwarded to a different origin by an upstream redirect.
  const response = await fetch(`${base.replace(/\/+$/, "")}${path === "/" ? "" : path}`, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error",
    signal: init.signal || AbortSignal.timeout(60000),
  });
  const text = await response.text();
  let payload: ApiRecord = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || `DYLI request failed (${response.status})` };
  }
  if (!response.ok) throw new DyliApiError(response.status, payload);
  return payload;
}

export async function commerce(path: string, init: RequestInit = {}) {
  try {
    requireApiKey();
    await limitUpstream(init.method);
    return await createCommerceClient({
      apiKey: requireApiKey(),
      baseUrl: COMMERCE_BASE,
      timeoutMs: 60000,
    }).request<ApiRecord>(path, {
      method: init.method, headers: init.headers, signal: init.signal || undefined,
      ...(typeof init.body === "string" ? { body: JSON.parse(init.body) as ApiRecord } : {}),
    });
  } catch (error) {
    if (error instanceof CommerceError) throw new DyliApiError(error.status, {
      ...error.payload, request_id: error.requestId,
    });
    throw error;
  }
}

export function readApi(path: string, init: RequestInit = {}) {
  return request(READ_BASE, path, init);
}

const text = (value: unknown) => String(value ?? "").trim();

const firstImage = (raw: ApiRecord) => {
  const prize = raw.prizeProduct as ApiRecord | undefined;
  const images = Array.isArray(raw.images) ? raw.images : [];
  const overwritten = Array.isArray(raw.overwriteImages) ? raw.overwriteImages : [];
  const candidates = [
    raw.image_url,
    raw.image,
    raw.hero_image,
    raw.cover_image,
    raw.cover_image_url,
    raw.brand_logo,
    raw.pfp,
    prize?.image,
    images[0],
    overwritten[0],
  ];
  const found = candidates.find((value) => typeof value === "string" && value.trim());
  return found ? String(found) : null;
};

const itemPrice = (raw: ApiRecord) => {
  const pricing = raw.pricing as ApiRecord | undefined;
  const candidates = [
    raw.price,
    raw.price_usd,
    raw.displayPrice,
    raw.packPrice,
    raw.entryPrice,
    raw.unit_price,
    pricing?.price,
    pricing?.lowest_price,
  ];
  const match = candidates.map(Number).find((value) => Number.isFinite(value) && value >= 0);
  return match ?? null;
};

function rowsFor(payload: ApiRecord) {
  const keys = ["listings", "boxes", "items", "collections", "products", "redemptions"];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value as ApiRecord[];
  }
  if (payload.box && typeof payload.box === "object") return [payload.box as ApiRecord];
  if (payload.product && typeof payload.product === "object") return [payload.product as ApiRecord];
  if (payload.partnership && typeof payload.partnership === "object") return [payload.partnership as ApiRecord];
  return [];
}

export function normalizeCatalog(payload: ApiRecord, surface: CatalogSurface): CatalogItem[] {
  return rowsFor(payload).map((raw, index) => {
    const purchase = (raw.purchase || {}) as ApiRecord;
    const quoteItem = purchase.quote_item && typeof purchase.quote_item === "object"
      ? (purchase.quote_item as ApiRecord)
      : null;
    const prize = raw.prizeProduct as ApiRecord | undefined;
    const id = text(raw.listing_id ?? raw.item_id ?? raw.box_id ?? raw.machine_id ?? raw.order_id ?? raw.dropId ?? raw.id ?? raw.slug ?? raw.product_id ?? raw.productId ?? index);
    const type = text(quoteItem?.type || raw.market_type || surface);
    const availabilityValue = Number(raw.quantity_available ?? raw.inventory_count ?? raw.available ?? raw.supply);
    const displayName = surface === "redemptions"
      ? text(raw.product || raw.title || raw.name)
      : text(raw.name || raw.title || raw.product || prize?.title);
    const displayDescription = surface === "redemptions"
      ? [raw.type, raw.username ? `@${raw.username}` : null].filter(Boolean).join(" · ")
      : text(raw.description || raw.subtitle || (raw.seller as ApiRecord | undefined)?.username || raw.seller || raw.status);
    const brand = text(raw.brand || prize?.brand) || null;
    const cleanName = brand && displayName.toLowerCase().startsWith(`${brand.toLowerCase()} - `)
      ? displayName.slice(brand.length + 3)
      : displayName;

    return {
      key: `${surface}:${type}:${id}`,
      id,
      surface,
      type,
      name: cleanName || "Untitled collectible",
      description: displayDescription,
      image: firstImage(raw),
      brand,
      category: text(raw.category || prize?.category) || null,
      subcategory: text(raw.subcategory || prize?.subcategory) || null,
      price: itemPrice(raw),
      currency: text(raw.currency || "USD").toUpperCase(),
      availability: Number.isFinite(availabilityValue) ? availabilityValue : null,
      purchase: {
        supported: purchase.supported === true,
        action: text(purchase.action || "view"),
        reason: typeof purchase.reason === "string" ? purchase.reason : null,
        quoteItem,
      },
      raw,
    };
  });
}

export function apiErrorResponse(error: unknown) {
  const limited = rateLimitResponse(error);
  if (limited) return limited;
  if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON request" }, { status: 400 });
  if (error instanceof DyliApiError) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
    return Response.json(publicApiError(error.payload, status), { status, headers: { "Cache-Control": "private, no-store" } });
  }
  console.error(error);
  return Response.json({ error: "The request could not be completed. Please retry." }, { status: 500 });
}
