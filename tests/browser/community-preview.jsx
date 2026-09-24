// Real marketplace/trade components. Every API, wallet and RPC call is simulated.
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Home, ShoppingBag, Box, Layers, ArrowLeftRight, Activity } from "lucide-react";
import { LiveCommunity } from "../../src/components/live-community";
import { CommunityActivity } from "../../src/components/community-activity";
import "../../src/app/globals.css";
import "../../src/components/live-storefront.css";

const wallet = `0x${"1".repeat(40)}`, other = `0x${"2".repeat(40)}`, market = `0x${"3".repeat(40)}`;
const hash = `0x${"a".repeat(64)}`, params = new URLSearchParams(location.search);
const items = [
  { token_id: "123", name: "Togekiss AR · MEGA Dream ex", image_url: "https://tcgplayer-cdn.tcgplayer.com/product/665874_400w.jpg", brand: "Pokemon", balance: 2 },
  { token_id: "124", name: "Charizard ex · Obsidian Flames", image_url: "https://tcgplayer-cdn.tcgplayer.com/product/509980_400w.jpg", brand: "Pokemon", balance: 1 },
  { token_id: "125", name: "Radiant Charizard · Crown Zenith", image_url: "https://tcgplayer-cdn.tcgplayer.com/product/478098_400w.jpg", brand: "Pokemon", balance: 1 },
  { token_id: "126", name: "Blastoise ex · Scarlet & Violet 151", image_url: "https://tcgplayer-cdn.tcgplayer.com/product/517046_400w.jpg", brand: "Pokemon", balance: 3 },
];
const trades = [
  { id: "1", role: "receiver", status: "open", from_items: [{ ...items[1], quantity: 1 }], to_items: [{ ...items[0], quantity: 1 }], from_usdc: 0, to_usdc: 10 },
  { id: "2", role: "sender", status: "open", from_items: [{ ...items[2], quantity: 1 }], to_items: [{ ...items[3], quantity: 1 }], from_usdc: 5, to_usdc: 0 },
  { id: "3", role: "receiver", status: "accepted", from_items: [{ ...items[3], quantity: 1 }], to_items: [{ ...items[0], quantity: 1 }], from_usdc: 0, to_usdc: 0 },
].map(trade => ({ ...trade, from: { username: "collector1234" }, to: { username: "alex" }, receipt_available: true, created_at: new Date().toISOString() }));
let action = JSON.parse(sessionStorage.getItem("community-fixture-action") || "null");
window.fixtureAudit = [];
window.fixtureRecordingAvailable = !params.has("recording");
window.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  const rpc = value => Response.json({ jsonrpc: "2.0", id: request.id, result: value });
  if (request.method === "eth_blockNumber") return rpc("0x1");
  if (request.method === "eth_getTransactionReceipt") return rpc({
    transactionHash: request.params[0], transactionIndex: "0x0", blockNumber: "0x1", blockHash: `0x${"c".repeat(64)}`,
    from: wallet, to: market, cumulativeGasUsed: "0x100", gasUsed: "0x100", effectiveGasPrice: "0x1",
    status: "0x1", type: "0x2", logs: [], l2ToL1Logs: [], logsBloom: `0x${"0".repeat(512)}`, contractAddress: null,
  });
  throw Error(`External network request blocked in fixture: ${request.method}`);
};
function Preview() {
  const [view, setView] = useState(params.get("view") || "shop");
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  const [session, setSession] = useState({ identity: { walletAddress: wallet, externalCustomerId: "fixture" }, balance: { chain_id: 2741 }, holdings: { items } });
  const api = useCallback(async (_path, body) => {
    window.fixtureAudit.push({ type: "api", action: body.action });
    if (body.action === "market") {
      let rows = params.has("empty") ? [] : items.map((product, index) => ({ product, token_id: product.token_id, kind: body.kind || "listing", order_id: String(77 + index), unit_amount: String((index + 1) * 25000000), price: (index + 1) * 25, quantity: 1, maker: index === 3 ? wallet : other, collector: { username: index === 3 ? "alex" : "collector1234" } }));
      if (body.mine) rows = rows.filter(item => item.maker === wallet);
      if (body.tokenId) rows = rows.filter(item => item.token_id === body.tokenId);
      if (body.q) rows = rows.filter(item => item.product.name.toLowerCase().includes(body.q.trim().toLowerCase()));
      return { items: rows, pagination: { next_offset: null } };
    }
    if (body.action === "collectors") return { collectors: [{ username: "collector1234", wallet: other }] };
    if (body.action === "holdings") return { items: items.slice(1), pagination: { has_more: false } };
    if (body.action === "trades") return { trades: params.has("empty") ? [] : trades, pagination: { next_offset: null } };
    if (body.action === "history") return { actions: action ? [action] : [] };
    if (body.action === "get") return { action: structuredClone(action) };
    if (body.action === "decline") {
      trades.find(trade => trade.id === body.tradeId).status = "declined";
      return { status: "declined" };
    }
    if (body.action === "prepare") {
      const input = structuredClone(body.input), product = items.find(item => item.token_id === input.token_id);
      if (product) input.preview = { product };
      const enrich = values => values.map(value => ({ ...items.find(item => item.token_id === value.token_id), ...value }));
      if (input.kind === "trade") input.preview = { give: enrich(input.give), receive: enrich(input.receive) };
      if (input.kind === "accept_trade") {
        const trade = trades.find(trade => trade.id === input.trade_id);
        input.preview = { give: trade.to_items, receive: trade.from_items }; input.give_usdc = String(trade.to_usdc * 1e6); input.receive_usdc = String(trade.from_usdc * 1e6);
      }
      action = { id: crypto.randomUUID(), input, kind: input.kind, wallet_address: wallet, external_customer_id: "fixture", status: "prepared", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600000).toISOString(), approvals: [], transaction: { chain: "abstract", chain_id: 2741, from: wallet, to: market, data: "0x1234", value: "0" } };
      sessionStorage.setItem("community-fixture-action", JSON.stringify(action));
      return { action: structuredClone(action) };
    }
    if (body.action === "confirm") {
      if (!window.fixtureRecordingAvailable) throw Object.assign(Error("Recording is temporarily unavailable. Your transaction is saved."), { status: 503 });
      action.status = "completed"; action.tx_hash = body.txHash;
      sessionStorage.setItem("community-fixture-action", JSON.stringify(action));
      return { action: structuredClone(action) };
    }
    throw Error(`Unknown fixture action ${body.action}`);
  }, []);
  const refresh = useCallback(async () => { window.fixtureAudit.push({ type: "refresh" }); setSession(value => ({ ...value })); }, []);
  const nav = [["home", "Home", Home], ["shop", "Shop", ShoppingBag], ["boxes", "Boxes", Box], ["vault", "Vault", Layers], ["trades", "Trades", ArrowLeftRight], ["activity", "Activity", Activity]];
  return <div className="lc-app">
    <header className="lc-header"><div className="brand-lockup"><strong>Vaulted</strong><i>LOCAL TEST</i></div>
      <nav>{nav.map(([key, label]) => <button key={key} aria-current={view === key ? "page" : undefined} onClick={() => setView(key)}>{label}</button>)}</nav>
      <button className="lc-secondary">$500.00</button>
    </header>
    <main style={{ width: "min(1440px,100%)", margin: "auto", padding: "32px 20px 100px" }}>
      {view === "activity" && <><h1>Activity</h1><CommunityActivity api={api} hasOtherActivity={false} /></>}
      <LiveCommunity view={view} session={session} api={api} marketplace={{ ready: true, include_dyli: true }} trading={{ ready: true, include_dyli: true }} intent={null} clearIntent={() => {}} login={() => {}} refresh={refresh}
        send={async () => { window.fixtureAudit.push({ type: "send" }); return hash; }} />
    </main>
    <nav className="lc-bottom-nav" aria-label="Mobile navigation">{nav.map(([key, label, Icon]) => <button key={key} aria-current={view === key ? "page" : undefined} onClick={() => setView(key)}><Icon size={20}/><span>{label}</span></button>)}</nav>
  </div>;
}
createRoot(document.getElementById("root")).render(<Preview />);
