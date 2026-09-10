import type { CatalogItem, CatalogSurface } from "@/lib/types";

type SurfaceConfig = { id: CatalogSurface; label: string; enabled: boolean };

export const storefrontConfig = {
  brand: {
    name: process.env.NEXT_PUBLIC_STOREFRONT_NAME || "Vaulted",
    mark: "V",
    tagline: "Collect what you love.",
  },
  demo: {
    // POC purchases live in sessionStorage and never submit a payment or transaction.
    enabled: ["true", "force"].includes(process.env.NEXT_PUBLIC_DEMO_MODE || ""),
    force: process.env.NEXT_PUBLIC_DEMO_MODE === "force",
    storageKey: "vaulted-demo-session-v1",
  },
  navigation: {
    boxesOnly: process.env.NEXT_PUBLIC_BOXES_ONLY === "true",
    showActivity: true,
    showCollection: true,
  },
  checkout: {
    // Manual queue is a temporary pilot mode. Only item types that complete
    // through a customer action should be purchasable until an executor is live.
    manualQueuePurchaseTypes: ["box"] as string[],
  },
  transactions: {
    sponsored: Boolean(process.env.NEXT_PUBLIC_ABSTRACT_PAYMASTER),
  },
  catalog: {
    surfaces: [
      { id: "explore", label: "Featured", enabled: false },
      { id: "listings", label: "Shop", enabled: process.env.NEXT_PUBLIC_BOXES_ONLY !== "true" },
      { id: "boxes", label: "Boxes", enabled: true },
      { id: "ebay", label: "eBay", enabled: false },
      { id: "collections", label: "Collections", enabled: false },
      { id: "fair-drops", label: "Drops", enabled: false },
      { id: "digital-packs", label: "Packs", enabled: false },
    ] satisfies SurfaceConfig[],
    marketplaceBrands: ["Pokemon", "One Piece"] as readonly string[],
    marketplaceSubcategories: [
      "Graded Card",
      "Booster Pack",
      "Booster Box",
      "Booster Bundle",
    ] as readonly string[],
    liveBoxesOnly: true,
    excludeRestockingBoxes: true,
    // Examples: ["MetaZoo", "Yu-Gi-Oh!"]. Matching is case-insensitive.
    hiddenBrands: [] as string[],
    // Example: ["Comics"].
    hiddenCategories: [] as string[],
    // Example: ["Unsealed"].
    hiddenSubcategories: [] as string[],
    // Use live DYLI box/product IDs. Example: ["pack-ripper", 42].
    featuredBoxIds: [] as Array<string | number>,
    showAvailability: false,
    showExpectedValue: false,
  },
} as const;

const hidden = (value: string | null, values: readonly string[]) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized
    ? values.some((entry) => entry.trim().toLowerCase() === normalized)
    : false;
};

export function applyCatalogConfig(items: CatalogItem[]) {
  return items.filter(
    (item) =>
      !hidden(item.brand, storefrontConfig.catalog.hiddenBrands) &&
      !hidden(item.category, storefrontConfig.catalog.hiddenCategories) &&
      !hidden(item.subcategory, storefrontConfig.catalog.hiddenSubcategories),
  );
}

const sameText = (left: string | null, right: string) =>
  String(left || "")
    .trim()
    .toLowerCase() === right.trim().toLowerCase();

export function applyMarketplaceConfig(items: CatalogItem[]) {
  return applyCatalogConfig(items).filter(
    (item) =>
      storefrontConfig.catalog.marketplaceBrands.some((brand) =>
        sameText(item.brand, brand),
      ) &&
      storefrontConfig.catalog.marketplaceSubcategories.some((subcategory) =>
        sameText(item.subcategory, subcategory),
      ),
  );
}

export function applyBoxConfig(items: CatalogItem[]) {
  return applyCatalogConfig(items).filter((item) => {
    const inventory = Number(
      item.raw.inventory_count ?? item.availability ?? 0,
    );
    const live =
      !storefrontConfig.catalog.liveBoxesOnly || item.raw.live === true;
    const notRestocking =
      !storefrontConfig.catalog.excludeRestockingBoxes ||
      item.raw.restocking === false;
    return live && notRestocking && inventory > 0;
  });
}

export function orderConfiguredBoxes(items: CatalogItem[]) {
  const order = new Map(
    storefrontConfig.catalog.featuredBoxIds.map((id, index) => [
      String(id),
      index,
    ]),
  );
  if (!order.size) return items;
  return [...items].sort(
    (left, right) =>
      (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function applyOptionConfig(
  values: unknown,
  hiddenValues: readonly string[],
) {
  if (!Array.isArray(values)) return [];
  return values.map(String).filter((value) => !hidden(value, hiddenValues));
}
