"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Archive,
  Info,
  Flame,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { PackArtwork } from "@/components/pack-artwork";
import { asRecord, usd } from "@/lib/live-commerce";
import { packBrand, packIsRestocking, packPoster } from "@/lib/pack-artwork";
import type { ApiRecord, CatalogItem } from "@/lib/types";

function amount(value: unknown) {
  return value == null || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
}

export function PackStats({
  item,
  detail,
  compact = false,
}: {
  item: CatalogItem;
  detail?: ApiRecord;
  compact?: boolean;
}) {
  const data = { ...item.raw, ...detail };
  const ev = amount(data.expected_value_usd ?? data.ev_usd);
  const buyback = amount(data.buyback_rate);
  const price = Number(item.price || 0);
  return (
    <dl
      className={`dyli-pack-stats${compact ? " dyli-pack-stats-compact" : ""}`}
    >
      {ev != null && price > 0 && (
        <div
          title={`Average collectible value based on this pack’s current odds: ${usd(ev)}`}
        >
          <dt>EV</dt>
          <dd>
            {Math.round((ev / price) * 100)}
            <span>%</span>
          </dd>
        </div>
      )}
      {buyback != null && buyback > 0 && (
        <div title="Cash buyback as a percentage of a collectible’s value. Each pull shows its own available offer.">
          <dt>Buyback</dt>
          <dd>
            {Math.round(buyback * 100)}
            <span>%</span>
          </dd>
        </div>
      )}
      {!compact && (
        <div>
          <dt>Pack price</dt>
          <dd>{usd(item.price).replace(/\.00$/, "")}</dd>
        </div>
      )}
    </dl>
  );
}

export function PackCard({
  item,
  onSelect,
  priority = false,
}: {
  item: CatalogItem;
  onSelect: () => void;
  priority?: boolean;
}) {
  const data = asRecord(item.raw),
    poster = packPoster(item),
    restocking = packIsRestocking(item);
  const topHit = Array.isArray(data.top_chase_cards)
    ? asRecord(data.top_chase_cards[0])
    : {};
  const topValue = amount(topHit.fmv_usd ?? topHit.box_price);
  return (
    <button
      type="button"
      className="dyli-pack-card lc-box"
      onClick={onSelect}
      aria-label={`View ${item.name}, ${usd(item.price)}${restocking ? ", restocking" : ""}`}
    >
      <span className="dyli-pack-card-stage">
        <span
          className={`dyli-pack-card-state${restocking ? " is-restocking" : ""}`}
        >
          <i />
          {restocking ? "Restocking" : "Available"}
        </span>
        {poster ? (
          <Image
            src={poster}
            alt={item.name}
            fill
            sizes="(max-width: 600px) 70vw, (max-width: 1000px) 42vw, 340px"
            priority={priority}
            unoptimized
            draggable={false}
          />
        ) : (
          <Archive size={56} />
        )}
        <span className="dyli-pack-card-price">
          {usd(item.price).replace(/\.00$/, "")}
        </span>
      </span>
      <span className="dyli-pack-card-info">
        <span className="dyli-pack-brand">{packBrand(item.brand)}</span>
        <strong>{item.name}</strong>
        <span className="dyli-pack-card-meta">
          {topValue != null && topValue > 0 ? (
            <span>
              Top hit <b>{usd(topValue).replace(/\.00$/, "")}</b>
            </span>
          ) : (
            <span>View contents</span>
          )}
          <span className="dyli-card-arrow">
            <ArrowUpRight size={20} />
          </span>
        </span>
      </span>
    </button>
  );
}

