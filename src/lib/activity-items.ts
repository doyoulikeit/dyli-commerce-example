import { asRecord, asRows, assetImage } from "./live-commerce";
import type { ApiRecord } from "./types.ts";

// Activity survives an item leaving the vault. Resolve names/art by token,
// using existing order/pull data first and one batched metadata read as needed.
export async function enrichActivityItems(sales: ApiRecord[], shipments: ApiRecord[], sources: ApiRecord[],
  metadata: (tokenIds: string[]) => Promise<ApiRecord[]>) {
  const catalog = new Map<string, ApiRecord>();
  for (const item of sources) {
    const token = String(item.token_id || "");
    if (token) catalog.set(token, { ...catalog.get(token), ...item });
  }
  const tokens = [...new Set([...sales.map(sale => String(sale.token_id)),
    ...shipments.flatMap(shipment => asRows(shipment.items).map(item => String(item.token_id)))])];
  const missing = tokens.filter(token => /^\d+$/.test(token) && (!catalog.get(token)?.name || !assetImage(catalog.get(token) || {})));
  for (let index = 0; index < missing.length; index += 50) {
    // Missing artwork must never turn a completed payment into an account error.
    try {
      for (const item of await metadata(missing.slice(index, index + 50))) {
        if (item.found !== false) catalog.set(String(item.token_id), { ...catalog.get(String(item.token_id)), ...item });
      }
    } catch { /* Existing snapshots remain usable when metadata is unavailable. */ }
  }
  return {
    sales: sales.map(sale => ({ ...sale, item: { ...catalog.get(String(sale.token_id)), ...asRecord(sale.item), token_id: sale.token_id } })),
    shipments: shipments.map(shipment => ({ ...shipment, items: asRows(shipment.items).map(item => ({ ...catalog.get(String(item.token_id)), ...item })) })),
  };
}
