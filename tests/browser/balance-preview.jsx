// Isolated balance UI: all wallet sends and balances below are fixtures.
import { useCallback, useState } from "react";
import { LiveBalance } from "../../src/components/live-balance";
import { withdrawalKey } from "../../src/lib/wallet-transfer";
import "../../src/components/live-balance.css";

const wallet = "0x1111111111111111111111111111111111111111";
const token = "0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1";
const hash = `0x${"ab".repeat(32)}`;
const params = new URLSearchParams(location.search);
const balance = { amount: "10.123456", currency: "USDC", token, chain_id: 2741 };
const session = { identity: { walletAddress: wallet, name: "Preview" }, balance };

export function BalancePreview() {
  const [open, setOpen] = useState(true);
  const [sends, setSends] = useState(0);
  const readWallet = useCallback(async reference => {
    await new Promise(resolve => setTimeout(resolve, 150));
    const record = JSON.parse(localStorage.getItem(withdrawalKey(wallet)) || "null");
    const amount = record?.hash && !params.has("pending") ? (10.123456 - Number(record.amount)).toFixed(6) : balance.amount;
    return { wallet, balance: { ...balance, amount }, ...(reference ? { transfer: {
      hash: reference, status: params.has("pending") ? "pending" : "confirmed",
      recipient: record?.recipient, amount: record?.amount, timestamp: Math.ceil(Date.now() / 1000),
    } } : {}) };
  }, []);
  return <main><p>Isolated wallet preview. No money moves.</p><output>Simulated sends: {sends}</output><button onClick={() => setOpen(true)}>Open balance</button>
    {open && <LiveBalance session={session} readWallet={readWallet} onClose={() => setOpen(false)} onSignOut={async () => setOpen(false)} send={async () => {
      setSends(count => count + 1);
      await new Promise(resolve => setTimeout(resolve, 1200));
      if (params.has("rejected")) throw Object.assign(Error("You cancelled the transfer."), { broadcastAttempted: false });
      if (params.has("uncertain")) throw Object.assign(Error("Check your transfer before sending again."), { broadcastAttempted: true });
      return hash;
    }} />}
  </main>;
}
