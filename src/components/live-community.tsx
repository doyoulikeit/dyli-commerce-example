"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPublicClient,
  decodeFunctionData,
  erc20Abi,
  erc1155Abi,
  http,
} from "viem";
import { abstract, abstractTestnet } from "viem/chains";
import { Check, LoaderCircle } from "lucide-react";
import { LiveModal, Art } from "./live-catalog";
import {
  CommunityMarket,
  type CommunityApi,
  type CommunityIntent,
} from "./community-market";
import { CommunityTrades, TradeSide } from "./community-trades";
import {
  actionLabel,
  communityPending,
  communityRecovery,
  mergeCommunityRecovery,
  communityStorageKey,
  settleCommunityAction,
  transactionHash,
  type CommunityAction,
  type CommunityRecovery,
} from "@/lib/community";
import { abstractRpcUrl } from "@/lib/abstract-rpc.mjs";
import { asRecord, asRows, assetImage, usd } from "@/lib/live-commerce";
import type {
  ApiRecord,
  SessionResponse,
  TransactionInstruction,
} from "@/lib/types";
import "./community.css";

type Props = {
  view: string;
  session: SessionResponse | null;
  api: CommunityApi;
  marketplace: ApiRecord;
  trading: ApiRecord;
  intent: CommunityIntent | null;
  clearIntent: () => void;
  login: () => void;
  refresh: () => Promise<void>;
  send: (
    tx: TransactionInstruction,
    expiresAt?: string,
  ) => Promise<`0x${string}`>;
};
export function LiveCommunity({
  view,
  session,
  api,
  marketplace,
  trading,
  intent,
  clearIntent,
  login,
  refresh,
  send,
}: Props) {
  const wallet = session?.identity.walletAddress.toLowerCase() || "";
  const [revision, setRevision] = useState(0),
    [saved, setSaved] = useState<CommunityRecovery | null>(null),
    [action, setAction] = useState<CommunityAction | null>(null);
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [restoring, setRestoring] = useState(Boolean(wallet)),
    [recoveryHash, setRecoveryHash] = useState(""),
    [refreshError, setRefreshError] = useState(false);
  const working = useRef(false),
    restoringRef = useRef(Boolean(wallet)),
    savedRef = useRef<CommunityRecovery | null>(null);
  const persist = useCallback(
    (value: CommunityRecovery | null) => {
      savedRef.current = value;
      setSaved(value);
      if (value)
        localStorage.setItem(
          communityStorageKey(wallet),
          JSON.stringify(value),
        );
      else localStorage.removeItem(communityStorageKey(wallet));
    },
    [wallet],
  );
  const getAction = useCallback(
    async (id: string) =>
      (
        await api<{ action: CommunityAction }>("/api/community", {
          action: "get",
          id,
        })
      ).action,
    [api],
  );
  useEffect(() => {
    if (!wallet) return;
    let active = true;
    const restore = async () => {
      setRestoring(true);
      restoringRef.current = true;
      try {
        const raw = localStorage.getItem(communityStorageKey(wallet));
        let recovery = communityRecovery(raw, wallet);
        if (raw && !recovery)
          throw new Error(
            "Your saved marketplace action could not be read. Check wallet history before starting another.",
          );
        let found: CommunityAction | null = null;
        if (recovery?.id) found = await getAction(recovery.id);
        else if (!recovery && (marketplace.ready || trading.ready)) {
          const history = await api<{ actions: CommunityAction[] }>(
            "/api/community",
            { action: "history" },
          );
          found =
            history.actions.find((row) =>
              ["processing", "requires_action"].includes(row.status),
            ) || null;
          if (found)
            recovery = {
              wallet,
              key: crypto.randomUUID(),
              id: found.id,
              input: found.input,
              attempted: true,
              ...(found.tx_hash ? { hash: found.tx_hash } : {}),
            };
        }
        if (!active) return;
        if (found?.status === "completed") {
          persist(null);
          return;
        }
        persist(recovery);
        setAction(found);
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not restore your marketplace activity",
          );
      } finally {
        if (active) {
          restoringRef.current = false;
          setRestoring(false);
        }
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, [api, getAction, wallet, persist, marketplace.ready, trading.ready]);
  const run = async (label: string, callback: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(label);
    setError("");
    try {
      if (!navigator.locks)
        throw new Error("Please use an up-to-date browser for wallet actions.");
      await navigator.locks.request(
        `dyli-live:${wallet}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new Error(
              "Another wallet action is open in another tab. Finish it first.",
            );
          const raw = localStorage.getItem(communityStorageKey(wallet));
          const stored = communityRecovery(raw, wallet);
          if (raw && !stored)
            throw new Error(
              "Check your wallet history before starting another action.",
            );
          const latest = mergeCommunityRecovery(stored, savedRef.current);
          savedRef.current = latest;
          setSaved(latest);
          await callback();
        },
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Please try again");
    } finally {
      working.current = false;
      setBusy("");
    }
  };
  const prepare = (input: ApiRecord, label: string) => {
    if (restoringRef.current || working.current) return;
    setOpen(true);
    setTitle(label);
    setRefreshError(false);
    void run("Checking the details…", async () => {
      const prior = savedRef.current;
      if (prior) {
        if (prior.id) setAction(await getAction(prior.id));
        throw new Error(
          "Finish or dismiss your saved action before starting another.",
        );
      }
      const value: CommunityRecovery = {
        wallet,
        key: crypto.randomUUID(),
        input,
      };
      persist(value);
      setAction(null);
      const result = await api<{ action: CommunityAction }>("/api/community", {
        action: "prepare",
        input,
        idempotencyKey: value.key,
      });
      persist({ ...value, id: result.action.id });
      setAction(result.action);
    });
  };
  const continueAction = () =>
    void run("Checking your action…", async () => {
      let recovery = savedRef.current;
      if (!session || !recovery)
        throw new Error("Reload your account to continue.");
      const current = recovery.id
        ? await getAction(recovery.id)
        : (
            await api<{ action: CommunityAction }>("/api/community", {
              action: "prepare",
              input: recovery.input,
              idempotencyKey: recovery.key,
            })
          ).action;
      recovery = { ...recovery, id: current.id };
      if (recoveryHash.trim()) {
        if (!transactionHash(recoveryHash.trim()))
          throw new Error("Enter a valid transaction reference.");
        if (
          current.tx_hash &&
          current.tx_hash.toLowerCase() !== recoveryHash.trim().toLowerCase()
        )
          throw new Error(
            "This action already has a different transaction reference.",
          );
        recovery =
          recovery.approval?.attempted &&
          !recovery.attempted &&
          !current.tx_hash
            ? {
                ...recovery,
                approval: { ...recovery.approval, hash: recoveryHash.trim() },
              }
            : { ...recovery, attempted: true, hash: recoveryHash.trim() };
      }
      persist(recovery);
      setAction(current);
      const chain =
        session.balance.chain_id === 2741 ? abstract : abstractTestnet;
      const client = createPublicClient({
        chain,
        transport: http(
          abstractRpcUrl(chain.id, {
            url: process.env.NEXT_PUBLIC_ABSTRACT_RPC_URL || "",
            alchemyKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "",
          }),
        ),
      });
      const result = await settleCommunityAction({
        action: current,
        recovery,
        save: persist,
        send,
        wait: (hash) =>
          client.waitForTransactionReceipt({ hash, timeout: 60000 }),
        approved: async (tx) => {
          const decoded = decodeFunctionData({
            abi: [...erc20Abi, ...erc1155Abi],
            data: tx.data,
          });
          if (decoded.functionName === "setApprovalForAll")
            return client.readContract({
              address: tx.to,
              abi: erc1155Abi,
              functionName: "isApprovedForAll",
              args: [wallet as `0x${string}`, decoded.args[0]],
            });
          if (decoded.functionName === "approve")
            return (
              (await client.readContract({
                address: tx.to,
                abi: erc20Abi,
                functionName: "allowance",
                args: [wallet as `0x${string}`, decoded.args[0]],
              })) >= decoded.args[1]
            );
          throw new Error("Unsupported wallet permission");
        },
        confirm: async (hash) =>
          (
            await api<{ action: CommunityAction }>("/api/community", {
              action: "confirm",
              id: current.id,
              txHash: hash,
            })
          ).action,
        progress: setBusy,
      });
      setAction(result);
      persist(null);
      setRevision((value) => value + 1);
      setRecoveryHash("");
      try {
        await refresh();
      } catch {
        setRefreshError(true);
      }
    });
  const reset = () =>
    void run("Refreshing…", async () => {
      const recovery = savedRef.current;
      if (communityPending(recovery))
        throw new Error("Check the pending transaction before starting again.");
      if (recovery?.id) {
        const current = await getAction(recovery.id);
        if (
          current.tx_hash ||
          ["processing", "requires_action"].includes(current.status)
        ) {
          setAction(current);
          throw new Error("Confirm your saved transaction first.");
        }
      }
      persist(null);
      setAction(null);
      setOpen(false);
      setRecoveryHash("");
    });
  const props = {
    api,
    wallet,
    holdings: asRows(session?.holdings.items),
    revision,
    login,
    intent,
    clearIntent,
    submit: prepare,
  };
  const complete = action?.status === "completed",
    pending = communityPending(saved) || Boolean(action?.tx_hash);
  const preview = asRecord(action?.input.preview),
    product = asRecord(preview.product);
  return (
    <>
      {(saved || (error && !open)) && (
        <div className="cm-resume" role="status">
          <p>
            {error && !open
              ? error
              : "You have a saved marketplace or trade action."}
          </p>
          <button
            className="lc-secondary"
            disabled={restoring || !!busy}
            onClick={() => setOpen(true)}
          >
            Review action
          </button>
        </div>
      )}
      {restoring && ["shop", "trades"].includes(view) && (
        <p className="cm-note" role="status">
          Checking saved activity…
        </p>
      )}
      {view === "shop" && marketplace.ready === true && (
        <CommunityMarket
          {...props}
          includeDyli={marketplace.include_dyli === true}
        />
      )}
      {view === "trades" && trading.ready === true && (
        <CommunityTrades
          {...props}
          includeDyli={trading.include_dyli === true}
        />
      )}
      {open && (
        <LiveModal
          title={
            complete
              ? "All set"
              : actionLabel(action?.kind || String(saved?.input.kind || ""))
          }
          onClose={() => setOpen(false)}
          dismissible={!busy}
          className="cm-review-modal"
        >
          <div className="cm-form">
            <h2>
              {product.name
                ? String(product.name)
                : action?.input.collector
                  ? `Trade with @${action.input.collector}`
                  : title || "Your saved action"}
            </h2>
            {complete ? (
              <div className="cm-complete">
                <Check />
                <h3>
                  {action.kind === "list"
                    ? "Your listing is live"
                    : action.kind === "offer"
                      ? "Your offer is live"
                      : action.kind === "trade"
                        ? "Trade sent"
                        : action.kind.startsWith("cancel")
                          ? "Canceled"
                          : "Confirmed"}
                </h3>
                <p>
                  {["list", "offer"].includes(action.kind)
                    ? "It’s also visible on DYLI."
                    : action.kind === "trade"
                      ? "We’ll keep this trade in your sent history while you wait for a reply."
                      : "Your activity has been recorded."}
                </p>
                {refreshError && (
                  <p className="cm-note">
                    The transaction is complete. Your vault is taking a moment
                    to refresh.
                  </p>
                )}
                <button
                  className="lc-primary"
                  onClick={() => {
                    setOpen(false);
                    setAction(null);
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {product.name && (
                  <div className="cm-review-art">
                    <Art
                      src={assetImage(product)}
                      name={String(product.name)}
                    />
                  </div>
                )}
                {action && !action.kind.includes("trade") && !action.kind.startsWith("cancel") && (
                  <div className="cm-review-total">
                    <span>
                      {action.kind === "accept_offer"
                        ? "Offer amount"
                        : action.kind === "buy"
                          ? "Total"
                          : "Price per item"}
                    </span>
                    <strong>
                      {usd(
                        Number(
                          action.input.expected_amount ||
                            action.input.unit_amount ||
                            0,
                        ) / 1e6,
                      )}
                    </strong>
                    <small>
                      {Number(action.input.quantity || 1)} item(s) · Abstract
                      USDC
                    </small>
                  </div>
                )}
                {action && ["trade", "accept_trade"].includes(action.kind) && (
                  <div className="cm-trade-sides">
                    <TradeSide
                      title="You give"
                      items={asRows(preview.give)}
                      cash={Number(action.input.give_usdc || 0) / 1e6}
                    />
                    <span>→</span>
                    <TradeSide
                      title="You receive"
                      items={asRows(preview.receive)}
                      cash={Number(action.input.receive_usdc || 0) / 1e6}
                    />
                  </div>
                )}
                {!!busy && (
                  <p className="cm-progress" role="status">
                    <LoaderCircle /> {busy}
                  </p>
                )}
                {error && (
                  <p className="cm-error" role="alert">
                    {error}
                  </p>
                )}
                {pending && !busy && (
                  <>
                    <p className="cm-note">
                      We saved this action so it can be checked without sending
                      it again.
                    </p>
                    {!action?.tx_hash &&
                      !saved?.hash &&
                      !saved?.approval?.hash && (
                        <label>
                          Transaction reference
                          <input
                            placeholder="0x…"
                            value={recoveryHash}
                            onChange={(event) =>
                              setRecoveryHash(event.target.value)
                            }
                          />
                        </label>
                      )}
                  </>
                )}
                {!busy && (
                  <div className="cm-actions">
                    <button
                      className="lc-primary"
                      disabled={
                        restoring ||
                        !saved ||
                        (!pending && action?.status === "expired")
                      }
                      onClick={continueAction}
                    >
                      {pending
                        ? "Check confirmation"
                        : action
                          ? actionLabel(action.kind)
                          : "Retry review"}
                    </button>
                    {!pending && (
                      <button className="lc-secondary" onClick={reset}>
                        Dismiss review
                      </button>
                    )}
                  </div>
                )}
                <p className="cm-note">
                  {action?.kind === "accept_offer"
                    ? "DYLI’s standard marketplace fee applies. The contract determines your net proceeds."
                    : "Your wallet will ask you to confirm before anything is sent."}
                </p>
              </>
            )}
          </div>
        </LiveModal>
      )}
    </>
  );
}
