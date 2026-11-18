"use client";
import Link from "next/link";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Archive,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
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

export function PackHero({
  items,
  onSelect,
  onExplore,
  demo = false,
}: {
  items: CatalogItem[];
  onSelect: (item: CatalogItem) => void;
  onExplore: () => void;
  demo?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const featured = items.slice(0, 5),
    item = featured[index % Math.max(1, featured.length)];
  return (
    <section className="dyli-pack-hero" aria-label="Discover packs">
      <div className="dyli-hero-copy">
        <h1>Open a pack.</h1>
        <p>
          Collect cards, sealed packs and more.
          <br className="dyli-desktop-break" /> Vault it, sell it back, or get
          it shipped.
        </p>
        <div className="dyli-hero-actions">
          <button
            type="button"
            className="lc-primary"
            onClick={() => (item ? onSelect(item) : onExplore())}
          >
            Explore packs
            <ArrowRight size={19} />
          </button>
          {demo ? (
            <span className="dyli-demo-note">No real purchases.</span>
          ) : (
            <Link
              prefetch={false}
              href="/?demo=1"
              className="lc-secondary dyli-demo-link"
            >
              Try demo
            </Link>
          )}
        </div>
        <div className="dyli-hero-benefits">
          <span>
            <ShieldCheck size={16} />
            Authenticated collectibles
          </span>
          <span>
            <Archive size={16} />
            Stored in your vault
          </span>
          <span>
            <Truck size={16} />
            Ship when you’re ready
          </span>
        </div>
      </div>
      <div className="dyli-hero-showcase">
        <div className="dyli-hero-orbit" aria-hidden="true" />
        <span
          className="dyli-hero-spark dyli-hero-spark-one"
          aria-hidden="true"
        >
          ✦
        </span>
        <span
          className="dyli-hero-spark dyli-hero-spark-two"
          aria-hidden="true"
        >
          ✦
        </span>
        {item ? (
          <>
            <PackArtwork
              key={item.id}
              item={item}
              priority
              className="dyli-hero-pack"
            />
            <button
              type="button"
              className="dyli-hero-pack-label"
              onClick={() => onSelect(item)}
            >
              <span>
                <small>{packBrand(item.brand)}</small>
                <strong>{item.name}</strong>
              </span>
              <b>{usd(item.price).replace(/\.00$/, "")}</b>
              <ArrowUpRight size={20} />
            </button>
            {featured.length > 1 && (
              <div className="dyli-hero-picker">
                <button
                  type="button"
                  aria-label="Previous featured pack"
                  onClick={() =>
                    setIndex(
                      (value) =>
                        (value + featured.length - 1) % featured.length,
                    )
                  }
                >
                  <ChevronLeft size={17} />
                </button>
                <div>
                  {featured.map((pack, i) => (
                    <button
                      type="button"
                      key={pack.id}
                      className={
                        i === index % featured.length ? "is-selected" : ""
                      }
                      aria-label={`Show ${pack.name}`}
                      aria-pressed={i === index % featured.length}
                      onClick={() => setIndex(i)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Next featured pack"
                  onClick={() =>
                    setIndex((value) => (value + 1) % featured.length)
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="dyli-hero-placeholder">
            <Sparkles size={70} />
            <strong>No packs available.</strong>
            <span>New packs will appear here.</span>
          </div>
        )}
      </div>
    </section>
  );
}

export function PackBrowser({
  items,
  onSelect,
  loading = false,
  error = "",
  onRetry,
}: {
  items: CatalogItem[];
  onSelect: (item: CatalogItem) => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
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
    <section className="dyli-pack-browser" aria-labelledby="pack-browser-title">
      <div className="dyli-page-title">
        <div>
          <h1 id="pack-browser-title">Packs</h1>
          <p>Choose a pack to view its contents and odds.</p>
        </div>
        <span className="dyli-count">
          {items.length} {items.length === 1 ? "pack" : "packs"}
        </span>
      </div>
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
        <PackGallery items={filtered} onSelect={onSelect} />
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
        <div className="dyli-pack-grid">
          {filtered.map((item, i) => (
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
function PackGallery({
  items,
  onSelect,
}: {
  items: CatalogItem[];
  onSelect: (item: CatalogItem) => void;
}) {
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
      <div className="dyli-gallery-info" aria-live="polite">
        <span className="dyli-pack-brand">{packBrand(item.brand)}</span>
        <h2>{item.name}</h2>
        <PackStats item={item} compact />
        <button
          type="button"
          className="lc-primary"
          onClick={() => onSelect(item)}
        >
          {restocking
            ? "View pack · Restocking"
            : `Rip · ${usd(item.price).replace(/\.00$/, "")}`}
          <ArrowRight size={18} />
        </button>
        <span className="dyli-gallery-position">
          {index + 1} / {items.length}
        </span>
      </div>
    </section>
  );
}
