"use client";

import { ChevronDown } from "lucide-react";
import { Art } from "./live-catalog";
import { orderActivity } from "@/lib/activity";
import { assetImage, catalogFromOrderLine, usd } from "@/lib/live-commerce";
import type { ApiRecord, BoxPlay, CatalogItem } from "@/lib/types";

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
