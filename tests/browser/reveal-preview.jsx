// Local presentation fixture. No wallet, account session, or write endpoints.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LiveReveal } from "../../src/components/live-reveal";
import { LiveActivity } from "../../src/components/live-activity";
import { CommerceProgress } from "../../src/components/commerce-progress";
import { Art, LiveProductDetail, LiveModal } from "../../src/components/live-catalog";
import { RevealModeSelector } from "../../src/components/reveal-mode";
import { useOpeningPreferences } from "../../src/components/use-opening-preferences";
import { normalizeOpeningPreferences } from "../../src/lib/opening-preferences";
import { BalancePreview } from "./balance-preview";
import "../../src/app/globals.css";
import "../../src/components/live-storefront.css";
import "../../src/components/live-reveal.css";

const source = await (await fetch("/fixtures/reveal")).json();
const choices = source.ranges.filter(range => range.items?.length).map(range => ({
  product: range.items[0], rarity: range.range_name,
}));
const params = new URLSearchParams(location.search);
const quantity = Math.max(1, Math.min(10, Number(params.get("quantity") || 3)));
const item = { id: "12997", name: source.box.name, image: "https://www.dyli.io/images/dabble-boxes/12997-slab-starter-new.webp", price: source.box.price_usd };
const boxDetail = {
  ...source.box,
  odds_buckets: source.ranges.map(range => ({ tier: range.range_name, percent: range.rate })),
  top_chase_cards: source.ranges.flatMap(range => range.items || []).sort((a, b) => b.box_price - a.box_price).slice(0, 6),
};
if (params.has("details")) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (url, options) => String(url) === "/api/boxes/12997"
    ? Promise.resolve(Response.json({ box: boxDetail })) : originalFetch(url, options);
}
const fixtureRewards = Array.from({ length: quantity }, (_, index) => {
  const choice = choices[index % choices.length];
  return { index, ...choice, buyback_amount: choice.product.buyback_price };
});
window.fixtureAudit = [];
function Preview() {
  const [open, setOpen] = useState(params.has("details"));
  const [checkout, setCheckout] = useState(!params.has("details"));
  const [rewards, setRewards] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const settings = useOpeningPreferences("isolated-preview-wallet");
  const [preferences, setPreferences] = useState(normalizeOpeningPreferences);
  const play = { id: "isolated-presentation-fixture", quantity, rewards };
  if (params.has("balance")) return <BalancePreview />;
  if (params.has("details")) return open ? <LiveProductDetail item={{ ...item, key: item.id, surface: "boxes", type: "box", availability: source.box.inventory_count, raw: boxDetail, purchase: { supported: true } }} onClose={() => setOpen(false)} onCheckout={() => setOpen(false)} /> : <p>Checkout selected. No payment was submitted.</p>;
  if (params.has("activity")) return <main style={{ maxWidth: 1000, margin: "auto", padding: 24 }}><h1>Activity</h1><LiveActivity orders={[{ id: "fixture-order", created_at: "2026-09-09T18:00:00Z", status: "completed", items: [{ name: item.name, image_url: item.image, type: "box", quantity }], price_breakdown: { total: item.price * quantity } }]} plays={[{ ...play, order_id: "fixture-order", status: "completed", rewards: fixtureRewards, decisions: fixtureRewards.map((_, index) => index % 2 ? "claim" : "sell_back") }]} busy="" onOpen={() => {}} /></main>;
  if (params.has("progress")) return <CommerceProgress message="Processing payment…" />;
  return <main>
    <p>Isolated reveal preview — no payments or real box openings.</p>
    <button onClick={() => setOpen(true)}>Reopen preview</button>
    <button onClick={() => setCheckout(true)}>Opening settings</button>
    {checkout && <LiveModal title="Checkout" onClose={() => setCheckout(false)}><div className="lc-checkout">
      <div className="lc-checkout-product"><Art src={item.image} name={item.name} /><div><h2>{item.name}</h2><span>{quantity} {quantity === 1 ? "box" : "boxes"}</span></div></div>
      <RevealModeSelector value={settings.preferences} onChange={settings.update} quantity={quantity} />
      <button className="lc-primary" onClick={() => { setPreferences(normalizeOpeningPreferences(settings.preferences)); setCheckout(false); setOpen(true); }}>Open preview</button>
    </div></LiveModal>}
    {open && <LiveReveal play={play} item={item} decisions={decisions} busy={busy} error={error} preferences={preferences}
      onClose={() => setOpen(false)}
      onOpen={() => {
        window.fixtureAudit.push({ action: "open" });
        setBusy("Preparing reveal…");
        setTimeout(() => {
          setBusy("");
          setRewards(fixtureRewards);
        }, 400);
      }}
      onChoose={(index, choice) => {
        window.fixtureAudit.push({ action: "choose", index, choice });
        setDecisions(current => { const next = [...current]; next[index] = choice; return next; });
      }}
      onSettle={() => {
        window.fixtureAudit.push({ action: "confirm", decisions });
        setBusy("Confirming your choices…");
        setTimeout(() => {
          setBusy("");
          if (params.has("error")) setError("Your choices are saved. Please try again.");
          else setOpen(false);
        }, 1600);
      }} />}
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview />);
