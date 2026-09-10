import "server-only";
import { commerce, DyliApiError } from "@/lib/dyli";
import { storefrontPolicy } from "@/lib/storefront-policy";
import type { ApiRecord } from "@/lib/types";

export async function loadStorefrontBoxes(query = "limit=100") {
  const { includedIds } = storefrontPolicy();
  if (!includedIds.length) return commerce(`/catalog/boxes?${query}`);
  // Fetch the selected boxes directly: an ID beyond the catalog's first page
  // must not silently disappear. DYLI still enforces its own catalog allowlist.
  const boxes: ApiRecord[] = [];
  for (let start = 0; start < includedIds.length; start += 8) {
    const batch = await Promise.all(includedIds.slice(start, start + 8).map(async (id) => {
      try { return (await commerce(`/catalog/boxes/${id}`)).box as ApiRecord | undefined; }
      catch (error) {
        if (error instanceof DyliApiError && error.status === 404) return undefined;
        throw error;
      }
    }));
    boxes.push(...batch.filter((box): box is ApiRecord => Boolean(box)));
  }
  return { boxes } as ApiRecord;
}
