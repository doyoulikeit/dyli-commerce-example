"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useWalletPrompt } from "@/components/providers";
import { acquireModalScroll } from "@/lib/modal-scroll";
import { ArrowRight, X } from "lucide-react";
import {
  asRecord,
  asRows,
  assetImage,
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
          priority={priority}
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
}: {
  item: CatalogItem;
  onClick: () => void;
}) {
  return (
    <button
      className={`lc-product ${boxItem(item) ? "lc-box" : ""}`}
      onClick={onClick}
    >
      <Art src={item.image} name={item.name} />
      <span className="lc-product-info">
        <strong>{item.name}</strong>
        <span>{usd(item.price)}</span>
      </span>
      {boxItem(item) && (
        <span className="lc-box-cta">
          Open box <span>↗</span>
        </span>
      )}
    </button>
  );
}

export function LiveProductDetail({
  item,
  onClose,
  onCheckout,
}: {
  item: CatalogItem;
  onClose: () => void;
  onCheckout: () => void;
}) {
  const [detail, setDetail] = useState<ApiRecord>({});
  const [error, setError] = useState("");
  useEffect(() => {
    if (!boxItem(item)) return;
    const controller = new AbortController();
    void fetch(`/api/boxes/${item.id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Pull details are temporarily unavailable");
        setDetail(asRecord(await response.json()));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [item]);
  const box = { ...item.raw, ...asRecord(detail.box) };
  const odds = asRows(box.odds_buckets).reduce((groups, bucket) => {
    const name = String(bucket.tier || "Pull")
      .trim()
      .toLowerCase();
    groups.set(
      name,
      (groups.get(name) || 0) + Number(bucket.percent ?? bucket.rarity ?? 0),
    );
    return groups;
  }, new Map<string, number>());
  return (
    <LiveModal
      title={boxItem(item) ? "Box details" : "Collectible"}
      onClose={onClose}
      wide
      className={boxItem(item) ? "lc-box-detail-modal" : ""}
    >
      <div className={`lc-detail ${boxItem(item) ? "lc-box-detail" : ""}`}>
        <Art src={item.image} name={item.name} priority />
        <div className="lc-detail-copy">
          <div className="lc-detail-overview">
          <h1>{item.name}</h1>
          <p className="lc-price">{usd(item.price)}</p>
          {error && <p role="alert">{error}</p>}
          {boxItem(item) && <>
              {(box.expected_value_usd ?? box.ev_usd) != null && (
                <p className="lc-stat">
                  Expected value{" "}
                  <strong>{usd(box.expected_value_usd ?? box.ev_usd)}</strong>
                </p>
              )}
              <div className="lc-detail-open">
                <button className="lc-primary" disabled={!item.purchase.supported} onClick={onCheckout}>Open box<ArrowRight size={19} /></button>
                <small>{new Intl.NumberFormat("en-US").format(item.availability ?? 0)} available</small>
              </div>
          </>}
          </div>
          {boxItem(item) && (
            <>
              {asRows(box.top_chase_cards).length > 0 && (
                <section className="lc-detail-pulls">
                  <h3>Top pulls</h3>
                  <div className="lc-chases">
                    {asRows(box.top_chase_cards)
                      .slice(0, 6)
                      .map((card, index) => (
                        <div key={String(card.token_id || index)}>
                          <Art
                            src={assetImage(card)}
                            name={String(card.name || "Possible pull")}
                          />
                          <small>{String(card.name || "")}</small>
                          <strong>{usd(card.fmv_usd || card.box_price)}</strong>
                        </div>
                      ))}
                  </div>
                </section>
              )}
              {odds.size > 0 && (
                <section className="lc-detail-odds">
                  <h3>Pull odds</h3>
                  {[...odds].map(([name, percent]) => (
                    <p className="lc-stat" key={name}>
                      {name.charAt(0).toUpperCase() + name.slice(1)}
                      <strong>
                        {new Intl.NumberFormat("en-US", {
                          maximumFractionDigits: 4,
                        }).format(percent)}
                        %
                      </strong>
                    </p>
                  ))}
                </section>
              )}
            </>
          )}
          {!boxItem(item) && (
            <div className="lc-facts">
              {[item.brand, item.subcategory].filter(Boolean).map((value) => (
                <p key={value}>{value}</p>
              ))}
            </div>
          )}
        </div>
      </div>
      <footer>
        {boxItem(item) && <div className="lc-detail-footer-product">
          <Art src={item.image} name={item.name} />
          <div><strong>{item.name}</strong><span>{usd(item.price)}</span></div>
        </div>}
        <small>{item.availability ?? 0} available</small>
        <button
          className="lc-primary"
          disabled={!item.purchase.supported}
          onClick={onCheckout}
        >
          {boxItem(item) ? "Open box" : "Buy"}
        </button>
      </footer>
    </LiveModal>
  );
}
