import type { ApiRecord, VaultOffer } from "./types";

export type VaultOffersApi = <T>(path: string, body?: ApiRecord) => Promise<T>;
type Entry = { offers: VaultOffer[]; loaded: number };
const cache = new WeakMap<VaultOffersApi, Map<string, Entry>>();
const pending = new WeakMap<VaultOffersApi, Map<string, Promise<VaultOffer[]>>>();
const waiting: Array<() => void> = [];
let active = 0;

export const activeVaultOffers = (offers: VaultOffer[], now = Date.now()) => offers
  .filter(offer => Number.isFinite(offer.price) && offer.price > 0 && Date.parse(offer.expires_at) > now)
  .sort((a, b) => b.price - a.price || Date.parse(a.expires_at) - Date.parse(b.expires_at));

// Card previews share their authenticated request with the detail sheet. A
// large vault must not fan out a separate RPC-backed discovery for every item.
export async function loadVaultOffers(api: VaultOffersApi, tokenId: string, fresh = false): Promise<VaultOffer[]> {
  let requests = pending.get(api);
  if (!requests) { requests = new Map(); pending.set(api, requests); }
  const inFlight = requests.get(tokenId);
  if (inFlight) return inFlight;
  let entries = cache.get(api);
  if (!entries) { entries = new Map(); cache.set(api, entries); }
  const saved = entries.get(tokenId);
  if (!fresh && saved && Date.now() - saved.loaded < 30000 &&
      saved.offers.every(offer => Date.parse(offer.expires_at) > Date.now())) return activeVaultOffers(saved.offers);
  const request = (async () => {
    await new Promise<void>(resolve => {
      const start = () => { active++; resolve(); };
      if (active < 2) start(); else waiting.push(start);
    });
    try {
      const result = await api<{ offers: VaultOffer[] }>("/api/offers", { action: "query", tokenId });
      const offers = activeVaultOffers(result.offers);
      entries.set(tokenId, { offers, loaded: Date.now() });
      return offers;
    } finally { active--; waiting.shift()?.(); }
  })().finally(() => requests.delete(tokenId));
  requests.set(tokenId, request);
  return request;
}
