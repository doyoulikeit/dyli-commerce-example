import type { ApiRecord, BoxPlay } from "./types.ts";

const asRecord = (value: unknown): ApiRecord => value && typeof value === "object" && !Array.isArray(value) ? value as ApiRecord : {};
const asRows = (value: unknown) => Array.isArray(value) ? value.map(asRecord) : [];

export function orderActivity(order: ApiRecord, plays: BoxPlay[]) {
  const items = asRows(order.items);
  const quantity = items.reduce((total, item) => {
    const amount = Number(item.quantity);
    return total + (Number.isSafeInteger(amount) && amount > 0 ? amount : 0);
  }, 0);
  // Join by order, never by product: two purchases of one box have different pulls.
  const pulls = plays.filter(play => play.order_id === order.id).flatMap(play =>
    play.rewards.map((reward, index) => {
      const choice = reward.disposition || play.decisions[index];
      const completed = play.status === "completed";
      return { ...reward, key: `${play.id}:${reward.index}`, completed,
        label: choice === "sell_back" ? completed ? "Sold" : "Sell selected"
          : choice === "claim" ? completed ? "Vaulted" : "Vault selected" : "Pulled",
        sold: completed && choice === "sell_back",
        vaulted: completed && choice === "claim",
      };
    }),
  );
  const sold = pulls.filter(pull => pull.sold).length;
  const vaulted = pulls.filter(pull => pull.vaulted).length;
  const pricing = asRecord(order.price_breakdown);
  return { items, quantity, pulls, sold, vaulted,
    total: pricing.total ?? (pricing.total_cents == null ? null : Number(pricing.total_cents) / 100),
    cash: pulls.reduce((cents, pull) => cents + (pull.sold ? Math.round(pull.buyback_amount * 100) : 0), 0) / 100,
  };
}
