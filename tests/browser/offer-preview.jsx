// Actual vault component; every offer, wallet send and RPC response is simulated.
import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { LiveVaultSale } from "../../src/components/live-vault-sale";
import "../../src/app/globals.css";
import "../../src/components/live-storefront.css";

const wallet = `0x${"1".repeat(40)}`, market = `0x${"2".repeat(40)}`, collection = `0x${"3".repeat(40)}`;
const hash = `0x${"a".repeat(64)}`, approvalHash = `0x${"b".repeat(64)}`;
const params = new URLSearchParams(location.search);
const id = "11111111-1111-4111-8111-111111111111";
const item = { token_id: "123", name: "Charizard · PSA 9", balance: 1 };
const session = { identity: { walletAddress: wallet, externalCustomerId: "fixture" }, balance: { chain_id: 2741 } };
const expires = Math.floor(Date.now() / 1000) + (params.has("expired") ? -100 : 3600);
const offer = { id: "77", token_id: "123", price: 75, amount: "75000000", currency: "USDC",
  expiration: expires, expires_at: new Date(expires * 1000).toISOString(), type: "claim_buyback", quantity: 1 };
let approvalDone = !params.has("approval");
let sale = null;
window.fixtureAudit = [];
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
  const [open, setOpen] = useState(true), [balance, setBalance] = useState(100), [owned, setOwned] = useState(true);
  const api = useCallback(async (_path, body) => {
    window.fixtureAudit.push({ type: "api", action: body.action });
    if (body.action === "list") return { acceptances: sale ? [sale] : [] };
    if (body.action === "query") return { offers: params.has("empty") ? [] : [offer] };
    if (body.action === "prepare") {
      sale ||= { id, offer, token_id: "123", offer_id: "77", wallet_address: wallet, external_customer_id: "fixture",
        status: params.has("expired") ? "expired" : "prepared", expires_at: offer.expires_at,
        transaction: { chain: "abstract", chain_id: 2741, from: wallet, to: market, data: "0x1234", value: "0" },
        approval_transaction: params.has("approval") ? { chain: "abstract", chain_id: 2741, from: wallet, to: collection, data: "0xabcd", value: "0" } : null };
    }
    if (body.action === "confirm") {
      if (params.has("recording")) throw Error("Sale recording needs another confirmation attempt.");
      sale = { ...sale, status: "completed", tx_hash: body.txHash };
    }
    return { acceptance: structuredClone(sale) };
  }, []);
  return <main><h1>Vault sale preview</h1><p>Local fixture. No real funds or inventory move.</p>
    <p>Balance: ${balance} · In vault: {owned ? "1" : "0"}</p><button onClick={() => setOpen(true)}>Open vault item</button>
    {open && <LiveVaultSale item={item} session={session} api={api}
      onClose={() => setOpen(false)} onShip={() => setOpen(false)} onComplete={async () => { setOpen(false); setBalance(175); setOwned(false); }}
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
