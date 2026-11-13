import "server-only";
import { commerce, DyliApiError } from "@/lib/dyli";
import { storefrontPolicy } from "@/lib/storefront-policy";
import type { ApiRecord } from "@/lib/types";

export async function loadStorefrontPacks(query = "limit=100") {
  const { includedIds } = storefrontPolicy();
  if (!includedIds.length) {
    const result = await commerce(`/catalog/packs?${query}`);
    const packs = result.packs || result.boxes || [];
    return { ...result, packs, boxes: packs };
  }
  // Fetch the selected boxes directly: an ID beyond the catalog's first page
  // must not silently disappear. DYLI still enforces its own catalog allowlist.
  const boxes: ApiRecord[] = [];
  for (let start = 0; start < includedIds.length; start += 8) {
    const batch = await Promise.all(includedIds.slice(start, start + 8).map(async (id) => {
      try { const result = await commerce(`/catalog/packs/${id}`); return (result.pack || result.box) as ApiRecord | undefined; }
      catch (error) {
        if (error instanceof DyliApiError && error.status === 404) return undefined;
        throw error;
      }
    }));
    boxes.push(...batch.filter((box): box is ApiRecord => Boolean(box)));
  }
  return { packs: boxes, boxes } as ApiRecord;
}
