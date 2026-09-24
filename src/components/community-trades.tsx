"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Plus, Search } from "lucide-react";
import { Art, LiveModal } from "./live-catalog";
import { asRecord, asRows, assetImage, usd } from "@/lib/live-commerce";
import type { ApiRecord } from "@/lib/types";
import type { MarketProps } from "./community-market";

export function CommunityTrades({
  api,
  wallet,
  holdings,
  includeDyli,
  revision,
  login,
  intent,
  clearIntent,
  submit,
}: MarketProps) {
  const [rows, setRows] = useState<ApiRecord[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [view, setView] = useState("incoming"),
    [composing, setComposing] = useState(false),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [declining, setDeclining] = useState<ApiRecord | null>(null),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!wallet) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await api<ApiRecord>("/api/community", {
          action: "trades",
          view,
          offset,
        });
        if (active) {
          setRows(asRows(data.trades));
          setNext(asRecord(data.pagination).next_offset as number | null);
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load trades",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [api, wallet, revision, offset, reload, view]);
  const filtered = rows.filter((row) =>
    view === "history"
      ? row.status !== "open"
      : row.status === "open" &&
        row.role === (view === "incoming" ? "receiver" : "sender"),
  );
  return (
    <section className="cm-surface">
      <div className="cm-heading">
        <div>
          <span className="cm-eyebrow">Find your next trade</span>
          <h1>Trades</h1>
          <p>
            {includeDyli
              ? "Swap collectibles with your community and collectors on DYLI."
              : "Swap collectibles with others in your community."}
          </p>
        </div>
        <button
          className="lc-primary"
          onClick={() => (wallet ? setComposing(true) : login())}
        >
          <Plus size={18} /> New trade
        </button>
      </div>
      <div className="lc-toggle cm-tabs">
        {[
          ["incoming", "Incoming"],
          ["outgoing", "Sent"],
          ["history", "History"],
        ].map(([key, label]) => (
          <button
            aria-pressed={view === key}
            key={key}
            onClick={() => { setView(key); setOffset(0); }}
          >
            {label}
          </button>
        ))}
      </div>
      {!wallet ? (
        <div className="cm-empty">
          <ArrowLeftRight />
          <h2>A better way to collect</h2>
          <p>Sign in to send a trade or respond to one.</p>
          <button className="lc-primary" onClick={login}>
            Sign in
          </button>
        </div>
      ) : error ? (
        <div className="cm-empty" role="alert">
          <p>{error}</p>
          <button
            className="lc-secondary"
            onClick={() => setReload((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <div
          className="cm-skeleton cm-trade-skeleton"
          aria-label="Loading trades"
          aria-busy="true"
        />
      ) : filtered.length ? (
        <div className="cm-trades">
          {filtered.map((trade) => {
            const incoming = trade.role === "receiver",
              collector = asRecord(incoming ? trade.from : trade.to);
            const give = asRows(incoming ? trade.to_items : trade.from_items),
              receive = asRows(incoming ? trade.from_items : trade.to_items);
            const giveCash = Number(incoming ? trade.to_usdc : trade.from_usdc),
              receiveCash = Number(incoming ? trade.from_usdc : trade.to_usdc);
            const supported = !trade.has_diamonds && trade.receipt_available;
            return (
              <article key={String(trade.id)} className="cm-trade-card">
                <header>
                  <div>
                    <strong>
                      @{String(collector.username || "collector")}
                    </strong>
                    <small>
                      {new Date(String(trade.created_at)).toLocaleDateString()}
                    </small>
                  </div>
                  <span className="cm-status">
                    {trade.status === "open"
                      ? incoming
                        ? "Your turn"
                        : "Awaiting reply"
                      : String(trade.status)}
                  </span>
                </header>
                <div className="cm-trade-sides">
                  <TradeSide title="You give" items={give} cash={giveCash} />
                  <ArrowLeftRight aria-hidden="true" />
                  <TradeSide
                    title="You receive"
                    items={receive}
                    cash={receiveCash}
                  />
                </div>
                {trade.status === "open" && (
                  <footer>
                    {incoming ? (
                      supported ? (
                        <button
                          className="lc-primary"
                          onClick={() =>
                            submit(
                              {
                                kind: "accept_trade",
                                trade_id: String(trade.id),
                              },
                              `Trade with @${collector.username}`,
                            )
                          }
                        >
                          Review & accept
                        </button>
                      ) : (
                        <p className="cm-note">
                          {trade.has_diamonds
                            ? "Manage this diamond trade on DYLI."
                            : "Ask the sender to recreate this older trade before accepting here."}
                        </p>
                      )
                    ) : (
                      <button
                        className="lc-secondary"
                        onClick={() =>
                          submit(
                            {
                              kind: "cancel_trade",
                              trade_id: String(trade.id),
                            },
                            `Trade with @${collector.username}`,
                          )
                        }
                      >
                        Cancel trade
                      </button>
                    )}
                    {incoming && (
                      <button
                        className="lc-secondary"
                        onClick={() => setDeclining(trade)}
                      >
                        Decline
                      </button>
                    )}
                    <a
                      href={`https://www.dyli.io/trade`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on DYLI ↗
                    </a>
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="cm-empty">
          <ArrowLeftRight />
          <h2>
            {view === "incoming"
              ? "No trades waiting"
              : view === "outgoing"
                ? "Start a conversation"
                : "Your swaps, all here"}
          </h2>
          <p>
            {view === "incoming"
              ? "Trades sent to you will appear here."
              : view === "outgoing"
                ? "Find a collector, choose your items, and send a trade."
                : "Completed and canceled trades will appear here."}
          </p>
        </div>
      )}
      {(offset > 0 || next !== null) && (
        <div className="cm-pagination">
          <button
            className="lc-secondary"
            disabled={!offset || loading}
            onClick={() => setOffset(Math.max(0, offset - 25))}
          >
            Previous
          </button>
          <span>Page {Math.floor(offset / 25) + 1}</span>
          <button
            className="lc-secondary"
            disabled={next === null || loading}
            onClick={() => setOffset(next!)}
          >
            Next
          </button>
        </div>
      )}
      {(composing || intent?.kind === "trade") && (
        <TradeComposer
          api={api}
          wallet={wallet}
          holdings={holdings}
          initialItem={intent?.item}
          onClose={() => {
            setComposing(false);
            clearIntent();
          }}
          onSubmit={(input, title) => {
            setComposing(false);
            clearIntent();
            submit(input, title);
          }}
        />
      )}
      {declining && (
        <LiveModal
          title="Decline trade?"
          onClose={() => setDeclining(null)}
          dismissible={!saving}
        >
          <div className="cm-form">
            <p>
              No items or cash will move. The sender will see that you declined.
            </p>
            <button
              className="lc-primary"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setError("");
                try {
                  await api("/api/community", {
                    action: "decline",
                    tradeId: String(declining.id),
                  });
                  setDeclining(null);
                  setReload((value) => value + 1);
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Could not decline the trade",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Updating…" : "Decline trade"}
            </button>
            {error && (
              <p className="cm-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </LiveModal>
      )}
    </section>
  );
}

export function TradeSide({
  title,
  items,
  cash,
}: {
  title: string;
  items: ApiRecord[];
  cash: number;
}) {
  return (
    <div className="cm-trade-side">
      <span className="cm-eyebrow">{title}</span>
      <div>
        {items.map((item) => (
          <div className="cm-trade-item" key={String(item.token_id)}>
            <Art
              src={assetImage(item)}
              name={String(item.name || "Collectible")}
            />
            <span>
              {String(item.name || `Collectible #${item.token_id}`)}
              <small>×{String(item.quantity || 1)}</small>
            </span>
          </div>
        ))}
        {cash > 0 && (
          <strong className="cm-trade-cash">
            {usd(cash)} <small>USDC</small>
          </strong>
        )}
      </div>
    </div>
  );
}
function TradeComposer({
  api,
  wallet,
  holdings,
  initialItem,
  onClose,
  onSubmit,
}: {
  api: MarketProps["api"];
  wallet: string;
  holdings: ApiRecord[];
  initialItem?: ApiRecord;
  onClose: () => void;
  onSubmit: MarketProps["submit"];
}) {
  const [query, setQuery] = useState(""),
    [collectors, setCollectors] = useState<ApiRecord[]>([]),
    [collector, setCollector] = useState<ApiRecord | null>(null);
  const [theirItems, setTheirItems] = useState<ApiRecord[]>([]),
    [loading, setLoading] = useState(false),
    [searching, setSearching] = useState(false),
    [error, setError] = useState("");
  const [give, setGive] = useState<Record<string, number>>(
      initialItem ? { [String(initialItem.token_id)]: 1 } : {},
    ),
    [receive, setReceive] = useState<Record<string, number>>({});
  const [giveCash, setGiveCash] = useState(""),
    [receiveCash, setReceiveCash] = useState(""),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false);
  useEffect(() => {
    if (collector || query.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const result = await api<ApiRecord>("/api/community", {
          action: "collectors",
          q: query.trim(),
        });
        if (active)
          setCollectors(
            asRows(result.collectors).filter(
              (value) =>
                String(value.wallet).toLowerCase() !== wallet.toLowerCase(),
            ),
          );
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not find collectors",
          );
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, wallet, query, collector]);
  useEffect(() => {
    if (!collector) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await api<ApiRecord>("/api/community", {
          action: "holdings",
          collector: collector.username,
          page,
        });
        if (active) {
          setTheirItems((current) =>
            page === 1
              ? asRows(result.items)
              : [...current, ...asRows(result.items)],
          );
          setMore(asRecord(result.pagination).has_more === true);
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load this vault",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [api, collector, page]);
  const picker = (
    items: ApiRecord[],
    selected: Record<string, number>,
    change: (value: Record<string, number>) => void,
  ) => (
    <div className="cm-picker">
      {items.map((item) => {
        const id = String(item.token_id),
          qty = selected[id] || 0;
        return (
          <div className={`cm-pick ${qty ? "is-selected" : ""}`} key={id}>
            <button
              type="button"
              aria-pressed={qty > 0}
              onClick={() => {
                const next = { ...selected };
                if (qty) delete next[id];
                else next[id] = 1;
                change(next);
              }}
            >
              <Art src={assetImage(item)} name={String(item.name)} />
              <span>{String(item.name)}</span>
              <small>
                {qty ? "Selected" : `${Number(item.balance || 1)} in vault`}
              </small>
            </button>
            {qty > 0 && Number(item.balance) > 1 && (
              <label>
                Qty
                <input
                  aria-label={`Quantity of ${item.name}`}
                  type="number"
                  min={1}
                  max={Math.min(20, Number(item.balance))}
                  value={qty}
                  onChange={(event) =>
                    change({
                      ...selected,
                      [id]: Math.max(
                        1,
                        Math.min(
                          20,
                          Number(item.balance),
                          Number(event.target.value) || 1,
                        ),
                      ),
                    })
                  }
                />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
  return (
    <LiveModal
      title="Build a trade"
      onClose={onClose}
      className="cm-trade-modal"
    >
      <form
        className="cm-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          if (!collector) return;
          const units = (value: string) => {
            if (!value.trim()) return "0";
            if (!/^\d+(\.\d{1,2})?$/.test(value))
              throw new Error("Use dollars and cents for the cash amount.");
            const [whole, fraction = ""] = value.split(".");
            return String(
              BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, "0")),
            );
          };
          try {
            const give_usdc = units(giveCash),
              receive_usdc = units(receiveCash);
            if (
              (!Object.keys(give).length && give_usdc === "0") ||
              (!Object.keys(receive).length && receive_usdc === "0")
            )
              throw new Error("Add an item or cash to each side.");
            if (give_usdc !== "0" && receive_usdc !== "0")
              throw new Error("Add the cash difference to one side only.");
            onSubmit(
              {
                kind: "trade",
                collector: collector.username,
                give: Object.entries(give).map(([token_id, quantity]) => ({
                  token_id,
                  quantity,
                })),
                receive: Object.entries(receive).map(
                  ([token_id, quantity]) => ({ token_id, quantity }),
                ),
                give_usdc,
                receive_usdc,
              },
              `Trade with @${collector.username}`,
            );
          } catch (failure) {
            setError(
              failure instanceof Error ? failure.message : "Check your trade",
            );
          }
        }}
      >
        {!collector ? (
          <>
            <label className="cm-search">
              <Search size={18} />
              <input
                autoFocus
                aria-label="Collector username"
                placeholder="Search a collector’s username"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCollectors([]);
                }}
              />
            </label>
            <p className="cm-note">
              Search by username, not an email or wallet address.
            </p>
            <div className="cm-collectors">
              {query.length >= 2 &&
                collectors.map((value) => (
                  <button
                    type="button"
                    key={String(value.username)}
                    onClick={() => setCollector(value)}
                  >
                    <span className="cm-avatar">
                      {String(value.username).charAt(0).toUpperCase()}
                    </span>
                    <strong>@{String(value.username)}</strong>
                    <span>View vault →</span>
                  </button>
                ))}
            </div>
            {searching ? (
              <p role="status">Finding collectors…</p>
            ) : (
              query.length >= 2 &&
              !collectors.length && (
                <p>No matching collectors in this community.</p>
              )
            )}
          </>
        ) : (
          <>
            <div className="cm-collector-selected">
              <strong>Trading with @{String(collector.username)}</strong>
              <button
                type="button"
                onClick={() => {
                  setCollector(null);
                  setReceive({});
                  setTheirItems([]);
                  setPage(1);
                }}
              >
                Change
              </button>
            </div>
            <div className="cm-compose-sides">
              <section>
                <h3>You give</h3>
                {holdings.length ? (
                  picker(holdings, give, setGive)
                ) : (
                  <p className="cm-note">
                    Your vault is empty. You can offer cash instead.
                  </p>
                )}
                <label>
                  Cash you add
                  <div className="cm-money">
                    <span>$</span>
                    <input
                      inputMode="decimal"
                      placeholder="0.00"
                      value={giveCash}
                      onChange={(event) => setGiveCash(event.target.value)}
                    />
                  </div>
                </label>
              </section>
              <section>
                <h3>You receive</h3>
                {picker(theirItems, receive, setReceive)}
                {loading ? (
                  <p role="status">Loading their vault…</p>
                ) : more ? (
                  <button
                    type="button"
                    className="lc-secondary"
                    onClick={() => setPage((value) => value + 1)}
                  >
                    More collectibles
                  </button>
                ) : (
                  !theirItems.length && (
                    <p className="cm-note">No available collectibles.</p>
                  )
                )}
                <label>
                  Cash you request
                  <div className="cm-money">
                    <span>$</span>
                    <input
                      inputMode="decimal"
                      placeholder="0.00"
                      value={receiveCash}
                      onChange={(event) => setReceiveCash(event.target.value)}
                    />
                  </div>
                </label>
              </section>
            </div>
            <p className="cm-note">
              Nothing exchanges until the other collector accepts. Keep the
              items and cash in your wallet while the trade is open.
            </p>
            <button className="lc-primary" disabled={loading}>
              Review trade
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="cm-error">
            {error}
          </p>
        )}
      </form>
    </LiveModal>
  );
}
