"use client";

import { ChevronDown } from "lucide-react";
import { Art } from "./live-catalog";
import { LiveShipmentTracking } from "./live-shipment-tracking";
import { orderActivity, saleActivity, shipmentActivity } from "@/lib/activity";
import { asRecord, asRows, assetImage, catalogFromOrderLine, usd } from "@/lib/live-commerce";
import type { ApiRecord, BoxPlay, CatalogItem, OfferAcceptance } from "@/lib/types";

function ActivityDate({ value }: { value: unknown }) {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : <time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>;
}

export function LiveSaleActivity({ sales, busy, onContinue }: {
  sales: OfferAcceptance[]; busy: string; onContinue: (item: ApiRecord) => void;
}) {
  return <section aria-label="Vault sales" className="lc-order-history"><h2>Vault sales</h2>
    {sales.map(sale => {
      const item = sale.item || { token_id: sale.token_id }, activity = saleActivity(sale);
      return <article className="lc-order-entry" key={sale.id}><div className="lc-order-heading">
        <Art src={assetImage(item)} name={String(item.name || "Collectible")} />
        <div className="lc-order-copy"><h2>{String(item.name || "Collectible")}</h2>
          <p><span>{activity.label}</span><ActivityDate value={sale.completed_at || sale.created_at} /></p>
        </div>
        <div className="lc-order-amount"><strong>{usd(sale.offer.price)}</strong><small>{sale.status === "completed" ? "Sale price" : "Offer"}</small></div>
        {activity.action && <button className="lc-secondary" disabled={!!busy} onClick={() => onContinue({ ...item, token_id: sale.token_id, acceptance_id: sale.id })}>{activity.action}</button>}
      </div></article>;
    })}
  </section>;
}

export function LiveShipmentActivity({ shipments, onView }: { shipments: ApiRecord[]; onView: () => void }) {
  return <section aria-label="Shipments" className="lc-order-history"><h2>Shipments</h2>
    {shipments.map(shipment => {
      const items = asRows(shipment.items), item = items[0] || {};
      const count = items.reduce((sum, value) => sum + Number(value.quantity || 1), 0);
      return <article className="lc-order-entry lc-shipment-entry" key={String(shipment.id)}><div className="lc-order-heading">
        <Art src={assetImage(item)} name={String(item.name || "Collectible")} />
        <div className="lc-order-copy"><h2>{String(item.name || "Shipment")}{items.length > 1 && ` + ${items.length - 1} more`}</h2>
          <p><strong>{count} {count === 1 ? "item" : "items"}</strong><span>{shipmentActivity(shipment)}</span><ActivityDate value={shipment.created_at} /></p>
        </div>
        {asRecord(shipment.pricing).amount != null && <div className="lc-order-amount"><strong>{usd(asRecord(shipment.pricing).amount)}</strong><small>Shipping</small></div>}
        <button className="lc-secondary" onClick={onView}>View shipment</button>
      </div><LiveShipmentTracking shipment={shipment} /></article>;
    })}
  </section>;
}

export function LiveActivity({ orders, plays, busy, onOpen }: {
  orders: ApiRecord[]; plays: BoxPlay[]; busy: string;
  onOpen: (item: CatalogItem, orderId: string) => void;
}) {
  return <div className="lc-order-history">{orders.map(order => {
    const activity = orderActivity(order, plays);
    const line = activity.items[0];
    const date = new Date(String(order.created_at));
    return <article className="lc-order-entry" key={String(order.id)}>
      <div className="lc-order-heading">
        {line && <Art src={assetImage(line)} name={String(line.name || "Purchase")} />}
        <div className="lc-order-copy">
          <h2>{String(line?.name || "Purchase")}{activity.items.length > 1 && ` + ${activity.items.length - 1} more`}</h2>
          <p>{activity.quantity > 0 && <strong>{activity.quantity} {line?.type === "box" ? activity.quantity === 1 ? "box" : "boxes" : activity.quantity === 1 ? "item" : "items"}</strong>}
            <span>{String(order.status || "").replaceAll("_", " ")}</span>
            {!Number.isNaN(date.getTime()) && <time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>}
          </p>
        </div>
        <div className="lc-order-amount">{activity.total != null && <strong>{usd(activity.total)}</strong>}{activity.sold > 0 && <small>+{usd(activity.cash)} sold</small>}</div>
        {line?.type === "box" && ["paid", "processing"].includes(String(order.status)) && <button className="lc-secondary" disabled={!!busy} onClick={() => onOpen(catalogFromOrderLine(line), String(order.id))}>Open</button>}
      </div>
      {activity.pulls.length > 0 && <details className="lc-order-pulls">
        <summary><span className="lc-order-thumbnails" aria-hidden="true">{activity.pulls.slice(0, 3).map(pull => <Art key={pull.key} src={assetImage(pull.product)} name="" />)}</span><span><strong>{activity.pulls.length} {activity.pulls.length === 1 ? "pull" : "pulls"}</strong><small>{[activity.sold && `${activity.sold} sold`, activity.vaulted && `${activity.vaulted} vaulted`].filter(Boolean).join(" · ") || "View your pulls"}</small></span><ChevronDown size={16} /></summary>
        <div>{activity.pulls.map(pull => <div className="lc-order-pull" key={pull.key}><Art src={assetImage(pull.product)} name={String(pull.product.name || "Collectible")} /><span><strong>{String(pull.product.name || "Collectible")}</strong>{pull.rarity && <small>{pull.rarity}</small>}</span><span className={pull.sold ? "lc-order-sold" : ""}><strong>{pull.label}</strong>{pull.sold && <small>+{usd(pull.buyback_amount)}</small>}</span></div>)}</div>
      </details>}
    </article>;
  })}</div>;
}