export function PackBrowser({
  items,
  onSelect,
  loading = false,
  error = "",
  onRetry,
  home = false,
  onRip,
}: {
  items: CatalogItem[];
  onSelect: (item: CatalogItem) => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  home?: boolean;
  onRip?: (
    item: CatalogItem,
    quantity: number,
    mode: "normal" | "turbo",
  ) => void;
}) {
  const [brand, setBrand] = useState("All packs"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("featured");
  const brands = useMemo(
    () => ["All packs", ...new Set(items.map((item) => packBrand(item.brand)))],
    [items],
  );
  const filtered = useMemo(() => {
    const normalize = (value: string) =>
      value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const rows = items.filter(
      (item) =>
        (brand === "All packs" || packBrand(item.brand) === brand) &&
        normalize(`${item.name} ${packBrand(item.brand)}`).includes(
          normalize(query.trim()),
        ),
    );
    return sort === "featured"
      ? rows
      : rows.sort((a, b) =>
          sort === "price-high"
            ? Number(b.price || 0) - Number(a.price || 0)
            : Number(a.price || 0) - Number(b.price || 0),
        );
  }, [items, brand, query, sort]);
  return (
    <section
      className={`dyli-pack-browser${home ? " dyli-pack-home" : ""}`}
      aria-label={home ? "Open packs" : undefined}
      aria-labelledby={home ? undefined : "pack-browser-title"}
    >
      {!home && (
        <div className="dyli-page-title">
          <div>
            <h1 id="pack-browser-title">Packs</h1>
            <p>Choose a pack to view its contents and odds.</p>
          </div>
          <span className="dyli-count">
            {items.length} {items.length === 1 ? "pack" : "packs"}
          </span>
        </div>
      )}
      {!home && (
        <div className="dyli-pack-tools">
          <label className="dyli-search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Find a pack"
              aria-label="Search packs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="dyli-pack-sort">
            <span>Sort by</span>
            <select
              value={sort}
              aria-label="Sort packs"
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
            </select>
          </label>
        </div>
      )}
      <div className="dyli-brand-pills" aria-label="Filter packs by brand">
        {brands.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={brand === value}
            onClick={() => setBrand(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {!loading && !error && filtered.length > 0 && (
        <PackGallery items={filtered} onSelect={onSelect} onRip={onRip} />
      )}
      {error && (
        <div className="dyli-inline-error" role="alert">
          <strong>Packs couldn’t load</strong>
          <span>{error}</span>
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Try again
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      {loading ? (
        <div
          className="dyli-pack-grid"
          aria-label="Loading packs"
          aria-busy="true"
        >
          {[0, 1, 2].map((i) => (
            <div className="dyli-pack-skeleton" key={i} />
          ))}
        </div>
      ) : filtered.length ? (
        <div className={`dyli-pack-grid${home ? " dyli-pack-grid-home" : ""}`}>
          {(home ? filtered.slice(0, 4) : filtered).map((item, i) => (
            <PackCard
              key={item.key}
              item={item}
              priority={i < 3}
              onSelect={() => onSelect(item)}
            />
          ))}
        </div>
      ) : (
        !error && (
          <div className="dyli-pack-empty">
            <Search size={30} />
            <h2>
              {query || brand !== "All packs"
                ? "No packs found"
                : "No packs available."}
            </h2>
            <p>
              {query || brand !== "All packs"
                ? "Try a different name or brand."
                : "Check back for the next drop of packs."}
            </p>
            {(query || brand !== "All packs") && (
              <button
                type="button"
                className="lc-secondary"
                onClick={() => {
                  setQuery("");
                  setBrand("All packs");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )
      )}
    </section>
  );
}

// API-driven version of the /packs coverflow. Only the focused pack mounts a
// renderer; neighboring packs use the native cached posters.
export function PackGallery({
  items,
  onSelect,
  onRip,
}: {
  items: CatalogItem[];
  onSelect: (item: CatalogItem) => void;
  onRip?: (
    item: CatalogItem,
    quantity: number,
    mode: "normal" | "turbo",
  ) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState<"normal" | "turbo">("normal");
  const [selectedKey, setSelectedKey] = useState(items[0]?.key);
  const index = Math.max(
    0,
    items.findIndex((item) => item.key === selectedKey),
  );
  const item = items[index];
  const touch = useRef<number | null>(null);
  const go = (delta: number) =>
    setSelectedKey(items[(index + delta + items.length) % items.length].key);
  const restocking = packIsRestocking(item);
  const limit = Math.max(1, Math.min(10, Number(item.availability) || 10));
  const selectedQuantity = Math.min(limit, quantity);
  const neighbor = (offset: number) =>
    items.length > Math.abs(offset)
      ? items[(index + offset + items.length) % items.length]
      : null;
  return (
    <section
      className="dyli-pack-gallery"
      aria-label="Choose a pack"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          go(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
      tabIndex={0}
    >
      <div
        className="dyli-gallery-stage"
        onTouchStart={(event) => {
          touch.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (
            start != null &&
            Math.abs((event.changedTouches[0]?.clientX ?? start) - start) > 45
          )
            go(event.changedTouches[0].clientX < start ? 1 : -1);
        }}
      >
        {[-2, -1, 1, 2].map((offset) => {
          const pack = neighbor(offset);
          return pack ? (
            <button
              type="button"
              className="dyli-gallery-neighbor"
              data-offset={offset}
              key={offset}
              aria-label={`Select ${pack.name}`}
              onClick={() => setSelectedKey(pack.key)}
            >
              <Image
                src={packPoster(pack) || "/brand/dyli-mark.svg"}
                alt=""
                fill
                sizes="240px"
                unoptimized
                draggable={false}
              />
            </button>
          ) : null;
        })}
        <PackArtwork
          key={item.key}
          item={item}
          className="dyli-gallery-focus"
          priority
          controls={false}
        />
        {items.length > 1 && (
          <>
            <button
              className="dyli-gallery-arrow dyli-gallery-prev"
              type="button"
              aria-label="Previous pack"
              onClick={() => go(-1)}
            >
              <ChevronLeft size={24} />
            </button>
            <button
              className="dyli-gallery-arrow dyli-gallery-next"
              type="button"
              aria-label="Next pack"
              onClick={() => go(1)}
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>
      <div className="dyli-gallery-info">
        <span className="dyli-pack-brand">{packBrand(item.brand)}</span>
        <h2>{item.name}</h2>
        <PackStats item={item} compact />
        <div className="dyli-gallery-controls">
          <label className="dyli-gallery-quantity">
            <select
              aria-label="Packs to open"
              value={selectedQuantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            >
              {Array.from({ length: limit }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  ×{index + 1}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <button
            type="button"
            className="dyli-gallery-details"
            aria-label="View pack contents and odds"
            onClick={() => onSelect(item)}
          >
            <Info size={19} />
          </button>
          <button
            type="button"
            className="lc-primary"
            onClick={() =>
              restocking || !onRip
                ? onSelect(item)
                : onRip(item, selectedQuantity, mode)
            }
          >
            {restocking
              ? "Restocking"
              : `${mode === "turbo" ? "Blitz" : "Rip"} · ${usd(Number(item.price || 0) * selectedQuantity).replace(/\.00$/, "")}`}
            <ArrowRight size={18} />
          </button>
          <button
            type="button"
            className="dyli-gallery-blitz"
            aria-label="Blitz mode"
            aria-pressed={mode === "turbo"}
            title="Blitz mode"
            onClick={() =>
              setMode((value) => (value === "turbo" ? "normal" : "turbo"))
            }
          >
            <Flame size={20} />
          </button>
        </div>
        <span
          className="dyli-gallery-position"
          role="status"
          aria-label={`${item.name}, pack ${index + 1} of ${items.length}`}
        >
          {index + 1} / {items.length}
        </span>
      </div>
    </section>
  );
}
