"use client";

import { Art } from "@/components/live-catalog";
import { assetImage, usd } from "@/lib/live-commerce";
import type { ApiRecord } from "@/lib/types";
import { useEffect, useRef, useState } from "react";
import { activeVaultOffers, loadVaultOfferSnapshot, type VaultOffersApi } from "@/lib/vault-offers";
import type { VaultOffer } from "@/lib/types";

export function LiveVaultCard({ item, api, sellingAvailable, onOpen, onShip }: {
  item: ApiRecord; api: VaultOffersApi; sellingAvailable: boolean; onOpen: () => void; onShip: () => void;
}) {
  const name = String(item.name || "Collectible");
  const tokenId = String(item.token_id);
  const element = useRef<HTMLElement>(null);
  const [offers, setOffers] = useState<VaultOffer[]>([]);
  const [owned, setOwned] = useState<boolean | null>(null);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (fresh = !sellingAvailable) => {
      try {
        const snapshot = await loadVaultOfferSnapshot(api, tokenId, fresh);
        const next = snapshot.offers;
        if (disposed) return;
        setOffers(next); setOwned(snapshot.owned);
        if (next.length) timer = setTimeout(() => { setOffers([]); void load(true); },
          Math.max(1000, Math.min(2147483647, Math.min(...next.map(offer => Date.parse(offer.expires_at))) - Date.now() + 100)));
      } catch { if (!disposed) setOffers([]); }
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: "100px" });
    if (element.current) observer.observe(element.current);
    return () => { disposed = true; observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [api, tokenId, sellingAvailable]);
  const offer = activeVaultOffers(offers)[0];
  return <article className="lc-vault-card" ref={element}>
    <button className="lc-product" onClick={onOpen} aria-label={`View ${name}`}>
      <Art src={assetImage(item)} name={name} />
      <span className="lc-product-info"><strong>{name}</strong><span>{usd(item.estimated_unit_value_usd)}</span></span>
      {owned !== false && <small>{Number(item.balance)} in vault</small>}
    </button>
    {owned !== false && <div className="lc-vault-card-actions">
      <button className="lc-primary" onClick={onOpen} aria-label={`Sell ${name}${offer ? ` for ${usd(offer.price)}` : ""}`}>Sell{offer ? ` ${usd(offer.price)}` : ""}</button>
      <button className="lc-secondary" onClick={onShip} aria-label={`Ship ${name}`}>Ship</button>
    </div>}
    {owned === false && <p role="status">No longer in this vault</p>}
    {offer?.type === "claim_buyback" && <p className="lc-vault-card-offer">48-hour claim offer{offer.standing_offer_price != null ? <><br />Current standing offer: {usd(offer.standing_offer_price)}</> : null}</p>}
  </article>;
}
