"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, ExternalLink, LoaderCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { LiveModal } from "@/components/live-catalog";
import { usd } from "@/lib/live-commerce";
import { makeWithdrawal, parseWithdrawal, pendingWithdrawal, reconcileWithdrawal, submitWithdrawal, validTransferHash, walletExplorer, withdrawalKey, type WalletSnapshot, type Withdrawal } from "@/lib/wallet-transfer";
import type { SessionResponse, TransactionInstruction } from "@/lib/types";

type Props = {
  session: SessionResponse;
  readWallet: (hash?: string) => Promise<WalletSnapshot>;
  send: (transaction: TransactionInstruction) => Promise<`0x${string}`>;
  onClose: () => void;
  onSignOut: () => Promise<void>;
};
type View = "balance" | "deposit" | "withdraw" | "review" | "transfer";

export function LiveBalance({ session, readWallet, send, onClose, onSignOut }: Props) {
  const wallet = session.identity.walletAddress.toLowerCase();
  const key = withdrawalKey(wallet);
  const [stored, setStored] = useState<{ record: Withdrawal | null; error: string }>(() => {
    try { return { record: parseWithdrawal(localStorage.getItem(key), wallet), error: "" }; }
    catch (error) { return { record: null, error: error instanceof Error ? error.message : "Transfer storage is unavailable." }; }
  });
  const record = stored.record;
  const [view, setView] = useState<View>("balance");
  const [snapshot, setSnapshot] = useState<WalletSnapshot>({ wallet, balance: session.balance });
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [draft, setDraft] = useState<Withdrawal | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState("");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const checkingRef = useRef(false);
  const network = snapshot.balance.chain_id === 11124 ? "Abstract testnet" : "Abstract";
  const unresolved = pendingWithdrawal(record);

  const save = useCallback((next: Withdrawal | null) => {
    if (next) localStorage.setItem(key, JSON.stringify(next));
    else localStorage.removeItem(key);
    setStored({ record: next, error: "" });
  }, [key]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      try { setStored({ record: parseWithdrawal(localStorage.getItem(key), wallet), error: "" }); }
      catch (error) { setStored(current => ({ ...current, error: error instanceof Error ? error.message : "Check your saved transfer." })); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key, wallet]);

  const check = useCallback(async (hash?: string) => {
    if (checkingRef.current || busyRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const next = await readWallet(hash || (pendingWithdrawal(record) ? record?.hash : undefined));
      setSnapshot(next);
      if (record && next.transfer) save(reconcileWithdrawal(record, next));
      setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not refresh your balance. Try again."); }
    finally { checkingRef.current = false; setChecking(false); }
  }, [readWallet, record, save]);

  useEffect(() => {
    void check();
    if (view !== "deposit" && !(unresolved && record?.hash)) return;
    // Poll only while this sheet is open and visible, without reloading the
    // collection/orders or creating any customer/payment writes.
    const timer = setInterval(() => { if (!document.hidden) void check(); }, 8000);
    return () => clearInterval(timer);
  }, [view, unresolved, record?.hash, check, busy]);

  const work = async (label: string, action: () => Promise<void>, lock = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError("");
    try {
      if (lock && navigator.locks) await navigator.locks.request(`dyli-live:${wallet}`, { ifAvailable: true }, async active => {
        if (!active) throw new Error("Another action is in progress. Try again in a moment.");
        await action();
      });
      else await action();
    } catch (error) {
      const pending = (error as { withdrawal?: Withdrawal })?.withdrawal;
      if (pending) setStored({ record: pending, error: "" });
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally { busyRef.current = false; setBusy(""); }
  };

  const review = (event: FormEvent) => {
    event.preventDefault();
    if (unresolved || stored.error) return;
    void work("Checking balance…", async () => {
      const fresh = await readWallet();
      setSnapshot(fresh);
      setDraft(makeWithdrawal(recipient, amount, fresh, wallet));
      setView("review");
    });
  };
  const confirm = () => {
    if (!draft || unresolved || stored.error) return;
    void work("Sending…", async () => {
      try {
        await submitWithdrawal(draft, { read: readWallet, load: () => parseWithdrawal(localStorage.getItem(key), wallet), save: next => {
          save(next);
          if (next) setView("transfer");
        }, send });
      } catch (error) {
        if (!parseWithdrawal(localStorage.getItem(key), wallet)) setView("withdraw");
        throw error;
      }
    }, true);
  };
  const buttonText = (label: string) => busy ? <><LoaderCircle className="vr-spinner" size={17} />{busy}</> : <>{label}<ArrowRight size={17} /></>;

  return <LiveModal title={view === "balance" ? "Your balance" : view === "deposit" ? "Deposit" : view === "withdraw" ? "Withdraw" : view === "review" ? "Review transfer" : "Your transfer"}
    className="lc-balance-modal" dismissible={!busy} onClose={onClose}>
    <div className="lc-balance-body">
      {view !== "balance" && <button type="button" className="lc-balance-back" disabled={!!busy} onClick={() => { setError(""); setView(view === "review" ? "withdraw" : "balance"); }}><ArrowLeft size={16} />Back</button>}
      {(error || stored.error) && <p className="lc-error" role="alert">{error || stored.error}</p>}
      {view === "balance" && <>
        <div className="lc-balance-amount"><small>Available balance</small><strong>{usd(snapshot.balance.amount)}</strong><span>USDC · {network}</span></div>
        <div className="lc-balance-actions">
          <button className="lc-primary" disabled={!!busy} onClick={() => setView("deposit")}><ArrowDownLeft size={19} />Deposit</button>
          <button className="lc-secondary" disabled={!!busy || !!stored.error} onClick={() => { setError(""); setView(unresolved ? "transfer" : "withdraw"); }}><ArrowUpRight size={19} />Withdraw</button>
        </div>
        {record && <button className="lc-transfer-link" onClick={() => setView("transfer")} disabled={!!busy}><span>{unresolved ? "Transfer in progress" : record.status === "confirmed" ? "Last withdrawal" : "Transfer not sent"}<small>{record.amount} USDC</small></span><ArrowRight size={17} /></button>}
        <div className="lc-balance-foot"><button disabled={!!busy || checking} onClick={() => void check()}>{checking ? "Refreshing…" : "Refresh balance"}</button><button disabled={!!busy} onClick={() => void work("Signing out…", onSignOut)}>Sign out</button></div>
      </>}
      {view === "deposit" && <>
        <div className="lc-deposit-qr"><QRCodeSVG value={wallet} size={172} level="M" marginSize={2} title={`Your ${network} deposit address`} /></div>
        <p className="lc-network-notice">Send only <strong>USDC on {network}</strong> to this address.</p>
        <div className="lc-deposit-address"><small>Your wallet address</small><code>{wallet}</code></div>
        <button className="lc-primary" onClick={async () => {
          try { await navigator.clipboard.writeText(wallet); setCopied(true); }
          catch { setError("Copy the wallet address shown above."); }
        }}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Address copied" : "Copy address"}</button>
        <div className="lc-deposit-status"><span>{usd(snapshot.balance.amount)} available</span><button disabled={checking} onClick={() => void check()}>{checking ? <LoaderCircle className="vr-spinner" size={16} /> : "Check deposit"}</button></div>
        <a className="lc-balance-explorer" href={walletExplorer(snapshot.balance.chain_id, wallet)} target="_blank" rel="noreferrer">Wallet activity<ExternalLink size={13} /></a>
      </>}
      {view === "withdraw" && <form onSubmit={review} className="lc-withdraw-form">
        <label>Recipient address<input aria-label="Recipient address" placeholder="0x…" value={recipient} maxLength={42} onChange={event => setRecipient(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={!!busy || unresolved} required /></label>
        <label>Amount<div className="lc-withdraw-amount"><input aria-label="Amount in USDC" placeholder="0.00" inputMode="decimal" value={amount} maxLength={32} onChange={event => setAmount(event.target.value)} disabled={!!busy || unresolved} required /><span>USDC</span><button type="button" disabled={!!busy || unresolved || checking} onClick={() => setAmount(snapshot.balance.amount)}>Max</button></div></label>
        <small>{snapshot.balance.amount} USDC available</small>
        <p className="lc-network-notice">The receiving wallet must support <strong>USDC on {network}</strong>.</p>
        {unresolved && <button type="button" className="lc-secondary" onClick={() => setView("transfer")}>View pending transfer</button>}
        <button className="lc-primary" disabled={!!busy || unresolved || !!stored.error || !recipient.trim() || !amount.trim()}>{buttonText("Review transfer")}</button>
      </form>}
      {view === "review" && draft && <>
        <div className="lc-balance-amount"><small>You’re sending</small><strong>{draft.amount}<span> USDC</span></strong></div>
        <dl className="lc-transfer-details"><div><dt>To</dt><dd><code>{draft.recipient}</code></dd></div><div><dt>Network</dt><dd>{network}</dd></div></dl>
        <p className="lc-network-notice">Check the full address. Transfers can’t be reversed.</p>
        <button className="lc-primary" disabled={!!busy || unresolved || !!stored.error} onClick={confirm}>{buttonText("Confirm withdrawal")}</button>
      </>}
      {view === "transfer" && record && <div className="lc-transfer-result" role="status">
        {record.status === "confirmed" ? <Check size={30} /> : pendingWithdrawal(record) ? <LoaderCircle size={26} className="vr-spinner" /> : null}
        <h2>{record.status === "confirmed" ? "Sent." : record.status === "failed" ? "Transfer not sent." : record.hash ? "On its way." : "Checking your transfer."}</h2>
        <strong>{record.amount} USDC</strong>
        <code>{record.recipient}</code>
        <span>{network}</span>
        {record.hash && <a className="lc-balance-explorer" href={walletExplorer(record.chainId, wallet, record.hash)} target="_blank" rel="noreferrer">View transfer<ExternalLink size={13} /></a>}
        {!record.hash && <>
          <p>Don’t send again until this transfer is confirmed.</p>
          <a className="lc-balance-explorer" href={walletExplorer(record.chainId, wallet)} target="_blank" rel="noreferrer">Check wallet activity<ExternalLink size={13} /></a>
          <details><summary>Have a transfer reference?</summary><input aria-label="Transfer reference" placeholder="0x…" value={reference} onChange={event => setReference(event.target.value.trim())} /><button className="lc-secondary" disabled={checking || !validTransferHash(reference)} onClick={() => void check(reference)}>Check transfer</button></details>
        </>}
        <button className="lc-primary" disabled={!!busy || checking} onClick={() => unresolved ? void check() : onClose()}>{unresolved ? checking ? "Checking…" : "Check status" : "Done"}</button>
      </div>}
    </div>
  </LiveModal>;
}
