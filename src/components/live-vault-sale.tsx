"use client";

import { useEffect, useRef, useState } from "react";
import { createPublicClient, erc1155Abi, http } from "viem";
import { abstract, abstractTestnet } from "viem/chains";
import { Art, LiveModal } from "@/components/live-catalog";
import { asRecord, assetImage, usd } from "@/lib/live-commerce";
import { abstractRpcUrl } from "@/lib/abstract-rpc.mjs";
import { loadVaultOffers } from "@/lib/vault-offers";
import { retryConfirmation } from "@/lib/confirmation-retry.mjs";
import { offerStorageKey, parseOfferRecovery, saleMayHaveBeenSent, settleVaultOffer, type OfferRecovery } from "@/lib/offer-recovery";
import type { ApiRecord, OfferAcceptance, SessionResponse, TransactionInstruction, VaultOffer } from "@/lib/types";

type Props = {
  item: ApiRecord; session: SessionResponse; initialAcceptanceId?: string; sellingAvailable?: boolean;
  api: <T>(path: string, body?: ApiRecord) => Promise<T>;
  send: (tx: TransactionInstruction, expiresAt?: string) => Promise<`0x${string}`>;
  onComplete: () => Promise<void>; onClose: () => void; onShip?: () => void;
  onSettled?: () => Promise<void>;
};

