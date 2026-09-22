// Actual shipping component, with every API, wallet and RPC operation simulated.
import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { LiveRedemption } from "../../src/components/live-redemption";
import { LiveShipmentActivity } from "../../src/components/live-activity";
import "../../src/app/globals.css";
import "../../src/components/live-storefront.css";

const params = new URLSearchParams(location.search);
const wallet = `0x${"1".repeat(40)}`, token = `0x${"2".repeat(40)}`, contract = `0x${"3".repeat(40)}`;
const hash = `0x${"a".repeat(64)}`, approvalHash = `0x${"b".repeat(64)}`;
const item = { token_id: "123", name: "Togekiss", image_url: "https://tcgplayer-cdn.tcgplayer.com/product/665874_400w.jpg", quantity: 1, balance: 1 };
let approved = !params.has("approval"), confirmations = 0;
let redemption = { id: "fixture-shipment", status: "prepared", items: [item],
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  address: { name: "Fixture Buyer", city: "New York", country_alpha2: "US" },
  pricing: { amount: 5 }, payment: { token_address: token, spender: contract, amount_cents: 500 },
  transaction: { chain: "abstract", chain_id: 2741, from: wallet, to: contract, data: "0x1234", value: "0" } };
localStorage.setItem(`dyli-live-shipment-v1:${wallet}`, JSON.stringify({ id: redemption.id,
  ...(params.has("resume") ? { hash, attempted: true } : {}) }));
window.fixtureAudit = [];
window.fetch = async (_url, init) => {
  const request = JSON.parse(init.body);
  const result = value => Response.json({ jsonrpc: "2.0", id: request.id, result: value });
  if (request.method === "eth_call") return result(`0x${(approved ? "ffffffff" : "0").padStart(64, "0")}`);
  if (request.method === "eth_blockNumber") return result("0x1");
  if (request.method === "eth_getTransactionReceipt") {
    approved = true;
    return result({ transactionHash: request.params[0], transactionIndex: "0x0", blockNumber: "0x1", blockHash: hash,
      from: wallet, to: token, cumulativeGasUsed: "0x100", gasUsed: "0x100", effectiveGasPrice: "0x1",
      status: "0x1", type: "0x2", logs: [], l2ToL1Logs: [], logsBloom: `0x${"0".repeat(512)}`, contractAddress: null });
  }
  throw Error(`Unexpected external call: ${request.method}`);
};
function Preview() {
  const [open, setOpen] = useState(true), [refreshed, setRefreshed] = useState(false);
  const api = useCallback(async (_path, body) => {
    window.fixtureAudit.push({ action: body.action });
    if (body.action === "confirm") {
      confirmations++;
      if (params.has("transient") && confirmations === 1) throw Object.assign(Error("Receipt not indexed"), { status: 409, code: "transaction_not_confirmed" });
      redemption = { ...redemption, status: "completed", redemption_tx_hash: body.txHash, result: { orders: [{ id: 123 }] } };
    }
    return { redemption };
  }, []);
  const onSettled = useCallback(async () => {
    window.fixtureAudit.push({ action: "account-read" });
    if (params.has("slowaccount")) await new Promise(resolve => { window.fixtureReleaseAccountRefresh = resolve; });
    setRefreshed(true);
  }, []);
  return <main><h1>Shipping preview</h1><p>No real payments or shipments.</p><p>Account refreshed: {String(refreshed)}</p>
    {refreshed && <LiveShipmentActivity shipments={[redemption]} onView={() => {}} />}
    {open && <LiveRedemption holdings={[item]} initialTokenId="123" session={{ identity: { walletAddress: wallet, email: "fixture@example.test" }, balance: { chain_id: 2741 } }}
      api={api} onClose={() => setOpen(false)} onComplete={async () => setOpen(false)} onSettled={onSettled}
      send={async tx => {
        const approval = tx.to === token;
        window.fixtureAudit.push({ action: "send", phase: approval ? "approval" : "shipment" });
        if (params.has("uncertain")) throw Object.assign(Error("Connection lost after signing"), { broadcastAttempted: true, transactionHash: approval ? approvalHash : hash });
        return approval ? approvalHash : hash;
      }} />}
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview />);
