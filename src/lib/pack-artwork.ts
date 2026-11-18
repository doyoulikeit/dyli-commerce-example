import type { ApiRecord, CatalogItem } from "./types";

export type PackArtwork = {
  version: 1;
  design_key: string;
  poster_url: string;
  model_url: string;
  texture_url: string;
  material_map_url?: string;
  renderer_url?: string;
};

const record = (value: unknown): ApiRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : {};
const publicUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

export function packArtwork(
  item: Pick<CatalogItem, "raw">,
  detail?: ApiRecord,
): PackArtwork | null {
  const source = record(detail?.artwork ?? item.raw?.artwork);
  const poster = publicUrl(source.poster_url),
    model = publicUrl(source.model_url),
    texture = publicUrl(source.texture_url);
  if (source.version !== 1 || !poster || !model || !texture) return null;
  return {
    version: 1,
    design_key: String(source.design_key || ""),
    poster_url: poster,
    model_url: model,
    texture_url: texture,
    material_map_url: publicUrl(source.material_map_url) || undefined,
    renderer_url: publicUrl(source.renderer_url) || undefined,
  };
}

export function packPoster(
  item: Pick<CatalogItem, "raw" | "image">,
  detail?: ApiRecord,
) {
  return packArtwork(item, detail)?.poster_url || item.image;
}

export function packBrand(brand: string | null) {
  return /^pok[eé]mon$/i.test(brand || "")
    ? "Pokémon"
    : brand || "Collectibles";
}

export function packIsRestocking(item: CatalogItem, detail?: ApiRecord) {
  const available =
    detail?.inventory_count ?? item.raw?.inventory_count ?? item.availability;
  return (
    (detail?.restocking ?? item.raw?.restocking) === true ||
    (detail?.out_of_stock ?? item.raw?.out_of_stock) === true ||
    (available != null &&
      Number.isFinite(Number(available)) &&
      Number(available) <= 0)
  );
}

export function currentPackItem(
  item: CatalogItem,
  detail: ApiRecord,
): CatalogItem {
  const price = detail.price_usd ?? detail.price;
  const available = detail.inventory_count;
  return {
    ...item,
    price:
      price != null &&
      price !== "" &&
      Number.isFinite(Number(price)) &&
      Number(price) >= 0
        ? Number(price)
        : item.price,
    availability:
      available != null && Number.isFinite(Number(available))
        ? Number(available)
        : item.availability,
    image: packPoster(item, detail),
    raw: { ...item.raw, ...detail },
  };
}
