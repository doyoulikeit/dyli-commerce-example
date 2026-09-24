"use client";

import { useEffect, useState } from "react";
import { Plus, Search, ShoppingBag } from "lucide-react";
import { Art, LiveModal } from "./live-catalog";
import { asRecord, asRows, assetImage, usd } from "@/lib/live-commerce";
import type { ApiRecord } from "@/lib/types";
import { MarketCard, MarketSkeleton, publicMarket } from "./market-cards";
import { MarketFilterSidebar, MarketFilterButton, MarketSort, emptyMarketFilters, type MarketFiltersValue } from "./market-filters";

export type CommunityApi = <T>(path: string, body?: ApiRecord) => Promise<T>;
export type CommunityIntent = {
  kind: "list" | "offer" | "trade" | "inspect";
  item?: ApiRecord;
};
export type MarketProps = {
  api: CommunityApi;
  wallet: string;
  holdings: ApiRecord[];
  includeDyli: boolean;
  revision: number;
  login: () => void;
  intent: CommunityIntent | null;
  clearIntent: () => void;
  submit: (input: ApiRecord, title: string) => void;
};
export function CommunityMarket({
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
  const [view, setView] = useState("listing"),
    [mine, setMine] = useState(false),
    [query, setQuery] = useState("");
  const [items, setItems] = useState<ApiRecord[]>([]),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<ApiRecord | null>(null);
  const [filters, setFilters] = useState(emptyMarketFilters), [facets, setFacets] = useState<ApiRecord>({});
  const [retry, setRetry] = useState(0);
  const detail = intent?.kind === "inspect" ? intent.item : selected;
  const changeFilters = (value: MarketFiltersValue) => { setFilters(value); setOffset(0); };
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const data = wallet
          ? await api<ApiRecord>("/api/community", {
              action: "market",
              kind: view,
              mine,
              q: query,
              offset,
              ...filters,
            })
          : await publicMarket({ kind: view, q: query, offset: String(offset), ...filters }, controller.signal);
        if (!active) return;
        setItems(asRows(data.items));
        setNext(asRecord(data.pagination).next_offset as number | null);
        setFacets(asRecord(data.facets));
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load the marketplace",
          );
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, wallet, view, mine, query, offset, revision, filters, retry]);
  const act = (input: ApiRecord, title: string) => {
    if (!wallet) {
      login();
      return;
    }
    setSelected(null);
    clearIntent();
    submit(input, title);
  };
  return (
    <section className="cm-surface">
      <div className="cm-heading">
        <div>
          <h1>Marketplace</h1>
          <p>
            {includeDyli
              ? "Discover listings and offers from collectors across DYLI."
              : "Collectibles listed by your community."}
          </p>
        </div>
        <button
          className="lc-primary"
          onClick={() => (wallet ? setSelected({ compose: "list" }) : login())}
        >
          <Plus size={18} /> List an item
        </button>
      </div>
      <div className="cm-toolbar">
        <div className="lc-toggle">
          {[
            ["listing", "For sale"],
            ["offer", "Offers"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={view === key}
              onClick={() => {
                setView(key);
                setOffset(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="cm-search">
          <Search size={18} />
          <input
            aria-label="Search marketplace"
            placeholder="Find a collectible"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOffset(0);
            }}
          />
        </label>
        {wallet && (
          <label className="cm-check">
            <input
              type="checkbox"
              checked={mine}
              onChange={(event) => {
                setMine(event.target.checked);
                setOffset(0);
              }}
            />{" "}
            {view === "listing" ? "My listings" : "My offers"}
          </label>
        )}
        <div className="cm-sort-desktop"><MarketSort value={filters.sort} onChange={sort => changeFilters({ ...filters, sort })} /></div>
      </div>
      <div className="cm-filter-bar">
        <MarketFilterButton value={filters} facets={facets} onChange={changeFilters} />
        <MarketSort value={filters.sort} onChange={sort => changeFilters({ ...filters, sort })} />
      </div>
      <div className="cm-market-layout">
      <MarketFilterSidebar value={filters} facets={facets} onChange={changeFilters} />
      <div className="cm-market-results">
      {error ? (
        <div className="cm-empty" role="alert">
          <p>{error}</p>
          <button
            className="lc-secondary"
            onClick={() => {
              setOffset(0);
              setRetry(value => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <MarketSkeleton />
      ) : items.length ? (
        <div className="cm-grid">
          {items.map(item => <MarketCard key={`${view}:${item.order_id}`} item={item} wallet={wallet} onClick={() => setSelected(item)} />)}
        </div>
      ) : (
        <div className="cm-empty">
          <ShoppingBag />
          <h2>{mine ? "Nothing open yet" : "Room for your next find"}</h2>
          <p>
            {mine
              ? "Your active listings and offers will appear here."
              : "There are no matching orders right now. List something from your vault to get started."}
          </p>
        </div>
      )}
      {!error && (offset > 0 || next !== null) && (
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
      </div>
      </div>
      {detail && !detail.compose && (
        <MarketDetail
          item={detail}
          wallet={wallet}
          holdings={holdings}
          api={api}
          onClose={() => { setSelected(null); clearIntent(); }}
          onOffer={(item) => {
            if (!wallet) return login();
            clearIntent();
            setSelected({ compose: "offer", ...item });
          }}
          act={act}
        />
      )}
      {(selected?.compose || intent?.kind === "list" || intent?.kind === "offer") && (
        <MarketComposer
          kind={(intent?.kind || selected?.compose) as "list" | "offer"}
          item={intent?.item || (selected?.token_id ? selected : undefined)}
          holdings={holdings}
          onClose={() => {
            setSelected(null);
            clearIntent();
          }}
          onSubmit={(input, title) => {
            setSelected(null);
            clearIntent();
            act(input, title);
          }}
        />
      )}
    </section>
  );
}

function MarketDetail({
  item,
  wallet,
  holdings,
  api,
  onClose,
  onOffer,
  act,
}: {
  item: ApiRecord;
  wallet: string;
  holdings: ApiRecord[];
  api: CommunityApi;
  onClose: () => void;
  onOffer: (item: ApiRecord) => void;
  act: (input: ApiRecord, title: string) => void;
}) {
  const product = asRecord(item.product),
    name = String(product.name),
    token = String(item.token_id);
  const [quantity, setQuantity] = useState(1),
    [depth, setDepth] = useState<ApiRecord[]>([]),
    [depthError, setDepthError] = useState("");
  const owned = String(item.maker).toLowerCase() === wallet.toLowerCase(),
    isOffer = item.kind === "offer";
  const inVault = holdings.some(
    (value) => String(value.token_id) === token && Number(value.balance) > 0,
  );
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const kind = isOffer ? "listing" : "offer";
        const data = wallet
          ? await api<ApiRecord>("/api/community", {
              action: "market",
              tokenId: token,
              kind,
            })
          : await fetch(`/api/community?kind=${kind}&tokenId=${token}`).then(
              async (response) => {
                if (!response.ok) throw new Error();
                return response.json();
              },
            );
        if (active) setDepth(asRows(data.items));
      } catch {
        if (active)
          setDepthError(
            "Other orders could not load. Reopen this item to retry.",
          );
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [api, wallet, token, isOffer]);
  const terms = (order: ApiRecord, count = 1) => ({
    kind: order.kind === "offer" ? "accept_offer" : "buy",
    token_id: token,
    order_id: String(order.order_id),
    quantity: count,
    expected_amount: String(BigInt(String(order.unit_amount)) * BigInt(count)),
  });
  return (
    <LiveModal
      title={isOffer ? "Collector offer" : "Collectible"}
      onClose={onClose}
      className="cm-detail-modal"
    >
      <div className="cm-detail">
        <div className="cm-detail-art">
          <Art src={assetImage(product)} name={name} />
        </div>
        <div className="cm-detail-copy">
          <span className="cm-eyebrow">
            {String(product.brand || "Collectible")}
          </span>
          <h2>{name}</h2>
          <p>
            {isOffer ? "Offer from @" : "Listed by @"}
            {String(asRecord(item.collector).username || "collector")}
          </p>
          <strong className="cm-big-price">{usd(Number(item.price))}</strong>
          <small>
            Abstract USDC · {isOffer ? "Offer per item" : "Price per item"}
          </small>
          {!owned && !isOffer && Number(item.quantity) > 1 && (
            <label>
              Quantity
              <input
                type="number"
                min={1}
                max={Math.min(20, Number(item.quantity))}
                value={quantity}
                onChange={(event) =>
                  setQuantity(
                    Math.max(
                      1,
                      Math.min(
                        20,
                        Number(item.quantity),
                        Number(event.target.value) || 1,
                      ),
                    ),
                  )
                }
              />
            </label>
          )}
          <div className="cm-actions">
            {owned ? (
              <button
                className="lc-secondary"
                onClick={() =>
                  act(
                    {
                      kind: isOffer ? "cancel_offer" : "cancel_listing",
                      token_id: token,
                      order_id: String(item.order_id),
                    },
                    name,
                  )
                }
              >
                Cancel {isOffer ? "offer" : "listing"}
              </button>
            ) : !isOffer ? (
              <button
                className="lc-primary"
                onClick={() => act(terms(item, quantity), name)}
              >
                Buy {usd(Number(item.price) * quantity)}
              </button>
            ) : inVault ? (
              <button
                className="lc-primary"
                onClick={() => act(terms(item), name)}
              >
                Accept offer · {usd(Number(item.price))}
              </button>
            ) : (
              <p>Own this collectible to accept the offer.</p>
            )}
            {!owned && (
              <button
                className="lc-secondary"
                onClick={() =>
                  onOffer({
                    token_id: token,
                    name,
                    image_url: assetImage(product),
                  })
                }
              >
                Make an offer
              </button>
            )}
          </div>
          <p className="cm-note">
            {isOffer
              ? "Payment transfers when the owner accepts."
              : "Purchased items arrive in your vault. Keep, trade, or ship them."}
          </p>
        </div>
        {!!depth.length && (
          <div className="cm-depth">
            <h3>{isOffer ? "Other listings" : "Offers"}</h3>
            {depth.map((order) => {
              const own =
                String(order.maker).toLowerCase() === wallet.toLowerCase();
              return (
                <div key={String(order.order_id)}>
                  <span>@{String(asRecord(order.collector).username)}</span>
                  <strong>{usd(Number(order.price))}</strong>
                  <small>×{String(order.quantity)}</small>
                  {!own && (isOffer || inVault) && (
                    <button
                      className="lc-secondary"
                      onClick={() => act(terms(order), name)}
                    >
                      {isOffer ? "Buy" : "Accept"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {depthError && <p className="cm-note">{depthError}</p>}
      </div>
    </LiveModal>
  );
}

function MarketComposer({
  kind,
  item,
  holdings,
  onClose,
  onSubmit,
}: {
  kind: "list" | "offer";
  item?: ApiRecord;
  holdings: ApiRecord[];
  onClose: () => void;
  onSubmit: (input: ApiRecord, title: string) => void;
}) {
  const [token, setToken] = useState(
    String(item?.token_id || holdings[0]?.token_id || ""),
  );
  const [amount, setAmount] = useState(""),
    [quantity, setQuantity] = useState(1),
    [days, setDays] = useState(7),
    [error, setError] = useState("");
  const selected =
    item || holdings.find((value) => String(value.token_id) === token);
  return (
    <LiveModal
      title={kind === "list" ? "List from your vault" : "Make an offer"}
      onClose={onClose}
    >
      <form
        className="cm-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          if (
            !selected ||
            !/^\d+(\.\d{1,2})?$/.test(amount) ||
            Number(amount) <= 0 ||
            Number(amount) > 1000000
          ) {
            setError("Enter a price from $0.01 to $1,000,000.");
            return;
          }
          const [whole, fraction = ""] = amount.split(".");
          onSubmit(
            {
              kind,
              token_id: token,
              quantity,
              unit_amount: String(
                BigInt(whole) * BigInt(1000000) +
                  BigInt(fraction.padEnd(6, "0")),
              ),
              expiration: Math.floor(Date.now() / 1000) + days * 86400,
            },
            String(selected.name),
          );
        }}
      >
        {selected && (
          <div className="cm-picked">
            <Art src={assetImage(selected)} name={String(selected.name)} />
            <strong>{String(selected.name)}</strong>
          </div>
        )}
        {!item && (
          <label>
            Collectible
            <select
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setQuantity(1);
              }}
            >
              {holdings.map((value) => (
                <option
                  key={String(value.token_id)}
                  value={String(value.token_id)}
                >
                  {String(value.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="cm-form-row">
          <label>
            {kind === "list" ? "Price per item" : "Your offer"}
            <div className="cm-money">
              <span>$</span>
              <input
                required
                autoFocus
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </label>
          {kind === "list" && (
            <label>
              Quantity
              <input
                type="number"
                min={1}
                max={Math.min(20, Number(selected?.balance || 1))}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                required
              />
            </label>
          )}
        </div>
        <label>
          Expires in
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {[1, 3, 7, 14, 30].map((day) => (
              <option key={day} value={day}>
                {day} {day === 1 ? "day" : "days"}
              </option>
            ))}
          </select>
        </label>
        <p className="cm-note">
          {kind === "list"
            ? "Your listing will also appear on DYLI. Items stay in your wallet until sold."
            : "Offers also appear on DYLI. Keep enough USDC in your wallet until the offer expires or you cancel it."}
        </p>
        {error && (
          <p className="cm-error" role="alert">
            {error}
          </p>
        )}
        <button className="lc-primary" disabled={!selected}>
          Review {kind === "list" ? "listing" : "offer"}
        </button>
      </form>
    </LiveModal>
  );
}