const offerExpiry = (value: string) => new Date(value).toLocaleString(undefined, {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

async function prepareAcceptance(api: Props["api"], body: ApiRecord) {
  try { return await api<{ acceptance: OfferAcceptance }>("/api/offers", body); }
  catch (error) {
    const details = asRecord(asRecord(error).details);
    if (asRecord(error).code !== "acceptance_exists" || !details.acceptance_id) throw error;
    return api<{ acceptance: OfferAcceptance }>("/api/offers", { action: "get", acceptanceId: details.acceptance_id });
  }
}

export function LiveVaultSale({ item, session, api, send, onComplete, onSettled, onClose, onShip, initialAcceptanceId, sellingAvailable = true }: Props) {
  const wallet = session.identity.walletAddress.toLowerCase(), tokenId = String(item.token_id);
  const storageKey = offerStorageKey(wallet, tokenId);
  const [offers, setOffers] = useState<VaultOffer[]>([]);
  const [selected, setSelected] = useState("");
  const [sale, setSale] = useState<OfferAcceptance | null>(null);
  const [saved, setSaved] = useState<OfferRecovery | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(true);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [offersUnavailable, setOffersUnavailable] = useState(false);
  const [recoveryHash, setRecoveryHash] = useState("");
  const [now, setNow] = useState(Date.now);
  const [reload, setReload] = useState(0);
  const busyRef = useRef(false);
  const writeRecovery = (value: OfferRecovery) => {
    localStorage.setItem(storageKey, JSON.stringify(value));
    setSaved(value);
  };
  const readRecovery = () => {
    const raw = localStorage.getItem(storageKey);
    const recovery = parseOfferRecovery(raw, wallet, tokenId);
    if (raw && !recovery) throw new Error("Your saved sale could not be read. Check your wallet history before starting another sale.");
    return recovery;
  };
  const complete = sale?.status === "completed";
  const notified = useRef(false);
  useEffect(() => {
    if (!complete || notified.current || !onSettled) return;
    notified.current = true;
    void onSettled().catch(() => setError("Your sale is confirmed. Your account will update when you refresh."));
  }, [complete, onSettled]);
  const pending = saleMayHaveBeenSent(sale, saved);
  const expired = !!sale && Date.parse(sale.expires_at) - now < 30000;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setRestoring(true); setRestoreFailed(false); setOffersUnavailable(false); setError("");
      let checkingOffers = false;
      try {
        const raw = localStorage.getItem(storageKey);
        let recovery = parseOfferRecovery(raw, wallet, tokenId);
        if (raw && !recovery) throw new Error("Your saved sale could not be read. Check your wallet history before starting another sale.");
        let current: OfferAcceptance | null = null;
        if (initialAcceptanceId && recovery?.id && recovery.id !== initialAcceptanceId) {
          throw new Error("Another sale for this item is saved on this device. Open the item from your vault to finish it first.");
        }
        if (initialAcceptanceId && !recovery) {
          current = (await api<{ acceptance: OfferAcceptance }>("/api/offers", { action: "get", acceptanceId: initialAcceptanceId })).acceptance;
          recovery = { wallet, tokenId, key: crypto.randomUUID(), id: current.id,
            offerId: current.offer_id, expectedAmount: current.offer.amount, ...(current.tx_hash ? { hash: current.tx_hash } : {}) };
        } else if (recovery) {
          const payload = await prepareAcceptance(api, recovery.id
            ? { action: "get", acceptanceId: recovery.id }
            : { action: "prepare", tokenId, offerId: recovery.offerId, expectedAmount: recovery.expectedAmount, idempotencyKey: recovery.key });
          current = payload.acceptance;
          recovery = { ...recovery, id: current.id };
        } else {
          const history = await api<{ acceptances: OfferAcceptance[] }>("/api/offers", { action: "list" });
          current = history.acceptances.find(value => value.token_id === tokenId && value.wallet_address.toLowerCase() === wallet &&
            ["prepared", "processing", "requires_action"].includes(value.status)) || null;
          if (current) recovery = { wallet, tokenId, key: crypto.randomUUID(), id: current.id,
            offerId: current.offer_id, expectedAmount: current.offer.amount, ...(current.tx_hash ? { hash: current.tx_hash } : {}) };
        }
        if (!active) return;
        if (current && recovery) {
          setSale(current); setSaved(recovery);
          if (current.status === "completed") localStorage.removeItem(storageKey);
          else localStorage.setItem(storageKey, JSON.stringify(recovery));
          const knownHash = current.tx_hash || recovery.hash;
          if (knownHash && current.status !== "completed") {
            // Resume only receipt confirmation; opening this sheet must never
            // trigger another wallet prompt or submit another sale.
            const result = await retryConfirmation(() => api<{ acceptance: OfferAcceptance }>("/api/offers", {
              action: "confirm", acceptanceId: current!.id, txHash: knownHash,
            }));
            if (!active) return;
            setSale(result.acceptance);
            if (result.acceptance.status === "completed") { localStorage.removeItem(storageKey); setSaved(null); }
          }
        } else {
          // Catalog readiness is only a cached hint. The authenticated offer
          // endpoint checks current availability when this item is opened.
          checkingOffers = true;
          const offers = await loadVaultOffers(api, tokenId, reload > 0 || !sellingAvailable);
          if (!active) return;
          setOffers(offers); setSelected(offers[0]?.id || ""); setSale(null); setSaved(null);
        }
      } catch (failure) {
        if (active) {
          const recovery = parseOfferRecovery(localStorage.getItem(storageKey), wallet, tokenId);
          setError(recovery?.hash ? "Your transaction reference is saved. We couldn’t finish updating your sale yet. Retry confirmation."
            : failure instanceof Error ? failure.message : "Could not load offers");
          setRestoreFailed(!checkingOffers && !recovery?.hash); setOffersUnavailable(checkingOffers);
          if (checkingOffers) setOffers([]);
        }
      } finally { if (active) setRestoring(false); }
    };
    void load();
    return () => { active = false; };
  }, [api, storageKey, tokenId, wallet, reload, initialAcceptanceId, sellingAvailable]);

  useEffect(() => {
    if (sale || restoring || restoreFailed || busy || !offers.length) return;
    const expiry = Math.min(...offers.map(offer => Date.parse(offer.expires_at)));
    const timer = window.setTimeout(() => setReload(value => value + 1),
      Math.max(1000, Math.min(2147483647, expiry - Date.now() + 100)));
    return () => window.clearTimeout(timer);
  }, [sale, restoring, restoreFailed, busy, offers]);

  const run = async (label: string, action: () => Promise<void>) => {
    if (busyRef.current || restoring) return;
    busyRef.current = true; setBusy(label); setError("");
    try {
      if (navigator.locks) await navigator.locks.request(`dyli-live:${wallet}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error("Another wallet action is open in another tab. Finish it first.");
        await action();
      });
      else throw new Error("Please update your browser before selling from your vault.");
    } catch (failure) {
      const recovery = parseOfferRecovery(localStorage.getItem(storageKey), wallet, tokenId);
      setError(recovery?.hash ? "Your transaction reference is saved. We couldn’t finish updating your sale yet. Retry confirmation."
        : failure instanceof Error ? failure.message : "Please try again");
    }
    finally { busyRef.current = false; setBusy(""); }
  };

  const prepare = () => run("Preparing your offer…", async () => {
    const offer = offers.find(value => value.id === selected);
    if (!offer || Date.parse(offer.expires_at) - Date.now() < 30000) throw new Error("Refresh offers to get an available price.");
    const previous = readRecovery();
    if (previous?.id) throw new Error("A sale is already open. Close and reopen this item to continue it.");
    const recovery = previous || { wallet, tokenId, key: crypto.randomUUID(), offerId: offer.id, expectedAmount: offer.amount };
    writeRecovery(recovery);
    const result = await prepareAcceptance(api, { action: "prepare", tokenId,
      offerId: recovery.offerId, expectedAmount: recovery.expectedAmount, idempotencyKey: recovery.key });
    writeRecovery({ ...recovery, id: result.acceptance.id });
    setSale(result.acceptance);
    await submit(result.acceptance);
  });

  const submit = async (sale: OfferAcceptance) => {
    let recovery = readRecovery();
    if (!recovery || recovery.id !== sale.id) throw new Error("Your saved sale changed. Close and reopen this item to continue.");
    if (recoveryHash.trim()) {
      const value = recoveryHash.trim();
      if (!/^0x[a-f\d]{64}$/i.test(value)) throw new Error("Enter a valid transaction hash from your wallet history.");
      recovery = recovery.approvalAttempted && !recovery.attempted && !recovery.hash && !sale.tx_hash
        ? { ...recovery, approvalHash: value } : { ...recovery, hash: value, attempted: true };
      writeRecovery(recovery);
    }
    const { acceptance: fresh } = await api<{ acceptance: OfferAcceptance }>("/api/offers", { action: "get", acceptanceId: sale.id });
    setSale(fresh);
    const chain = session.balance.chain_id === 2741 ? abstract : abstractTestnet;
    const client = createPublicClient({ chain, transport: http(abstractRpcUrl(chain.id, {
      url: process.env.NEXT_PUBLIC_ABSTRACT_RPC_URL, alchemyKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
    })) });
    const result = await settleVaultOffer({ sale: fresh, recovery, save: writeRecovery, send, progress: setBusy,
      wait: hash => client.waitForTransactionReceipt({ hash, timeout: 60000 }),
      approved: tx => client.readContract({ address: tx.to, abi: erc1155Abi, functionName: "isApprovedForAll", args: [wallet as `0x${string}`, fresh.transaction!.to] }),
      confirm: async hash => (await api<{ acceptance: OfferAcceptance }>("/api/offers", { action: "confirm", acceptanceId: fresh.id, txHash: hash })).acceptance,
    });
    setSale(result);
    if (result.status === "completed") { localStorage.removeItem(storageKey); setSaved(null); }
  };
  const sell = () => run("Checking your offer…", async () => { if (sale) await submit(sale); });

  const refreshOffers = () => run("Refreshing offers…", async () => {
    const recovery = readRecovery();
    if (saleMayHaveBeenSent(sale, recovery) || recovery?.approvalAttempted) throw new Error("Check your saved transaction before starting another sale.");
    if (sale) {
      const { acceptance: fresh } = await api<{ acceptance: OfferAcceptance }>("/api/offers", { action: "get", acceptanceId: sale.id });
      if (saleMayHaveBeenSent(fresh, recovery)) { setSale(fresh); throw new Error("A sale has already been submitted. Check its confirmation."); }
    }
    const offers = await loadVaultOffers(api, tokenId, true);
    localStorage.removeItem(storageKey); setSaved(null); setSale(null); setRecoveryHash("");
    setOffers(offers); setSelected(offers[0]?.id || "");
  });
  const checkNeeded = pending || !!saved?.approvalAttempted;
  const knownHash = sale?.tx_hash || saved?.hash || saved?.approvalHash;
  const chosen = offers.find(value => value.id === selected);
  return <LiveModal title={complete ? "Sale complete" : "In your vault"} className="lc-vault-sale" dismissible={!busy}
    onClose={complete ? () => { void onComplete(); } : onClose}>
    <div className="lc-checkout">
      <Art src={assetImage(item)} name={String(item.name || "Collectible")} />
      <h2>{String(item.name || "Your collectible")}</h2>
      {error && <p className="lc-notice" role="alert">{error}</p>}
      {restoring || busy ? <p role="status" aria-live="polite">{busy || "Loading your offers…"}</p> : complete ? <>
        <p className="lc-stat"><span>Sold for</span><strong>{usd(sale.offer.price)}</strong></p>
        <button className="lc-primary" onClick={() => { void onComplete(); }}>Back to vault</button>
      </> : restoreFailed ? <button className="lc-secondary" onClick={() => setReload(value => value + 1)}>Retry loading</button> : sale ? <>
        <p className="lc-stat"><span>{sale.offer.type === "claim_buyback" ? "48-hour claim offer" : "Standing offer"}</span><strong>{usd(sale.offer.price)}</strong></p>
        <p className="lc-vault-expiry">Expires {offerExpiry(sale.expires_at)}</p>
        {checkNeeded ? <>
          <p>{saved?.receiptConfirmed ? "Your transaction is confirmed. We’re finishing the sale record."
            : knownHash ? "Your transaction reference is saved. Continue confirmation without sending it again."
              : "A transaction was started, but its reference wasn’t saved. Enter it from your wallet history to continue."}</p>
          {knownHash ? <a href={`${(session.balance.chain_id === 2741 ? abstract : abstractTestnet).blockExplorers.default.url}/tx/${knownHash}`} target="_blank" rel="noreferrer">View transaction</a> : <label>Transaction hash from your wallet history
            <input aria-label="Transaction hash" value={recoveryHash} onChange={event => setRecoveryHash(event.target.value)} placeholder={saved?.hash || sale.tx_hash || saved?.approvalHash || "0x…"} />
          </label>}
          <button className="lc-primary" onClick={sell}>Retry confirmation</button>
        </> : expired ? <>
          <p>This offer has expired.</p>
          <button className="lc-primary" onClick={refreshOffers}>Check for new offers</button>
        </> : <>
          <button className="lc-primary" onClick={sell}>Accept offer · {usd(sale.offer.price)}</button>
        </>}
        {!checkNeeded && <>
          <details className="lc-vault-recovery"><summary>Already submitted this sale?</summary>
            <label>Transaction hash<input aria-label="Sale transaction hash" value={recoveryHash} onChange={event => setRecoveryHash(event.target.value)} placeholder="0x…" /></label>
            <button className="lc-secondary" disabled={!/^0x[a-f\d]{64}$/i.test(recoveryHash.trim())} onClick={sell}>Check confirmation</button>
          </details>
        </>}
      </> : offers.length ? <>
        {offers.map(offer => <label className="lc-stat lc-vault-offer" key={offer.id}>
          <span>{offers.length > 1 && <input type="radio" name="vault-offer" checked={selected === offer.id} onChange={() => setSelected(offer.id)} />}{offer.type === "claim_buyback" ? "48-hour claim offer" : "Standing offer"}</span>
          <strong>{usd(offer.price)}</strong>
        </label>)}
        {chosen && <p className="lc-vault-expiry">Expires {offerExpiry(chosen.expires_at)}</p>}
        {chosen?.type === "claim_buyback" && chosen.standing_offer_price != null && <p className="lc-vault-expiry">After expiry, the current standing offer is {usd(chosen.standing_offer_price)}. Standing offers can change.</p>}
        {chosen && Date.parse(chosen.expires_at) - now >= 30000
          ? <button className="lc-primary" onClick={prepare}>Accept offer · {usd(chosen.price)}</button>
          : <><p>This offer has expired.</p><button className="lc-primary" onClick={refreshOffers}>Check for new offers</button></>}
      </> : offersUnavailable ? <div className="lc-vault-unavailable"><p>Your item is safe in your vault.</p><button className="lc-secondary" onClick={() => setReload(value => value + 1)}>Retry loading offers</button></div>
        : <><p>No offer available right now.</p><button className="lc-secondary" onClick={refreshOffers}>Check for offers</button></>}
      {onShip && !complete && !restoring && !restoreFailed && !busy && !checkNeeded && <button className="lc-vault-ship" onClick={onShip}>Ship item</button>}
    </div>
  </LiveModal>;
}
