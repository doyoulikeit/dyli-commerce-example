import type { ApiRecord, CatalogItem } from './types';
export type DemoPull = { id: string; name: string; image: string; brand: string; grade: string; value: number; buyback: number; tier: string; odds: number };
const record = (value: unknown): ApiRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {};
const rows = (value: unknown): ApiRecord[] => Array.isArray(value) ? value.map(record) : [];
const count = (item: ApiRecord) => Math.max(0, Number(item.qty_in_box ?? item.qty_remaining ?? 1) || 0);
function weighted<T>(items: T[], weight: (item: T) => number, random: () => number) {
  let value = random() * items.reduce((sum,item) => sum + weight(item),0);
  return items.find(item => (value -= weight(item)) < 0) || items.at(-1)!;
}
// Presentation only. Never reserves inventory, signs or calls a write API.
export function drawDemoPulls(data: ApiRecord, item: CatalogItem, quantity: number, random = Math.random): DemoPull[] {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw Error('Choose between 1 and 10 demo packs.');
  const box = record(data.pack ?? data.box);
  const groups = rows(record(data.ranges).ranges).map(range => ({ ...range, rate: Number(range.rate ?? 0), items: rows(range.items).filter(card => count(card) > 0) })).filter(range => range.rate > 0 && Number.isFinite(range.rate) && range.items.length);
  if (!groups.length) throw Error('This pack isn’t available for a demo yet. Try another pack.');
  return Array.from({length: quantity}, () => {
    const range = weighted(groups, group => group.rate, random), card = weighted(range.items, count, random);
    const value = Math.max(0, Number(card.box_price ?? card.fmv_usd ?? card.price ?? 0) || 0);
    const rate = Math.max(0, Number(box.buyback_rate ?? item.raw?.buyback_rate ?? 0) || 0);
    const image = [card.image_url,card.image,...(Array.isArray(card.images) ? card.images : [])].find(value => typeof value === 'string' && value);
    return { id: String(card.token_id ?? card.product_id ?? card.id ?? card.name), name: String(card.name || card.product_name || 'Collectible'), image: String(image || ''), brand: String(card.brand || item.brand || 'Collectible'), grade: String(card.cert || card.subcategory || 'Collectible'), value, buyback: Math.max(0, Number(card.buyback_price ?? value * rate) || 0), tier: String(range.range_name || 'Pull'), odds: range.rate };
  });
}
