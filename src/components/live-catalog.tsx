"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useWalletPrompt } from "@/components/providers";
import { acquireModalScroll } from "@/lib/modal-scroll";
import { X } from "lucide-react";
import { PackCard } from "@/components/pack-catalog";
import { PackDetailContent } from "@/components/pack-detail";
import { currentPackItem } from "@/lib/pack-artwork";
import {
  asRecord,
  boxItem,
  usd,
} from "@/lib/live-commerce";
import type { ApiRecord, CatalogItem } from "@/lib/types";

export function Art({
  src,
  name,
  priority = false,
}: {
  src: string | null;
  name: string;
  priority?: boolean;
}) {
  const sealed =
    /booster|sleeved|trainer box|booster bundle/i.test(name) &&
    !/\b(PSA|CGC|BGS|SGC)\s*\d/i.test(name);
  return (
    <div className={`lc-art${sealed ? " lc-art-sealed" : ""}`}>
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes="(max-width: 600px) 45vw, 320px"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          unoptimized
        />
      ) : (
        <span>Image unavailable</span>
      )}
    </div>
  );
}

export function LiveModal({
  title,
  children,
  onClose,
  wide = false,
  className = "",
  dismissible = true,
  header,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
  dismissible?: boolean;
  header?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const walletPrompt = useWalletPrompt();
  useLayoutEffect(() => {
    const element = dialog.current;
    if (walletPrompt) {
      element?.close();
      return;
    }
    const releaseScroll = acquireModalScroll(document);
    element?.showModal();
    return () => {
      element?.close();
      releaseScroll();
    };
  }, [walletPrompt]);
  return (
    <dialog
      ref={dialog}
      className={`lc-modal ${wide ? "lc-modal-wide" : ""} ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
    >
      {header === undefined ? <header>
        <h2>{title}</h2>
        {dismissible && <button className="lc-icon" aria-label="Close" onClick={onClose}>
          <X />
        </button>}
      </header> : header}
      {children}
    </dialog>
  );
}

export function LiveProductCard({
  item,
  onClick,
  priority = false,
}: {
  item: CatalogItem;
  onClick: () => void;
  priority?: boolean;
}) {
  if (boxItem(item)) return <PackCard item={item} onSelect={onClick} priority={priority} />;
  return (
    <button
      className={`lc-product ${boxItem(item) ? "lc-box" : ""}`}
      onClick={onClick}
    >
      <Art src={item.image} name={item.name} priority={priority} />
      <span className="lc-product-info">
        <strong>{item.name}</strong>
        <span>{usd(item.price)}</span>
      </span>
      {boxItem(item) && (
        <span className="lc-box-cta">
          Open pack <span>↗</span>
        </span>
      )}
    </button>
  );
}

export function LiveProductDetail({ item, onClose, onCheckout }: { item: CatalogItem; onClose: () => void; onCheckout: (item: CatalogItem) => void }) {
  const [detail, setDetail] = useState<ApiRecord>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const isPack = boxItem(item);
  useEffect(() => {
    if (!isPack) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort();setLoading(false);setError("The latest pack details took too long to load. Please try again."); }, 15000);
    void fetch(`/api/packs/${encodeURIComponent(item.id)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("The latest pack details couldn’t load.");
        const payload = asRecord(await response.json());
        if (!controller.signal.aborted) setDetail(asRecord(payload.pack ?? payload.box));
      })
      .catch(() => { if (!controller.signal.aborted) setError("The latest pack details couldn’t load. Your account hasn’t changed."); })
      .finally(() => { clearTimeout(timeout);if (!controller.signal.aborted) setLoading(false); });
    return () => { clearTimeout(timeout);controller.abort(); };
  }, [item.id, isPack, revision]);
  const current = isPack ? currentPackItem(item, detail) : item;
  if (isPack) return <LiveModal title={`${item.name} pack details`} onClose={onClose} wide header={null} className="dyli-pack-detail-modal">
    <PackDetailContent item={current} detail={detail} loading={loading} error={error} onRetry={() => { setLoading(true);setError("");setRevision(value => value + 1); }} onClose={onClose} onCheckout={() => onCheckout(current)} />
  </LiveModal>;
  return <LiveModal title="Collectible" onClose={onClose} wide>
    <div className="lc-detail"><Art src={item.image} name={item.name} priority /><div className="lc-detail-copy"><h1>{item.name}</h1><p className="lc-price">{usd(item.price)}</p><div className="lc-facts">{[item.brand,item.subcategory].filter(Boolean).map(value => <p key={value}>{value}</p>)}</div></div></div>
    <footer><small>{item.availability ?? 0} available</small><button className="lc-primary" disabled={!item.purchase.supported} onClick={() => onCheckout(item)}>Buy</button></footer>
  </LiveModal>;
}
