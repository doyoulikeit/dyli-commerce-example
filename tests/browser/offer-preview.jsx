// Actual vault component; every offer, wallet send and RPC response is simulated.
import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { LiveVaultSale } from "../../src/components/live-vault-sale";
import { LiveVaultCard } from "../../src/components/live-vault-card";
import { LiveSaleActivity } from "../../src/components/live-activity";
import "../../src/app/globals.css";
import "../../src/components/live-storefront.css";

const wallet = `0x${"1".repeat(40)}`, market = `0x${"2".repeat(40)}`, collection = `0x${"3".repeat(40)}`;
const hash = `0x${"a".repeat(64)}`, approvalHash = `0x${"b".repeat(64)}`;
const params = new URLSearchParams(location.search);
const id = "11111111-1111-4111-8111-111111111111";
const item = { token_id: "123", name: "Togekiss AR - M2a: High Class Pack: MEGA Dream ex", image_url: "https://tcgplayer-cdn.tcgplayer.com/product/665874_400w.jpg", balance: 1, estimated_unit_value_usd: 1.77 };
const session = { identity: { walletAddress: wallet, externalCustomerId: "fixture" }, balance: { chain_id: 2741 } };
const expires = Math.floor(Date.now() / 1000) + (params.has("expired") ? -100 : params.has("rollover") ? 12 : 48 * 3600);
const offer = { id: "77", token_id: "123", price: 1.5, amount: "1500000", currency: "USDC", standing_offer_price: 1.18,
  expiration: expires, expires_at: new Date(expires * 1000).toISOString(), type: "claim_buyback", quantity: 1 };
const currentOffer = () => !params.has("rollover") || Date.now() < expires * 1000 ? offer : {
  ...offer, id: "78", price: 1.18, amount: "1180000", type: "standing_buyback",
  expires_at: new Date(Date.now() + 86400000).toISOString(), expiration: Math.floor(Date.now() / 1000) + 86400,
};
let approvalDone = !params.has("approval");
let sale = params.has("resume") ? JSON.parse(sessionStorage.getItem("fixture-sale") || "null") : null;
let confirmations = 0;
window.fixtureAudit = [];
window.fixtureOffersAvailable = !params.has("unavailable");
window.fixtureRecordingAvailable = !params.has("recording");
window.fixtureRefreshAvailable = !params.has("accountfail");
window.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  const rpc = value => Response.json({ jsonrpc: "2.0", id: request.id, result: value });
  if (request.method === "eth_call") return rpc(`0x${(approvalDone ? "1" : "0").padStart(64, "0")}`);
  if (request.method === "eth_blockNumber") return rpc("0x1");
  if (request.method === "eth_getTransactionReceipt") return rpc({
    transactionHash: request.params[0], transactionIndex: "0x0", blockNumber: "0x1", blockHash: `0x${"c".repeat(64)}`,
    from: wallet, to: market, cumulativeGasUsed: "0x100", gasUsed: "0x100", effectiveGasPrice: "0x1",
    status: "0x1", type: "0x2", logs: [], l2ToL1Logs: [], logsBloom: `0x${"0".repeat(512)}`, contractAddress: null,
  });
  throw Error(`No external request is allowed in this fixture: ${request.method}`);
};
function Preview() {
  const [open, setOpen] = useState(!params.has("vault")), [balance, setBalance] = useState(100), [owned, setOwned] = useState(true);
  const [shipping, setShipping] = useState(false);
  const onSettled = useCallback(async () => {
    window.fixtureAudit.push({ type: "account-read" });
    if (params.has("slowaccount")) await new Promise(resolve => { window.fixtureReleaseAccountRefresh = resolve; });
    if (!window.fixtureRefreshAvailable) throw Error("Account unavailable");
    setBalance(101.425); setOwned(false);
  }, []);
  const api = useCallback(async (_path, body) => {
    window.fixtureAudit.push({ type: "api", action: body.action });
    if (body.action === "list") return { acceptances: sale ? [sale] : [] };
    if (body.action === "query") {
      if (!window.fixtureOffersAvailable) throw Object.assign(Error("Vault selling is not available yet. Please try again later."), { status: 503 });
      return { offers: params.has("empty") ? [] : [currentOffer()] };
    }
    if (body.action === "prepare") {
      const quoted = currentOffer();
      if (body.offerId !== quoted.id || body.expectedAmount !== quoted.amount) throw Error("Offer changed");
      sale ||= { id, offer: quoted, token_id: "123", offer_id: quoted.id, wallet_address: wallet, external_customer_id: "fixture",
        status: params.has("expired") ? "expired" : "prepared", expires_at: quoted.expires_at,
        transaction: { chain: "abstract", chain_id: 2741, from: wallet, to: market, data: "0x1234", value: "0" },
        approval_transaction: params.has("approval") ? { chain: "abstract", chain_id: 2741, from: wallet, to: collection, data: "0xabcd", value: "0" } : null };
      sessionStorage.setItem("fixture-sale", JSON.stringify(sale));
    }
    if (body.action === "confirm") {
      confirmations++;
      if (!window.fixtureRecordingAvailable || (params.has("transient") && confirmations === 1))
        throw Object.assign(Error("Sale recording needs another confirmation attempt."), { status: 503 });
      sale = { ...sale, status: "completed", tx_hash: body.txHash };
      sessionStorage.setItem("fixture-sale", JSON.stringify(sale));
    }
    return { acceptance: structuredClone(sale) };
  }, []);
  return <main className="lc-app" style={{ padding: 24 }}><h1>Vault sale preview</h1><p>Local fixture. No real funds or inventory move.</p>
    <p>Balance: ${balance} · In vault: {owned ? "1" : "0"}</p><button onClick={() => setOpen(true)}>Open vault item</button>
    {shipping && <p role="status">Shipping selected</p>}
    {owned && <div style={{ maxWidth: 280 }}><LiveVaultCard item={item} api={api} sellingAvailable={!params.has("unavailable") && !params.has("stale")} onOpen={() => setOpen(true)} onShip={() => setShipping(true)} /></div>}
    {!owned && sale && <LiveSaleActivity sales={[{ ...sale, item, created_at: new Date().toISOString() }]} busy="" onContinue={() => setOpen(true)} />}
    {open && <LiveVaultSale item={item} session={session} api={api} sellingAvailable={!params.has("unavailable") && !params.has("stale")}
      onClose={() => setOpen(false)} onShip={() => { setOpen(false); setShipping(true); }} onSettled={onSettled} onComplete={async () => { setOpen(false); }}
      send={async tx => {
        const approval = tx.data === "0xabcd";
        window.fixtureAudit.push({ type: "send", phase: approval ? "approval" : "sale" });
        await new Promise(resolve => setTimeout(resolve, 200));
        if (params.has("rejected")) throw Object.assign(Error("You cancelled the wallet request."), { broadcastAttempted: false });
        if (params.has("uncertain")) throw Object.assign(Error("Submission could not be confirmed. Check your wallet history."), { broadcastAttempted: true });
        if (approval) approvalDone = true;
        return approval ? approvalHash : hash;
      }} />}
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview />);
