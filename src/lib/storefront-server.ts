import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";

import {
  applyBoxConfig,
  applyMarketplaceConfig,
  applyOptionConfig,
  orderConfiguredBoxes,
  storefrontConfig,
} from "@/config/storefront";
import { commerce, normalizeCatalog, readApi } from "@/lib/dyli";
import { shopEnabled } from "@/lib/commerce-runtime";
import type { ApiRecord, StorefrontResponse } from "@/lib/types";
import { loadStorefrontBoxes } from "@/lib/storefront-boxes";
import { publicStorefrontReadiness } from "@/lib/public-storefront";

const SHOP_LIMIT_PER_VIEW = 48;

async function optional(path: string) {
  try {
    return await commerce(path);
  } catch {
    return {} as ApiRecord;
  }
}

async function optionalRead(path: string) {
  try {
    return await readApi(path);
  } catch {
    return {} as ApiRecord;
  }
}

function enrichBoxes(commercePayload: ApiRecord, publicPayload: ApiRecord) {
  const commerceBoxes = Array.isArray(commercePayload.boxes)
    ? (commercePayload.boxes as ApiRecord[])
    : [];
  const publicBoxes = Array.isArray(publicPayload.boxes)
    ? (publicPayload.boxes as ApiRecord[])
    : [];
  const publicById = new Map(
    publicBoxes.map((box) => [String(box.box_id), box]),
  );
  return {
    boxes: commerceBoxes.map((box) => {
      const publicBox = publicById.get(String(box.box_id)) || {};
      return {
        ...publicBox,
        ...box,
        image_url:
          box.image_url || publicBox.image_url || publicBox.cover_image_url,
        cover_image_url:
          box.cover_image_url ||
          publicBox.cover_image_url ||
          publicBox.image_url,
      };
    }),
  } as ApiRecord;
}

function balancedShopItems(
  items: ReturnType<typeof normalizeCatalog>,
  limit: number,
) {
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.brand || "Other"}:${item.subcategory || "Other"}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  const selected: typeof items = [];
  let index = 0;
  while (selected.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      if (group[index]) {
        selected.push(group[index]);
        added = true;
        if (selected.length === limit) return selected;
      }
    }
    if (!added) return selected;
    index += 1;
  }
  return selected;
}

async function loadShopCatalog() {
  const [brandPayloads, bundlePayload] = await Promise.all([
    Promise.all(
      storefrontConfig.catalog.marketplaceBrands.map((brand) =>
        commerce(
          `/catalog/listings?brand=${encodeURIComponent(brand)}&limit=100`,
        ),
      ),
    ),
    commerce(
      `/catalog/listings?brand=${encodeURIComponent(storefrontConfig.catalog.marketplaceBrands[0])}&subcategory=Booster%20Bundle&limit=100`,
    ),
  ]);
  const payloads = [...brandPayloads, bundlePayload];
  const listings = [
    ...new Map(
      applyMarketplaceConfig(
        payloads.flatMap((payload) => normalizeCatalog(payload, "listings")),
      ).map((item) => [item.key, item]),
    ).values(),
  ];
  const graded = listings.filter(
    (item) => item.subcategory?.toLowerCase() === "graded card",
  );
  const sealed = listings.filter(
    (item) => item.subcategory?.toLowerCase() !== "graded card",
  );
  return [
    ...balancedShopItems(graded, SHOP_LIMIT_PER_VIEW),
    ...balancedShopItems(sealed, SHOP_LIMIT_PER_VIEW),
  ];
}

async function loadStorefrontUncached(): Promise<StorefrontResponse> {
  const readinessPromise = commerce("/");
  const [readiness, listings, boxes, publicBoxes, options] = await Promise.all([
    readinessPromise,
    readinessPromise.then(readiness =>
      shopEnabled(readiness, storefrontConfig.navigation.boxesOnly) ? loadShopCatalog() : [],
    ),
    loadStorefrontBoxes(),
    optionalRead("/boxes?limit=100"),
    optional("/catalog/options"),
  ]);
  const rawOptions = (options.options || {}) as ApiRecord;
  const publicReadiness = publicStorefrontReadiness(readiness);
  return {
    readiness: publicReadiness,
    partner: publicReadiness.partner as ApiRecord,
    catalog: listings,
    boxes: orderConfiguredBoxes(
      applyBoxConfig(
        normalizeCatalog(enrichBoxes(boxes, publicBoxes), "boxes"),
      ),
    ).slice(0, process.env.INCLUDED_IDS?.trim() ? 100 : 48),
    options: {
      brands: applyOptionConfig(
        rawOptions.brands,
        storefrontConfig.catalog.hiddenBrands,
      ).filter((brand) =>
        storefrontConfig.catalog.marketplaceBrands.some(
          (allowed) => allowed.toLowerCase() === brand.toLowerCase(),
        ),
      ),
      categories: applyOptionConfig(
        rawOptions.categories,
        storefrontConfig.catalog.hiddenCategories,
      ),
      subcategories: [...storefrontConfig.catalog.marketplaceSubcategories],
    },
  };
}

export const loadStorefront = unstable_cache(
  loadStorefrontUncached,
  [
    "vaulted-storefront-v4",
    createHash("sha256")
      .update(
        JSON.stringify({
          apiKey: process.env.DYLI_API_KEY || "",
          commerceBase: process.env.DYLI_COMMERCE_BASE_URL || "",
          readBase: process.env.DYLI_READ_BASE_URL || "",
          config: storefrontConfig,
          includedIds: process.env.INCLUDED_IDS || "",
          flatFee: process.env.FLAT_FEE || "",
          percentFee: process.env.PERCENT_FEE || "",
        }),
      )
      .digest("hex"),
  ],
  { revalidate: 60, tags: ["vaulted-storefront"] },
);
