"use client";
import Image from "next/image";
import { useState, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Info,
  RefreshCw,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";
import { PackArtwork } from "@/components/pack-artwork";
import { PackStats } from "@/components/pack-catalog";
import { asRows, assetImage, usd } from "@/lib/live-commerce";
import { packBrand, packIsRestocking } from "@/lib/pack-artwork";
import type { ApiRecord, CatalogItem } from "@/lib/types";

export function PackDetailContent({
  item,
  detail,
  error,
  loading,
  onRetry,
  onClose,
  onCheckout,
}: {
  item: CatalogItem;
  detail: ApiRecord;
  error: string;
  loading: boolean;
  onRetry: () => void;
  onClose: () => void;
  onCheckout: () => void;
}) {
  const [tab, setTab] = useState<"hits" | "odds">("hits");
  const box = { ...item.raw, ...detail };
  const chases = asRows(box.top_chase_cards ?? box.chase_cards).slice(0, 8);
  const odds = asRows(box.odds_buckets);
  const restocking = packIsRestocking(item, detail);
  const available = Number(box.inventory_count ?? item.availability ?? 0);
  function switchTab(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "hits"
        : event.key === "End"
          ? "odds"
          : tab === "hits"
            ? "odds"
            : "hits";
    setTab(next);
    event.currentTarget
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next === "hits" ? 0 : 1]?.focus();
  }
  return (
    <div className="dyli-pack-detail-shell">
      <header className="dyli-pack-detail-header">
        <button type="button" className="dyli-back" onClick={onClose}>
          <ArrowLeft size={18} />
          <span>All packs</span>
        </button>
        <span>Make your next great find.</span>
        <button
          type="button"
          className="lc-icon"
          aria-label="Close pack details"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="dyli-pack-detail-scroll">
        <div className="dyli-pack-detail-top">
          <div className="dyli-pack-detail-art">
            <span className="dyli-detail-status">
              <i />
              {restocking ? "Restocking" : "Ready when you are"}
            </span>
            <PackArtwork key={item.id} item={item} detail={box} priority />
            <span className="dyli-pack-drag-hint">
              Your next favorite is in here.
            </span>
          </div>
          <div className="dyli-pack-detail-copy">
            <span className="dyli-eyebrow">
              {packBrand(item.brand)} · {String(box.type || "Collectible pack")}
            </span>
            <h1>{item.name}</h1>
            <p className="dyli-detail-description">
              {item.description &&
              !/digital box, physical item|guranteed/i.test(item.description)
                ? item.description
                : "A surprise collectible, picked from this pack’s current inventory. Keep it in your vault, accept an available buyback, or request shipping."}
            </p>
            <PackStats item={item} detail={box} />
            <div className="dyli-how-it-works">
              <span>
                <span>1</span>
                <div>
                  <strong>Open your pack</strong>
                  <small>See your collectible come to life.</small>
                </div>
              </span>
              <span>
                <span>2</span>
                <div>
                  <strong>Make it yours</strong>
                  <small>Vault it or accept an available buyback.</small>
                </div>
              </span>
              <span>
                <span>3</span>
                <div>
                  <strong>Keep collecting</strong>
                  <small>Ship eligible items whenever you’re ready.</small>
                </div>
              </span>
            </div>
            <div className="dyli-detail-trust">
              <span>
                <ShieldCheck size={16} />
                Authenticated
              </span>
              <span>
                <Archive size={16} />
                Securely vaulted
              </span>
              <span>
                <Truck size={16} />
                Ship eligible items
              </span>
            </div>
          </div>
        </div>
        <section className="dyli-pack-inside">
          <div className="dyli-pack-inside-heading">
            <h2>What’s inside?</h2>
            <div
              className="dyli-tabs"
              role="tablist"
              aria-label="Pack contents"
              onKeyDown={switchTab}
            >
              <button
                type="button"
                role="tab"
                id={`pack-hits-${item.id}`}
                tabIndex={tab === "hits" ? 0 : -1}
                aria-selected={tab === "hits"}
                aria-controls={`pack-panel-${item.id}`}
                onClick={() => setTab("hits")}
              >
                Top hits
              </button>
              <button
                type="button"
                role="tab"
                id={`pack-odds-${item.id}`}
                tabIndex={tab === "odds" ? 0 : -1}
                aria-selected={tab === "odds"}
                aria-controls={`pack-panel-${item.id}`}
                onClick={() => setTab("odds")}
              >
                Pull odds
              </button>
            </div>
          </div>
          {error && (
            <div className="dyli-inline-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={onRetry}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          )}
          <div
            role="tabpanel"
            id={`pack-panel-${item.id}`}
            aria-labelledby={`pack-${tab}-${item.id}`}
          >
            {tab === "hits" ? (
              chases.length ? (
                <div className="dyli-top-hits">
                  {chases.map((card, i) => {
                    const image = assetImage(card);
                    return (
                      <article
                        key={String(card.product_id || card.token_id || i)}
                      >
                        <div className="dyli-hit-art">
                          {image ? (
                            <Image
                              src={image}
                              alt={String(card.name || "Possible pull")}
                              fill
                              sizes="(max-width: 600px) 48vw, 210px"
                              unoptimized
                            />
                          ) : (
                            <Archive size={32} />
                          )}
                        </div>
                        <strong>
                          {usd(card.fmv_usd ?? card.box_price).replace(
                            /\.00$/,
                            "",
                          )}
                        </strong>
                        <p>{String(card.name || "Collectible")}</p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="dyli-pack-empty" aria-busy={loading}>
                  <Archive size={28} />
                  <p>
                    {loading
                      ? "Loading the latest hits…"
                      : "Pack inventory is being refreshed."}
                  </p>
                </div>
              )
            ) : odds.length ? (
              <div className="dyli-odds-table">
                <div className="dyli-odds-head">
                  <span>Pull range</span>
                  <span>Item value</span>
                  <span>Chance</span>
                </div>
                {odds.map((row, i) => (
                  <div className="dyli-odds-row" key={i}>
                    <strong>
                      <i data-tier={String(row.tier || "").toLowerCase()} />
                      {String(row.tier || "Pull")}
                    </strong>
                    <span>
                      {usd(row.min).replace(/\.00$/, "")} –{" "}
                      {row.max == null
                        ? "and up"
                        : usd(row.max).replace(/\.00$/, "")}
                    </span>
                    <b>
                      {new Intl.NumberFormat("en-US", {
                        maximumFractionDigits: 4,
                      }).format(Number(row.percent || 0))}
                      %
                    </b>
                  </div>
                ))}
                <p className="dyli-odds-note">
                  <Info size={14} />
                  Values and inventory can change. Checkout confirms current
                  availability.
                </p>
              </div>
            ) : (
              <p className="dyli-pack-empty">
                {loading
                  ? "Loading the latest odds…"
                  : "Odds are being refreshed."}
              </p>
            )}
          </div>
        </section>
      </div>
      <footer className="dyli-pack-detail-footer">
        <div>
          <small>{restocking ? "Restocking" : "Per pack"}</small>
          <strong>{usd(item.price).replace(/\.00$/, "")}</strong>
        </div>
        <span>
          {restocking
            ? "More collectibles are on the way."
            : `${new Intl.NumberFormat("en-US").format(available)} collectibles available`}
        </span>
        <button
          type="button"
          className="lc-primary"
          disabled={restocking || !item.purchase.supported}
          onClick={onCheckout}
        >
          {restocking ? "Restocking" : "Open pack"}
          {!restocking && <ArrowRight size={19} />}
        </button>
      </footer>
    </div>
  );
}
