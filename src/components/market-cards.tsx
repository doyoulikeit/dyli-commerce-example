"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Art } from "./live-catalog";
import { asRecord, asRows, assetImage, usd } from "@/lib/live-commerce";
import type { ApiRecord } from "@/lib/types";

export async function publicMarket(params: Record<string, string>, signal?: AbortSignal): Promise<ApiRecord> {
  const response = await fetch(`/api/community?${new URLSearchParams(params)}`, { signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Could not load the marketplace. Please try again.");
  return body;
}

export function MarketCard({ item, wallet, onClick }: { item: ApiRecord; wallet: string; onClick: () => void }) {
  const product = asRecord(item.product);
  const owned = Boolean(wallet) && String(item.maker).toLowerCase() === wallet.toLowerCase();
  return <button className="cm-market-card" onClick={onClick}>
    <div className="cm-art">
      <Art src={assetImage(product)} name={String(product.name)} />
      {(owned || item.kind === "offer" || Number(item.quantity) > 1) && <span className="cm-chip">
        {owned ? "Yours" : item.kind === "offer" ? "Offer" : `${item.quantity} available`}
      </span>}
    </div>
    <small>{String(product.brand || "Collectible")}</small>
    <h3>{String(product.name)}</h3>
    <div className="cm-card-price"><strong>{usd(Number(item.price))}</strong><ArrowUpRight size={19} /></div>
    <p>@{String(asRecord(item.collector).username || "collector")}</p>
  </button>;
}

export function MarketSkeleton() {
  return <div className="cm-grid" aria-label="Loading marketplace" aria-busy="true">
    {[0, 1, 2, 3].map(key => <div className="cm-skeleton" key={key} />)}
  </div>;
}

export function MarketplacePreview({ wallet, onViewAll, onSelect }: {
  wallet: string; onViewAll: () => void; onSelect: (item: ApiRecord) => void;
}) {
  const [items, setItems] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void publicMarket({ kind: "listing" }, controller.signal).then(data => {
      if (!controller.signal.aborted) setItems(asRows(data.items).slice(0, 4));
    }).catch(failure => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load the marketplace");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  return <section className="cm-preview" aria-labelledby="marketplace-preview-heading">
    <div className="lc-section-title"><h2 id="marketplace-preview-heading">Marketplace</h2>
      <button onClick={onViewAll}>View all <ArrowUpRight /></button>
    </div>
    {loading ? <MarketSkeleton /> : error ? <div className="cm-preview-notice" role="alert">
      <p>{error}</p><button className="lc-secondary" onClick={() => { setLoading(true); setError(""); setRetry(value => value + 1); }}>Try again</button>
    </div> : items.length ? <div className="cm-grid">{items.map(item => <MarketCard key={String(item.order_id)} item={item} wallet={wallet} onClick={() => onSelect(item)} />)}</div>
      : <div className="cm-preview-notice"><p>No listings yet. Explore offers or list something from your vault.</p><button className="lc-secondary" onClick={onViewAll}>Explore marketplace <ArrowUpRight size={17} /></button></div>}
  </section>;
}
