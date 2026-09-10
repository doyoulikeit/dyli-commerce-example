// Exercises real live components/hooks with an explicitly isolated wallet/API.
// Product presentation is a read-only snapshot from the local catalog server.
import { createRoot } from "react-dom/client";
import { LiveStorefront } from "../../src/components/live-storefront";
import { Providers } from "../../src/components/providers";
import { address } from "./privy.fixture";
import "../../src/app/globals.css";

const originalFetch = window.fetch.bind(window);
const storefront = await (await originalFetch("/fixtures/catalog")).json();
storefront.readiness.capabilities.box_play = {
  contract_version: "gacha",
  ready: true,
  chain_id: 11124,
  max_quantity: 10,
};
storefront.readiness.capabilities.payments = ["usdc", "stripe_card"];
for (const item of [...storefront.boxes, ...storefront.catalog])
  item.purchase.supported = true;
window.fixtureAudit = [];
const token = `0x${"c".repeat(40)}`;
let balance = 500,
  quote,
  order,
  play,
  holdings = [],
  redemptions = [],
  shipment;
const tx = (phase) => ({
  chain: "abstract",
  chain_id: 11124,
  from: address,
  to: `0x${"d".repeat(40)}`,
  value: "0",
  data: phase === "buy" ? "0x1234" : "0x5678",
  phase,
});
const itemLine = (item, quantity) => ({
  type: item.surface === "boxes" ? "box" : "listing",
  box_id: Number(item.id),
  listing_id: item.id,
  quantity,
  name: item.name,
  image_url: item.image,
  unit_amount_cents: Math.round(item.price * 100),
});
const session = () => ({
  identity: {
    userId: "fixture-user",
    externalCustomerId: "fixture-user",
    walletAddress: address,
    name: "Alex",
    email: "alex@example.test",
  },
  customer: {},
  balance: {
    amount: String(balance),
    currency: "USDC",
    token,
    chain_id: 11124,
  },
  holdings: { items: holdings },
  orders: order ? [order] : [],
  redemptions,
  boxPlays: play ? [play] : [],
});
const payment = {
  tokens: { abstract: token },
  recipients: { abstract: `0x${"e".repeat(40)}` },
};
window.fetch = async (url, init) => {
  const target = new URL(String(url), location.origin);
  // No wallet RPC traffic leaves this harness. This fixture exercises the
  // already-approved shipping path; approval receipts are a separate lab gate.
  if (target.origin !== location.origin && init?.method === "POST") {
    const rpc = JSON.parse(init.body);
    window.fixtureAudit.push({ type: "rpc", method: rpc.method });
    if (rpc.method === "eth_call")
      return Response.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: `0x${"f".repeat(64)}`,
      });
    throw new Error(`Unexpected external RPC in fixture: ${rpc.method}`);
  }
  const path = target.pathname;
  if (!path.startsWith("/api/")) return originalFetch(url, init);
  const body = init?.body ? JSON.parse(init.body) : {};
  window.fixtureAudit.push({ type: "api", path, body });
  await new Promise((resolve) => setTimeout(resolve, 120));
  let result;
  if (path === "/api/storefront") result = storefront;
  else if (path.startsWith("/api/boxes/"))
    result = await (
      await originalFetch("/fixtures/box/" + path.split("/").pop())
    ).json();
  else if (path === "/api/session") result = session();
  else if (path === "/api/checkout") {
    if (body.action === "quote") {
      const item = [...storefront.boxes, ...storefront.catalog].find(
        (i) =>
          String(body.quoteItem.box_id || body.quoteItem.listing_id) === i.id,
      );
      const subtotal = Math.round(item.price * 100) * body.quoteItem.quantity;
      quote = {
        id: "11111111-1111-4111-8111-111111111111",
        status: "open",
        items: [itemLine(item, body.quoteItem.quantity)],
        expires_at: new Date(Date.now() + 600000).toISOString(),
        price_breakdown: {
          subtotal_cents: subtotal,
          partner_fee_cents: 0,
          total_cents: subtotal,
        },
      };
      result = { quote, payment };
    } else if (body.action === "read") result = { quote, payment };
    else if (body.action === "authorize")
      result = {
        authorization: {
          message: "Offline fixture authorization — not a real payment",
        },
      };
    else if (body.action === "confirm_balance") {
      balance -= quote.price_breakdown.total_cents / 100;
      order = {
        id: "22222222-2222-4222-8222-222222222222",
        quote_id: quote.id,
        external_customer_id: "fixture-user",
        items: quote.items,
        status: "paid",
        price_breakdown: { total: quote.price_breakdown.total_cents / 100 },
        created_at: new Date().toISOString(),
      };
      result = { order };
    } else
      return Response.json(
        {
          error:
            "Card redirects are deliberately disabled in this offline harness",
        },
        { status: 409 },
      );
  } else if (path === "/api/box-plays") {
    if (body.action === "create") {
      play ||= {
        id: "33333333-3333-4333-8333-333333333333",
        order_id: order.id,
        external_customer_id: "fixture-user",
        box_id: order.items[0].box_id,
        wallet_address: address,
        quantity: order.items[0].quantity,
        opening_reference: "fixture-opening-1",
        status: "buy_prepared",
        rewards: [],
        decisions: [],
        dyli_order_ids: [],
        transaction: tx("buy"),
      };
    } else if (body.action === "results") {
      const detail = await (
        await originalFetch("/fixtures/box/" + play.box_id)
      ).json();
      const cards = detail.box.top_chase_cards;
      play.rewards = Array.from({ length: play.quantity }, (_, index) => ({
        index,
        token_id: String(index + 100),
        product_id: index + 100,
        product: cards[index % cards.length],
        rarity: "Common",
        buyback_amount: 12.5,
        disposition: null,
      }));
      play.status = "revealed";
      play.buy_tx_hash = body.txHash;
      play.transaction = null;
    } else if (body.action === "decision") {
      play.decisions = body.decisions;
      play.transaction = tx("finalize");
    } else if (body.action === "finalize") {
      holdings = play.rewards
        .filter((_, index) => play.decisions[index] === "claim")
        .map((r) => ({
          ...r.product,
          token_id: r.token_id,
          balance: 1,
          estimated_unit_value_usd: 15,
          estimated_value_usd: 15,
        }));
      balance += play.decisions.filter((d) => d === "sell_back").length * 12.5;
      play.status = "completed";
      order.status = "completed";
    }
    result = { box_play: play, ready: true };
  } else if (path === "/api/redemptions") {
    if (body.action === "quote")
      shipment = {
        id: "44444444-4444-4444-8444-444444444444",
        external_customer_id: "fixture-user",
        status: "quoted",
        items: holdings,
        address: body.address,
        shipping_options: {
          standard: [
            {
              id: "ups",
              carrier: "UPS Ground",
              amount: "12.50",
              estimated_days: 3,
            },
            {
              id: "usps",
              carrier: "USPS Priority",
              amount: "14.00",
              estimated_days: 2,
            },
          ],
        },
      };
    if (body.action === "prepare")
      Object.assign(shipment, {
        status: "prepared",
        pricing: { amount: 12.5 },
        payment: {
          token_address: token,
          spender: tx("ship").to,
          amount_cents: 1250,
        },
        transaction: tx("ship"),
      });
    if (body.action === "confirm") {
      shipment.status = "completed";
      redemptions = [shipment];
      holdings = [];
    }
    result = { redemption: shipment };
  } else
    return Response.json(
      { error: "Unexpected fixture endpoint" },
      { status: 500 },
    );
  return Response.json(result);
};
createRoot(document.getElementById("root")).render(
  <Providers runtime={{authMode: 'dyli_managed', appId: 'fixture', chainId: 11124, allowedOrigins: [], storefrontOrigin: null, sponsorTransactions: false, name: 'Vaulted', boxesOnly: false}}><LiveStorefront initialStorefront={storefront} /></Providers>,
);
