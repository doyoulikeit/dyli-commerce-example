"use client";

import { useEffect, useState } from "react";
import { Art } from "./live-catalog";
import { asRecord, asRows, assetImage, usd } from "@/lib/live-commerce";
import type { CommunityAction } from "@/lib/community";
import type { CommunityApi } from "./community-market";

const labels: Record<string, string> = {
  list: "Listed", offer: "Offer made", buy: "Purchased", accept_offer: "Offer accepted",
  cancel_listing: "Listing canceled", cancel_offer: "Offer canceled", trade: "Trade sent",
  accept_trade: "Trade accepted", cancel_trade: "Trade canceled",
};

export function CommunityActivity({ api, hasOtherActivity }: { api: CommunityApi; hasOtherActivity: boolean }) {
  const [rows, setRows] = useState<CommunityAction[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const result = await api<{ actions: CommunityAction[] }>("/api/community", { action: "history" });
        if (active) {
          setRows(result.actions.filter(row => row.status === "completed" || Boolean(row.tx_hash)));
          setError("");
        }
      } catch {
        if (active) setError("Marketplace and trade activity could not load.");
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [api, revision]);
  if (loading) return <p className="cm-note" role="status">Loading marketplace and trade activity…</p>;
  if (error) return <div className="cm-resume" role="alert"><p>{error}</p><button className="lc-secondary" onClick={() => setRevision(value => value + 1)}>Try again</button></div>;
  if (!rows.length) return hasOtherActivity ? null : <div className="cm-empty"><h2>No activity yet</h2><p>Your purchases, listings, offers and trades will appear here.</p></div>;
  return <section className="lc-order-history" aria-label="Marketplace and trades"><h2>Marketplace &amp; trades</h2>{rows.map(row => {
    const preview = asRecord(row.input.preview), product = asRecord(preview.product);
    const items = product.name ? [product] : [...asRows(preview.give), ...asRows(preview.receive)];
    const item = items[0] || {}, count = Number(row.input.quantity || 1);
    const amount = Number(row.input.expected_amount || row.input.unit_amount || 0) / 1e6;
    const date = new Date(row.created_at);
    return <article className="lc-order-entry" key={row.id}><div className="lc-order-heading">
      {items.length > 0 && <Art src={assetImage(item)} name={String(item.name || "Collectible")} />}
      <div className="lc-order-copy"><h2>{String(product.name || (row.input.collector ? `Trade with @${row.input.collector}` : labels[row.kind]))}</h2>
        <p><span>{row.status === "completed" ? labels[row.kind] : "Awaiting confirmation"}</span>
          {!row.kind.includes("trade") && <strong>×{count}</strong>}
          {!Number.isNaN(date.getTime()) && <time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>}
        </p>
      </div>
      {amount > 0 && <div className="lc-order-amount"><strong>{usd(amount)}</strong><small>{row.kind === "buy" ? "Purchase total" : row.kind === "accept_offer" ? "Offer amount" : "Price per item"}</small></div>}
    </div></article>;
  })}</section>;
}
