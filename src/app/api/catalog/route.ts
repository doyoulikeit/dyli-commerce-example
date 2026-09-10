import { apiErrorResponse, commerce, normalizeCatalog } from "@/lib/dyli";
import { applyBoxConfig, applyCatalogConfig, applyMarketplaceConfig, storefrontConfig } from "@/config/storefront";
import type { CatalogSurface } from "@/lib/types";
import { loadStorefrontBoxes } from "@/lib/storefront-boxes";

const SURFACES = new Set<CatalogSurface>([
  "explore", "listings", "boxes", "ebay", "collections", "fair-drops", "digital-packs", "redemptions", "search",
]);
const QUERY_KEYS = new Set(["q", "brand", "category", "subcategory", "min_price", "max_price", "sort", "limit", "offset", "product_id", "token_id"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requested = url.searchParams.get("surface") || "explore";
    if (!SURFACES.has(requested as CatalogSurface)) {
      return Response.json({ error: "Unknown catalog surface" }, { status: 400 });
    }
    const configuredSurface = storefrontConfig.catalog.surfaces.find((entry) => entry.id === requested);
    if (configuredSurface && !configuredSurface.enabled) {
      return Response.json({ items: [], pagination: null });
    }
    const params = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (QUERY_KEYS.has(key) && value.trim()) params.set(key, value.slice(0, 250));
    });
    if (requested === "redemptions") {
      const productId = params.get("product_id");
      if (!productId) return Response.json({ error: "product_id is required for redemption activity" }, { status: 400 });
      params.delete("product_id");
      params.set("productid", productId);
    }
    if (!params.has("limit")) params.set("limit", "48");
    const surface = requested as CatalogSurface;
    const payload = surface === "boxes"
      ? await loadStorefrontBoxes(params.toString())
      : await commerce(`/catalog/${surface}?${params}`);
    const limit = Math.min(100, Math.max(1, Number(params.get("limit") || 48)));
    const normalized = normalizeCatalog(payload, surface);
    const items = surface === "listings"
      ? applyMarketplaceConfig(normalized)
      : surface === "boxes"
        ? applyBoxConfig(normalized)
        : applyCatalogConfig(normalized);
    return Response.json({ items: items.slice(0, limit), pagination: payload.pagination || null });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
