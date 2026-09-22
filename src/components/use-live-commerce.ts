"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCommerceAuth } from "@/components/commerce-auth";
import { encodeFunctionData, erc20Abi, isAddress } from "viem";
import { useCommerceRuntime } from "@/components/providers";
import { parseCardCheckout, unpaidCardError, type CardCheckout } from "@/lib/card-checkout";
import { normalizeOpeningPreferences, type OpeningPreferences } from "@/lib/opening-preferences";
import type { WalletSnapshot } from "@/lib/wallet-transfer";
import { retryConfirmation } from "@/lib/confirmation-retry.mjs";
import {
  asRecord,
  asRows,
  balancePaymentCents,
  boxItem,
  boxPlayNeedsOpening,
  catalogFromOrderLine,
  canClearBalanceRecovery,
  settlementSummary,
  parseRecovery,
  receiptRequired,
  validateTransaction,
  type PurchaseRecovery,
} from "@/lib/live-commerce";
import type {
  ApiRecord,
  BoxPlay,
  CatalogItem,
  SessionResponse,
  TransactionInstruction,
} from "@/lib/types";

const recoveryKey = (wallet: string) =>
  `dyli-live-purchase-v1:${wallet.toLowerCase()}`;
const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function useLiveCommerce() {
  const runtime = useCommerceRuntime();
  const { ready, authenticated, login, logout, getAccessToken, wallet, sendTransaction, signMessage, error: authError } = useCommerceAuth();
  const address = wallet?.address.toLowerCase() || "";
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [flow, setFlow] = useState<PurchaseRecovery | null>(null);
  const [play, setPlay] = useState<BoxPlay | null>(null);
  // Checkout secrets stay in memory, never in the recovery record/localStorage.
  const [cardCheckout, setCardCheckout] = useState<Extract<CardCheckout, { mode: "embedded" }> | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const flowRef = useRef<PurchaseRecovery | null>(null);
  const busyRef = useRef(false);
  const sessionRequest = useRef<{ api: typeof api; promise: Promise<SessionResponse> } | null>(null);

  const api = useCallback(
    async <T>(path: string, body?: ApiRecord): Promise<T> => {
      const token = await getAccessToken();
      if (!token || !address) throw new Error("Sign in to continue");
      const response = await fetch(path, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body
          ? { body: JSON.stringify({ ...body, walletAddress: address }) }
          : {}),
      });
      const payload = asRecord(await response.json());
      if (!response.ok)
        throw Object.assign(
          new Error(
            String(payload.message || payload.error || "Request failed"),
          ),
          { status: response.status, code: payload.error, details: payload.details },
        );
      return payload as T;
    },
    [getAccessToken, address],
  );

  const loadSession = useCallback(async (fresh = false) => {
    const previous = sessionRequest.current;
    if (previous?.api === api) {
      if (!fresh) return previous.promise;
      // A read started before settlement cannot confirm the new balance/vault.
      // Drain it first so it cannot overwrite the post-settlement snapshot.
      await previous.promise.catch(() => {});
      if (sessionRequest.current?.api === api) return sessionRequest.current.promise;
    }
    const promise = api<SessionResponse>(`/api/session?wallet=${encodeURIComponent(address)}${fresh ? "&fresh=1" : ""}`)
      .finally(() => { if (sessionRequest.current?.promise === promise) sessionRequest.current = null; });
    sessionRequest.current = { api, promise };
    return promise;
  }, [api, address]);

  const refresh = useCallback(async (fresh = false) => {
    const next = await loadSession(fresh);
    setSession(next);
    return next;
  }, [loadSession]);

  const refreshAfterPurchase = async (message: string) => {
    // The confirmed purchase and its saved receipts remain authoritative even
    // when account-history refresh is unavailable. Never retry the payment.
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await refresh(true); return; }
      catch (failure) {
        const status = Number(asRecord(failure).status);
        if (status >= 400 && status < 500) break;
        if (attempt < 2) await delay(500 * (attempt + 1));
      }
    }
    setError(message);
  };

  const readWallet = useCallback(async (hash?: string) => {
    const snapshot = await api<WalletSnapshot>(`/api/wallet?wallet=${encodeURIComponent(address)}${hash ? `&hash=${encodeURIComponent(hash)}` : ""}`);
    if (snapshot.wallet.toLowerCase() !== address) throw new Error("This balance belongs to a different wallet.");
    setSession(current => current?.identity.walletAddress.toLowerCase() === address
      ? { ...current, balance: snapshot.balance } : current);
    return snapshot;
  }, [api, address]);

  const save = useCallback(
    (next: PurchaseRecovery | null) => {
      // Save receipt identifiers before the next asynchronous step. Never store keys,
      // bearer tokens, balances or authoritative outcomes in browser storage.
      flowRef.current = next;
      setFlow(next);
      if (next)
        localStorage.setItem(recoveryKey(address), JSON.stringify(next));
      else localStorage.removeItem(recoveryKey(address));
    },
    [address],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setCardCheckout(null);
      if (!authenticated || !address) {
        setSession(null);
        setFlow(null);
        flowRef.current = null;
        setPlay(null);
        return;
      }
      try {
        const saved = parseRecovery(
          localStorage.getItem(recoveryKey(address)),
          address,
        );
        flowRef.current = saved;
        setFlow(saved);
        const next = await loadSession();
        if (active) setSession(next);
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Account could not be loaded",
          );
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [authenticated, address, loadSession]);

  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(label);
      setError("");
      const perform = async () => {
        // Reconcile under the wallet-wide lock before using this tab's snapshot.
        const saved = parseRecovery(
          localStorage.getItem(recoveryKey(address)),
          address,
        );
        flowRef.current = saved;
        setFlow(saved);
        await action();
      };
      try {
        if (navigator.locks) {
          await navigator.locks.request(
            `dyli-live:${address}`,
            { ifAvailable: true },
            async (lock) => {
              if (!lock)
                throw new Error("A purchase is already open in another tab");
              await perform();
            },
          );
        } else await perform();
        return true;
      } catch (failure) {
        setError(
          failure instanceof Error ? failure.message : "Please try again",
        );
        return false;
      } finally {
        busyRef.current = false;
        setBusy("");
      }
    },
    [address],
  );

  const send = useCallback(
    async (tx: TransactionInstruction, expiresAt?: string) => {
      try {
        if (!session) throw new Error("Wait for your wallet to load");
        validateTransaction(tx, address, session.balance.chain_id);
        await wallet?.switchChain(session.balance.chain_id);
      } catch (cause) {
        throw Object.assign(new Error(cause instanceof Error ? cause.message : "Your wallet is not ready", { cause }), { broadcastAttempted: false });
      }
      const result = await sendTransaction(
        {
          to: tx.to,
          data: tx.data,
          value: BigInt(0),
          chainId: session.balance.chain_id,
        },
        {
          address,
          sponsor: false,
          paymaster: runtime?.paymaster,
          expiresAt,
          uiOptions: { showWalletUIs: true },
        },
      );
      return result.hash;
    },
    [address, session, sendTransaction, wallet, runtime?.paymaster],
  );

  const prepareQuote = (item: CatalogItem, quantity: number, openingPreferences?: OpeningPreferences) =>
    run("Preparing checkout…", async () => {
      if (flowRef.current && receiptRequired(flowRef.current))
        throw new Error("Continue your saved purchase before starting another");
      const next: PurchaseRecovery = {
        version: 1,
        wallet: address,
        key: crypto.randomUUID(),
        item,
        openingPreferences: normalizeOpeningPreferences(openingPreferences),
      };
      save(next);
      const payload = await api<ApiRecord>("/api/checkout", {
        action: "quote",
        idempotencyKey: next.key,
        quoteItem: { ...item.purchase.quoteItem, quantity },
      });
      save({
        ...next,
        quote: asRecord(payload.quote),
        payment: asRecord(payload.payment),
      });
    });

  const beginBox = async (orderId: string, source?: CatalogItem) => {
    if (
      flowRef.current?.orderId &&
      flowRef.current.orderId !== orderId &&
      receiptRequired(flowRef.current)
    ) {
      throw new Error("Finish your saved opening before switching purchases");
    }
    const next = flowRef.current || {
      version: 1 as const,
      wallet: address,
      key: crypto.randomUUID(),
      item: source!,
    };
    if (!next.item) throw new Error("Open this purchase from your activity");
    save({ ...next, orderId });
    const payload = await api<{ box_play: BoxPlay }>("/api/box-plays", {
      action: "create",
      orderId,
    });
    const reference = String(payload.box_play.opening_reference || "");
    const changed =
      !!flowRef.current?.openingReference &&
      flowRef.current.openingReference !== reference;
    save({
      ...flowRef.current!,
      playId: payload.box_play.id,
      openingReference: reference,
      ...(changed
        ? { buyHash: undefined, finalizeHash: undefined, decisions: undefined }
        : {}),
    });
    // The backend preserves rewards across an expired opening; they are not
    // actionable until the replacement buy transaction has been confirmed.
    if (boxPlayNeedsOpening(payload.box_play)) {
      payload.box_play = { ...payload.box_play, rewards: [], decisions: [] };
    }
    setPlay(payload.box_play);
    if (payload.box_play.status === "completed") {
      save(null);
    }
    return payload.box_play;
  };

  const acceptOrder = async (order: ApiRecord) => {
    const line = asRows(order.items)[0];
    const next =
      flowRef.current ||
      (line
        ? {
            version: 1 as const,
            wallet: address,
            key: crypto.randomUUID(),
            item: catalogFromOrderLine(line),
          }
        : null);
    if (!next) throw new Error("Open your completed payment from Activity");
    save({ ...next, orderId: String(order.id) });
    if (boxItem(next.item)) {
      await beginBox(String(order.id));
    } else {
      save(null);
    }
    void refreshAfterPurchase("Your payment is confirmed and your purchase is saved. Your balance and activity could not refresh. Continue your opening or reload to refresh your account.");
  };

  const confirmBalance = async (candidateHash?: string) => {
    const next = flowRef.current!;
    const base = {
      idempotencyKey: next.key,
      quoteId: next.quote?.id,
      txHash: candidateHash || next.paymentHash,
    };
    setBusy("Confirming your payment…");
    const payload = await retryConfirmation(() => api<ApiRecord>("/api/checkout", {
      ...base,
      action: "authorize",
    }));
    if (payload.order) {
      await acceptOrder(asRecord(payload.order));
      return;
    }
    if (payload.payment_verified !== true)
      throw new Error("DYLI must enable payment receipt checks before this checkout can continue. Your purchase is saved.");
    if (candidateHash) save({ ...next, paymentHash: candidateHash });
    const message = String(asRecord(payload.authorization).message || "");
    if (!message) throw new Error("Payment authorization is unavailable");
    setBusy("Confirming your purchase…");
    const { signature } = await signMessage({ message }, { address });
    setBusy("Confirming your order…");
    const result = await retryConfirmation(() => api<ApiRecord>("/api/checkout", {
      ...base,
      action: "confirm_balance",
      signature,
    }));
    await acceptOrder(asRecord(result.order));
  };

  const payBalance = () =>
    run("Processing payment…", async () => {
      let next = flowRef.current;
      if (!next?.quote || !session)
        throw new Error("Get a current quote first");
      if (!next.paymentHash) {
        if (!runtime?.paymaster)
          throw new Error("DYLI gas sponsorship is not configured yet. No payment was sent.");
        if (next.stripeSessionId || next.orderId)
          throw new Error("Continue your existing purchase");
        if (next.paymentAttempted)
          throw new Error(
            "A wallet payment was started. Recover its transaction from your wallet history before trying another payment.",
          );
        if (!navigator.locks)
          throw new Error(
            "Use a browser with Web Locks support for balance payments",
          );
        const authoritative = await api<ApiRecord>("/api/checkout", {
          action: "read",
          quoteId: next.quote.id,
          idempotencyKey: next.key,
        });
        const quote = asRecord(authoritative.quote);
        const payment = asRecord(authoritative.payment);
        const cents = balancePaymentCents(quote, next.quote.id);
        next = { ...next, quote, payment };
        save(next);
        const latest = await readWallet();
        if (Number(latest.balance.amount) < cents / 100)
          throw new Error(
            "Your balance is too low. Use Card or fund your wallet.",
          );
        const token = String(asRecord(next.payment?.tokens).abstract);
        const recipient = String(asRecord(next.payment?.recipients).abstract);
        if (
          !isAddress(token) ||
          !isAddress(recipient) ||
          token.toLowerCase() !== session.balance.token.toLowerCase()
        )
          throw new Error(
            "Payment instructions do not match your wallet network",
          );
        // An uncertain broadcast must not become a second transfer after a crash.
        next = { ...next, paymentAttempted: true };
        save(next);
        try {
          setBusy("Processing payment…");
          const hash = await send({
            chain: "abstract",
            chain_id: session.balance.chain_id,
            from: address as `0x${string}`,
            to: token,
            value: "0",
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [recipient, BigInt(cents) * BigInt(10000)],
            }),
          }, String(quote.expires_at));
          next = { ...next, paymentHash: hash };
          save(next);
        } catch (failure) {
          const hash = asRecord(failure).transactionHash;
          if (typeof hash === "string" && /^0x[\da-f]{64}$/i.test(hash))
            save({ ...next, paymentHash: hash });
          const code = asRecord(failure).code;
          if (asRecord(failure).broadcastAttempted === false || code === 4001 || code === "ACTION_REJECTED")
            save({ ...next, paymentAttempted: false });
          throw failure;
        }
      }
      await confirmBalance();
    });

  const loadCard = async () => {
      if (!runtime?.paymaster)
        throw new Error("DYLI gas sponsorship must be configured before opening boxes. No card checkout was created.");
      const next = flowRef.current;
      if (
        !next?.quote ||
        next.paymentAttempted ||
        next.paymentHash ||
        next.orderId
      )
        throw new Error("Continue your existing purchase");
      const returnUrl = next.stripeReturnUrl || window.location.href;
      const payload = await api<ApiRecord>("/api/checkout", {
        action: "card",
        idempotencyKey: next.key,
        quoteId: next.quote.id,
        returnUrl,
      });
      const raw = asRecord(payload.checkout);
      // Preserve the identifier even when rendering configuration is missing,
      // so cancellation/recovery targets this checkout, not a second payment.
      if (/^cs_(live|test)_[a-zA-Z0-9]+$/.test(String(raw.stripe_session_id)))
        save({ ...next, stripeSessionId: String(raw.stripe_session_id), stripeReturnUrl: returnUrl,
          stripeUiMode: raw.ui_mode === "embedded" ? "embedded" : "hosted" });
      const checkout = parseCardCheckout(raw);
      if (checkout.mode === "embedded") setCardCheckout(checkout);
      else window.location.assign(checkout.url);
  };

  const payCard = () =>
    run("Preparing secure checkout…", () => loadCard());

  const confirmCard = async (stripeSessionId: string) => {
    const result = await retryConfirmation(() => api<ApiRecord>("/api/checkout/confirm", {
      stripeSessionId,
    }));
    await acceptOrder(asRecord(result.order));
    setCardCheckout(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("session_id");
    url.searchParams.delete("checkout");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  };

  const completeCard = (sessionId: string) => run("Confirming your payment…", async () => {
    if (flowRef.current?.stripeSessionId !== sessionId)
      throw new Error("This checkout does not match your saved purchase");
    // Stripe's browser callback is only a signal; the server checks the actual
    // paid session, amount, customer and mode before an order can be accepted.
    await confirmCard(sessionId);
  });

  const resumeCard = async (): Promise<"order" | "checkout" | null> => {
    let destination: "order" | "checkout" = "order";
    const ok = await run("Loading your checkout…", async () => {
      const next = flowRef.current;
      if (!next?.stripeSessionId || next.orderId) throw new Error("Continue your saved purchase");
      try { await confirmCard(next.stripeSessionId); }
      catch (error) {
        if (next.stripeUiMode !== "embedded" || !unpaidCardError(error)) throw error;
        await loadCard();
        destination = "checkout";
      }
    });
    return ok ? destination : null;
  };

  const resume = (source?: CatalogItem, orderId?: string) =>
    run("Loading your purchase…", async () => {
      const stripeReturn = new URLSearchParams(window.location.search).get(
        "session_id",
      );
      if (stripeReturn && !orderId) return confirmCard(stripeReturn);
      if (orderId) {
        await beginBox(orderId, source);
        return;
      }
      const next = flowRef.current;
      if (!next) return;
      if (next.orderId) await beginBox(next.orderId);
      else if (next.paymentHash) await confirmBalance();
      else if (next.stripeSessionId) await confirmCard(next.stripeSessionId);
      else if (next.paymentAttempted)
        throw new Error(
          "Recover the payment transaction from your wallet history below",
        );
    });

  const recoverPayment = (hash: string) =>
    run("Checking your payment…", async () => {
      const next = flowRef.current;
      if (!next?.paymentAttempted || !/^0x[\da-f]{64}$/i.test(hash))
        throw new Error("Enter the transaction hash from your wallet history");
      // Do not poison saved recovery with an arbitrary hash. Verify the receipt
      // first; a rejected candidate leaves the existing purchase untouched.
      await confirmBalance(hash);
    });

  const cancelCard = () => run("Cancelling checkout…", async () => {
    const next = flowRef.current;
    if (next?.orderId || next?.paymentHash || next?.paymentAttempted)
      throw new Error("Continue your saved purchase. A payment may already have been sent.");
    const returnedSessionId = new URLSearchParams(window.location.search).get("session_id");
    if (returnedSessionId && next?.stripeSessionId && returnedSessionId !== next.stripeSessionId)
      throw new Error("This return belongs to a different checkout. Continue the returned purchase first.");
    const stripeSessionId = returnedSessionId || next?.stripeSessionId;
    if (!stripeSessionId) throw new Error("No card checkout to cancel");
    const result = await api<ApiRecord>("/api/checkout/confirm", { action: "cancel", stripeSessionId });
    if (result.cancelled !== true) throw new Error("Cancellation was not confirmed. Your purchase is saved.");
    save(null);
    setPlay(null);
    setCardCheckout(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("session_id");
    url.searchParams.delete("checkout");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  });

  const openBoxes = () =>
    run("Opening your boxes…", async () => {
      const next = flowRef.current;
      if (!next?.orderId) throw new Error("A paid order is required");
      const fresh = { box_play: await beginBox(next.orderId) };
      if (fresh.box_play.status === "completed") {
        await refreshAfterPurchase("Your opening is complete. Reload to refresh your vault and balance.");
        return;
      }
      let hash = flowRef.current?.buyHash || fresh.box_play.buy_tx_hash;
      if (!hash && fresh.box_play.transaction) {
        try { hash = await send(fresh.box_play.transaction); }
        catch (failure) {
          const pending = asRecord(failure).transactionHash;
          if (typeof pending === "string" && /^0x[\da-f]{64}$/i.test(pending))
            save({ ...flowRef.current!, buyHash: pending });
          throw failure;
        }
        save({ ...flowRef.current!, buyHash: hash });
      }
      if (
        fresh.box_play.rewards.length ||
        fresh.box_play.status === "completed"
      ) {
        setPlay(fresh.box_play);
        return;
      }
      if (!hash) throw new Error("The opening is not ready yet. Please retry.");
      for (let attempt = 0; attempt < 12; attempt++) {
        const result = await api<{
          box_play: BoxPlay;
          ready: boolean;
          restart: boolean;
          retry_after_ms: number;
        }>("/api/box-plays", {
          action: "results",
          playId: fresh.box_play.id,
          txHash: hash,
        });
        setPlay(result.box_play);
        if (result.restart) {
          save({
            ...flowRef.current!,
            buyHash: undefined,
            finalizeHash: undefined,
            decisions: undefined,
          });
          throw new Error(
            "The opening was safely reset. Continue to reopen your paid boxes.",
          );
        }
        if (result.ready) return;
        await delay(Math.max(2500, result.retry_after_ms || 0));
      }
      throw new Error(
        "Your opening is still confirming. Continue shortly; your payment is saved.",
      );
    });

  const choose = (index: number, choice: "claim" | "sell_back") => {
    if (!flowRef.current || !play || busyRef.current || flowRef.current.finalizeHash) return;
    const decisions = [...(flowRef.current.decisions || [])];
    decisions[index] = choice;
    save({ ...flowRef.current, decisions });
  };

  const settle = () =>
    run(settlementSummary(flowRef.current?.decisions || play?.decisions || [], play?.rewards || []).progress, async () => {
      const next = flowRef.current;
      if (!next?.playId || !play) throw new Error("An opening is required");
      let hash = next.finalizeHash || play.finalize_tx_hash;
      if (!hash) {
        const result = await api<{
          box_play: BoxPlay;
          ready: boolean;
          restart: boolean;
          finalize_tx_hash?: string;
        }>("/api/box-plays", {
          action: "decision",
          playId: next.playId,
          decisions: next.decisions,
        });
        setPlay(result.box_play);
        if (result.restart) {
          setPlay({ ...result.box_play, rewards: [], decisions: [] });
          save({ ...next, buyHash: undefined, finalizeHash: undefined, decisions: undefined });
          throw new Error("Continue to reopen your saved purchase.");
        }
        if (!result.ready)
          throw new Error(
            "Your choices are being prepared. Your pulls are saved—continue shortly.",
          );
        try { hash =
          result.finalize_tx_hash ||
          (result.box_play.transaction
            ? await send(result.box_play.transaction)
            : undefined);
        } catch (failure) {
          const pending = asRecord(failure).transactionHash;
          if (typeof pending === "string" && /^0x[\da-f]{64}$/i.test(pending))
            save({ ...next, finalizeHash: pending });
          throw failure;
        }
        if (!hash) throw new Error("Settlement is not ready yet");
        save({ ...next, finalizeHash: hash });
      }
      await retryConfirmation(() => api("/api/box-plays", {
        action: "finalize",
        playId: next.playId,
        txHash: hash,
      }));
      save(null);
      setBusy("Updating your vault and balance…");
      await refreshAfterPurchase("Your choices are confirmed. Reload to refresh your vault and balance.");
      setPlay(null);
    });

  const signOut = () =>
    run("Signing out…", async () => {
      await logout();
      setSession(null);
      setPlay(null);
      setFlow(null);
      flowRef.current = null;
    });
  const clearUnpaid = () => {
    if (!busy && flowRef.current && !receiptRequired(flowRef.current))
      save(null);
  };
  const clearBalanceCheckout = () => {
    const next = flowRef.current;
    if (busyRef.current || !canClearBalanceRecovery(next) ||
        next?.wallet !== address.toLowerCase()) return false;
    try {
      // Retain receipt references for support; archived attempts never auto-resume.
      localStorage.setItem(`${recoveryKey(address)}:cleared:${next.key}`, JSON.stringify(next));
      localStorage.removeItem(recoveryKey(address));
      flowRef.current = null;
      setFlow(null);
      setPlay(null);
      setError("");
      return true;
    } catch {
      setError("Could not clear this checkout. Your recovery details are still saved.");
      return false;
    }
  };
  return {
    ready,
    authenticated,
    login,
    signOut,
    session,
    flow,
    play,
    cardCheckout,
    busy,
    error: error || authError || "",
    setError,
    prepareQuote,
    payBalance,
    payCard,
    completeCard,
    resumeCard,
    resume,
    recoverPayment,
    cancelCard,
    openBoxes,
    choose,
    settle,
    clearUnpaid,
    clearBalanceCheckout,
    refresh,
    readWallet,
    run,
    api,
    send,
    address,
  };
}
