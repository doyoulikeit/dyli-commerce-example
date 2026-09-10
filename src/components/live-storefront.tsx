"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Archive,
  ArrowUpRight,
  Box,
  CircleUserRound,
  House,
  LoaderCircle,
  ShoppingBag,
  Activity,
  Wallet,
} from "lucide-react";
import { storefrontConfig } from "@/config/storefront";
import {
  Art,
  LiveModal,
  LiveProductCard,
  LiveProductDetail,
} from "@/components/live-catalog";
import { LiveReveal } from "@/components/live-reveal";
import { RevealModeSelector } from "@/components/reveal-mode";
import { useOpeningPreferences } from "@/components/use-opening-preferences";
import { normalizeOpeningPreferences } from "@/lib/opening-preferences";
import { LiveActivity } from "@/components/live-activity";
import { EmbeddedCardCheckout } from "@/components/embedded-card-checkout";
import { CommerceProgress } from "@/components/commerce-progress";
import { LiveBalance } from "@/components/live-balance";
import { LiveRedemption } from "@/components/live-redemption";
import { useLiveCommerce } from "@/components/use-live-commerce";
import { useCommerceRuntime } from "@/components/providers";
import {
  asRecord,
  asRows,
  assetImage,
  boxItem,
  canClearBalanceRecovery,
  quantityLimit,
  receiptRequired,
  usd,
  waitingForAccount,
  settlementSummary,
} from "@/lib/live-commerce";
import type { ApiRecord, CatalogItem, StorefrontResponse } from "@/lib/types";
import "./live-storefront.css";
import "./live-reveal.css";
import "./live-balance.css";

const allNavigation = (
  [
    { id: "home", label: "Home", Icon: House },
    { id: "shop", label: "Shop", Icon: ShoppingBag },
    { id: "boxes", label: "Boxes", Icon: Box },
    { id: "collection", label: "Vault", Icon: Archive },
    { id: "activity", label: "Activity", Icon: Activity },
  ] as const
);
type Tab = (typeof allNavigation)[number]["id"];

export function LiveStorefront({
  initialStorefront,
}: {
  initialStorefront: StorefrontResponse | null;
}) {
  const runtime = useCommerceRuntime();
  const boxesOnly = runtime?.boxesOnly ?? storefrontConfig.navigation.boxesOnly;
  const brandName = runtime?.name || storefrontConfig.brand.name;
  const navigation = allNavigation.filter(entry => !boxesOnly || entry.id !== "shop");
  const commerce = useLiveCommerce();
  const { session, flow, play, busy, error } = commerce;
  const [tab, setTab] = useState<Tab>("home");
  const [storefront, setStorefront] = useState(initialStorefront);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [checkoutItem, setCheckoutItem] = useState<CatalogItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const openingSettings = useOpeningPreferences(commerce.address);
  const [method, setMethod] = useState<"card" | "balance">("card");
  const [showOpening, setShowOpening] = useState(false);
  const [profile, setProfile] = useState(false);
  const [holding, setHolding] = useState<ApiRecord | null>(null);
  const [shipping, setShipping] = useState(false);
  const [shippingToken, setShippingToken] = useState<string | undefined>();
  const [shipped, setShipped] = useState(false);
  const [shopView, setShopView] = useState("graded");
  const [query, setQuery] = useState("");
  const [checkoutReturn, setCheckoutReturn] = useState(false);
  const [recoveryHash, setRecoveryHash] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/storefront", { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setStorefront(await response.json());
      })
      .catch(() => {});
    queueMicrotask(() =>
      setCheckoutReturn(
        new URLSearchParams(window.location.search).has("session_id"),
      ),
    );
    return () => controller.abort();
  }, []);

  const navigate = (next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const boxes = storefront?.boxes || [];
  const products = boxesOnly
    ? []
    : storefront?.catalog || [];
  const holdings = asRows(session?.holdings.items);
  const pricing = asRecord(flow?.quote?.price_breakdown);
  const collectibleValue = holdings.reduce(
    (sum, item) => sum + Number(item.estimated_value_usd || 0),
    0,
  );
  const checkoutReady = !!flow?.quote && flow.item.id === checkoutItem?.id;
  const greeting = String(
    session?.identity.name || session?.identity.email?.split("@")[0] || "",
  );
  const capabilities = asRecord(storefront?.readiness.capabilities);
  const paymentMethods = Array.isArray(capabilities.payments)
    ? capabilities.payments
    : [];
  const liveReady =
    asRecord(capabilities.box_play).contract_version === "gacha";
  const filtered = products.filter(
    (item) =>
      (shopView === "graded") ===
        (item.subcategory?.toLowerCase() === "graded card") &&
      item.name.toLowerCase().includes(query.toLowerCase()),
  );

  const startCheckout = () => {
    if (!commerce.authenticated) {
      commerce.login();
      return;
    }
    if (!session || !selected) return;
    if (!liveReady) {
      commerce.setError(
        "This storefront is waiting for the upgraded Commerce environment.",
      );
      return;
    }
    setCheckoutItem(selected);
    setQuantity(1);
    setSelected(null);
  };
  const showResume = async (source?: CatalogItem, orderId?: string) => {
    if (!orderId && flow?.stripeSessionId && !flow.orderId && flow.stripeUiMode === "embedded") {
      const destination = await commerce.resumeCard();
      if (!destination) return;
      setCheckoutReturn(false);
      if (destination === "checkout") {
        setCheckoutItem(flow.item);
        setMethod("card");
        setShowOpening(false);
        return;
      }
      setShowOpening(true);
      setCheckoutItem(null);
      navigate("collection");
      return;
    }
    if (!(await commerce.resume(source, orderId))) return;
    setShowOpening(true);
    setCheckoutItem(null);
    setCheckoutReturn(false);
    navigate("collection");
  };
  const cards = (items: CatalogItem[], count?: number) => (
    <div
      className={`lc-grid ${items[0] && boxItem(items[0]) ? "lc-box-grid" : ""}`}
    >
      {items.slice(0, count).map((item) => (
        <LiveProductCard
          key={item.key}
          item={item}
          onClick={() => setSelected(item)}
        />
      ))}
    </div>
  );
  const empty = (title: string, caption: string) => (
    <div className="lc-empty">
      <Archive />
      <h2>{title}</h2>
      <p>{caption}</p>
      <button className="lc-secondary" onClick={() => navigate("boxes")}>
        Explore boxes
      </button>
    </div>
  );

  if (waitingForAccount(commerce.ready, commerce.authenticated, commerce.address, session?.identity.walletAddress)) {
    return (
      <main className="lc-account-loading" aria-busy={!error}>
        <div className="brand-lockup" aria-label={brandName}>
          <i><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 5h8l5 16 5-16h8L19 28h-6Z" /></svg></i>
          <strong>{brandName}</strong>
        </div>
        {error ? (
          <div className="lc-account-loading-message" role="alert">
            <h1>Couldn’t load your account</h1>
            <p>{error}</p>
            <button className="lc-secondary" onClick={() => window.location.reload()}>Try again</button>
          </div>
        ) : (
          <div className="lc-account-loading-message" role="status">
            <LoaderCircle className="lc-account-loading-spinner" aria-hidden="true" />
          </div>
        )}
      </main>
    );
  }

  return (
    <div className="lc-app">
      <header className="lc-header">
        <button
          className="brand-lockup"
          onClick={() => navigate("home")}
          aria-label={`${brandName} home`}
        >
          <i>
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M3 5h8l5 16 5-16h8L19 28h-6Z" />
            </svg>
          </i>
          <strong>{brandName}</strong>
        </button>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label }) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="lc-account">
          <button className="lc-balance" aria-label="Your balance" disabled={!!busy} onClick={() => commerce.authenticated ? setProfile(true) : commerce.login()}>
            <Wallet />
            {session ? usd(session.balance.amount) : "—"}
          </button>
          <button
            className="lc-icon"
            onClick={() =>
              commerce.authenticated ? setProfile(true) : commerce.login()
            }
            aria-label={commerce.authenticated ? "Your account" : "Sign in"}
          >
            <CircleUserRound />
          </button>
        </div>
      </header>
      <main>
        {successMessage && <div className="lc-success" role="status">
          <span>{successMessage}</span>
          <button className="lc-icon" aria-label="Dismiss confirmation" onClick={() => setSuccessMessage("")}>×</button>
        </div>}
        {error && (
          <div className="lc-notice" role="alert">
            <span>{error}</span>
            <button
              onClick={() => commerce.setError("")}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}
        {(checkoutReturn || (flow && receiptRequired(flow))) && (
          <div className="lc-recovery">
            <div>
              <strong>Your purchase is saved</strong>
              <small>Continue where you left off.</small>
            </div>
            <div className="lc-recovery-actions">
              <button
                disabled={!!busy || !session}
                onClick={() => void showResume()}
              >
                Continue <ArrowUpRight />
              </button>
              {(flow?.stripeSessionId || checkoutReturn) && !flow?.orderId && !flow?.paymentAttempted && !flow?.paymentHash && (
                <button className="lc-secondary" disabled={!!busy || !session} onClick={() => {
                  void commerce.cancelCard().then(ok => {
                    if (ok) { setCheckoutReturn(false); setCheckoutItem(null); setSelected(null); }
                  });
                }}>
                  Cancel checkout
                </button>
              )}
              {canClearBalanceRecovery(flow) && (
                <button type="button" className="lc-secondary" disabled={!!busy || !session} onClick={() => {
                  if (!window.confirm("Clear this saved Balance checkout?\n\nThis does not cancel or refund a USDC payment. Only clear a test or abandoned attempt where no real USDC was sent. If you paid, choose Continue instead.\n\nThe old recovery details will be kept in this browser for support.")) return;
                  if (commerce.clearBalanceCheckout()) {
                    setRecoveryHash("");
                    setCheckoutItem(null);
                    setSelected(null);
                    setShowOpening(false);
                  }
                }}>
                  Clear checkout
                </button>
              )}
            </div>
          </div>
        )}
        {flow?.paymentAttempted && !flow.orderId && (
          <form
            className="lc-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              void commerce.recoverPayment(recoveryHash).then((ok) => {
                if (ok) {
                  setShowOpening(true);
                  navigate("collection");
                }
              });
            }}
          >
            <input
              aria-label="Payment transaction hash"
              placeholder="Payment transaction hash from your wallet"
              value={recoveryHash}
              onChange={(event) => setRecoveryHash(event.target.value)}
            />
            <button
              className="lc-secondary"
              disabled={!!busy || !/^0x[\da-f]{64}$/i.test(recoveryHash)}
            >
              Recover payment
            </button>
          </form>
        )}
        {!storefront && (
          <div className="lc-notice">
            The catalog is temporarily unavailable. Please refresh to try again.
          </div>
        )}
        {tab === "home" && (
          <>
            <section className="lc-portfolio">
              <div>
                <p>
                  {greeting ? `Welcome, ${greeting}` : "Your next great find."}
                </p>
                <h1>
                  {session ? usd(collectibleValue) : "Start your collection."}
                </h1>
                <span>
                  {session
                    ? `${holdings.length} collectibles in your vault`
                    : "Open a box. Find something worth keeping."}
                </span>
              </div>
              <button
                className="lc-primary"
                onClick={() =>
                  document
                    .getElementById("live-boxes")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                Explore boxes <ArrowUpRight />
              </button>
            </section>
            <section id="live-boxes">
              <div className="lc-section-title">
                <h2>Boxes</h2>
                <button onClick={() => navigate("boxes")}>
                  View all <ArrowUpRight />
                </button>
              </div>
              {cards(boxes, 3)}
            </section>
            {products.length > 0 && (
              <section>
                <div className="lc-section-title">
                  <h2>Shop</h2>
                  <button onClick={() => navigate("shop")}>
                    View all <ArrowUpRight />
                  </button>
                </div>
                {cards(products, 4)}
              </section>
            )}
            {holdings.length > 0 && (
              <section>
                <div className="lc-section-title">
                  <h2>Your vault</h2>
                  <button onClick={() => navigate("collection")}>
                    View all <ArrowUpRight />
                  </button>
                </div>
                <div className="lc-grid">
                  {holdings.slice(0, 4).map((item) => (
                    <button
                      className="lc-product"
                      key={String(item.token_id)}
                      onClick={() => {
                        navigate("collection");
                        setHolding(item);
                      }}
                    >
                      <Art src={assetImage(item)} name={String(item.name)} />
                      <strong>{String(item.name)}</strong>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <footer className="lc-footer">
              <a href="https://www.dyli.io" target="_blank" rel="noreferrer">
                Powered by{" "}
                <Image src="/dyli-logo.svg" alt="DYLI" width={78} height={32} />
              </a>
              <span>
                © {new Date().getFullYear()} {brandName}
              </span>
            </footer>
          </>
        )}
        {tab === "boxes" && (
          <>
            <h1>Boxes</h1>
            {boxes.length
              ? cards(boxes)
              : empty("No live boxes", "Check back for the next opening.")}
          </>
        )}
        {tab === "shop" && (
          <>
            <h1>Shop</h1>
            <div className="lc-toolbar">
              <div className="lc-toggle">
                {["graded", "sealed"].map((view) => (
                  <button
                    aria-pressed={shopView === view}
                    key={view}
                    onClick={() => setShopView(view)}
                  >
                    {view === "graded" ? "Graded" : "Sealed"}
                  </button>
                ))}
              </div>
              <input
                aria-label="Search collectibles"
                placeholder="Search collectibles"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {filtered.length
              ? cards(filtered)
              : empty("Nothing here yet", "Try another search.")}
          </>
        )}
        {tab === "collection" && (
          <>
            <div className="lc-section-title">
              <h1>Your vault</h1>
              {holdings.length > 0 && (
                <button
                  className="lc-primary"
                  onClick={() => { setShippingToken(undefined); setShipping(true); }}
                >
                  Ship
                </button>
              )}
            </div>
            <div className="lc-toolbar">
              <div className="lc-toggle">
                <button
                  aria-pressed={!shipped}
                  onClick={() => setShipped(false)}
                >
                  Collection
                </button>
                <button aria-pressed={shipped} onClick={() => setShipped(true)}>
                  Shipments
                </button>
              </div>
            </div>
            {!session ? (
              empty("Your vault awaits", "Sign in to see your collectibles.")
            ) : shipped ? (
              <>
                {session.redemptions.length ? (
                  <div className="lc-shipments">
                    {session.redemptions.map((shipment) => (
                      <article key={String(shipment.id)}>
                        <div className="lc-shipment-images">
                          {asRows(shipment.items).map((item) => (
                            <Art
                              key={String(item.token_id)}
                              src={assetImage(item)}
                              name={String(item.name || "Collectible")}
                            />
                          ))}
                        </div>
                        <div>
                          <strong>
                            {(
                              {
                                completed: "Shipment requested",
                                prepared: "Ready to ship",
                                processing: "Processing",
                                requires_action: "Needs review",
                                quoted: "Delivery options ready",
                                expired: "Quote expired",
                              } as Record<string, string>
                            )[String(shipment.status)] ||
                              String(shipment.status).replaceAll("_", " ")}
                          </strong>
                          <p>
                            {asRows(shipment.items).reduce(
                              (sum, item) => sum + Number(item.quantity || 1),
                              0,
                            )}{" "}
                            {asRows(shipment.items).reduce(
                              (sum, item) => sum + Number(item.quantity || 1),
                              0,
                            ) === 1
                              ? "collectible"
                              : "collectibles"}
                          </p>
                          <small>
                            {String(asRecord(shipment.address).city || "")}
                          </small>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  empty(
                    "No shipments yet",
                    "Your collectibles are safe in your vault.",
                  )
                )}
              </>
            ) : holdings.length ? (
              <div className="lc-grid">
                {holdings.map((item) => (
                  <button
                    className="lc-product"
                    key={String(item.token_id)}
                    onClick={() => setHolding(item)}
                  >
                    <Art src={assetImage(item)} name={String(item.name)} />
                    <span className="lc-product-info">
                      <strong>{String(item.name)}</strong>
                      <span>{usd(item.estimated_unit_value_usd)}</span>
                    </span>
                    <small>{Number(item.balance)} in vault</small>
                  </button>
                ))}
              </div>
            ) : (
              empty(
                "Make room for your first find",
                "Your next pull could be the one.",
              )
            )}
          </>
        )}
        {tab === "activity" && (
          <>
            <h1>Activity</h1>
            {session?.orders.length ? (
              <LiveActivity orders={session.orders} plays={session.boxPlays || []} busy={busy} onOpen={(item, orderId) => void showResume(item, orderId)} />
            ) : (
              empty("No activity yet", "Your purchases will appear here.")
            )}
          </>
        )}
      </main>
      <nav className="lc-bottom-nav" aria-label="Mobile navigation">
        {navigation.map(({ id, label, Icon }) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {selected && (
        <LiveProductDetail
          item={selected}
          onClose={() => setSelected(null)}
          onCheckout={startCheckout}
        />
      )}
      {checkoutItem && !showOpening && (
        <LiveModal
          title={commerce.cardCheckout ? "Secure checkout" : "Checkout"}
          className={commerce.cardCheckout ? "lc-card-modal" : ""}
          dismissible={!busy}
          onClose={() => {
            if (!busy) {
              setCheckoutItem(null);
              commerce.clearUnpaid();
            }
          }}
        >
          <div className="lc-checkout">
            {commerce.cardCheckout ? <>
              {error && <p className="lc-error" role="alert">{error}</p>}
              <EmbeddedCardCheckout key={commerce.cardCheckout.sessionId} checkout={commerce.cardCheckout} onComplete={async () => {
                const ok = await commerce.completeCard(commerce.cardCheckout!.sessionId);
                if (ok) {
                  setCheckoutItem(null);
                  setCheckoutReturn(false);
                  setShowOpening(true);
                  navigate("collection");
                }
                return ok;
              }} />
              <button className="lc-card-cancel" disabled={!!busy} onClick={async () => {
                if (await commerce.cancelCard()) {
                  setCheckoutItem(null);
                  setCheckoutReturn(false);
                }
              }}>Cancel checkout</button>
            </> : <>
            <div className="lc-checkout-product">
              <Art src={checkoutItem.image} name={checkoutItem.name} />
              <div>
                <h2>{checkoutItem.name}</h2>
                <span>{usd(checkoutItem.price)} each</span>
              </div>
            </div>
            {error && (
              <p className="lc-error" role="alert">
                {error}
              </p>
            )}
            {!checkoutReady ? (
              <>
                <label className="lc-stat">
                  Quantity
                  <select
                    value={quantity}
                    disabled={!!busy}
                    onChange={(event) =>
                      setQuantity(Number(event.target.value))
                    }
                  >
                    {Array.from(
                      { length: quantityLimit(checkoutItem) },
                      (_, index) => (
                        <option key={index + 1}>{index + 1}</option>
                      ),
                    )}
                  </select>
                </label>
                {boxItem(checkoutItem) && <RevealModeSelector value={openingSettings.preferences} onChange={openingSettings.update} quantity={quantity} disabled={!!busy} />}
                <button
                  className="lc-primary"
                  disabled={!!busy || !session}
                  onClick={() =>
                    void commerce.prepareQuote(checkoutItem, quantity, openingSettings.preferences)
                  }
                >
                  {busy && <LoaderCircle className="vr-spinner" size={18} aria-hidden="true" />} Continue
                </button>
              </>
            ) : (
              <>
                <div className="lc-payment-options">
                  <button
                    aria-pressed={method === "card"}
                    disabled={
                      !!busy || !!flow?.paymentAttempted ||
                      !paymentMethods.includes("stripe_card")
                    }
                    onClick={() => setMethod("card")}
                  >
                    Card
                  </button>
                  <button
                    aria-pressed={method === "balance"}
                    disabled={
                      !!busy || !!flow?.stripeSessionId ||
                      !paymentMethods.includes("usdc")
                    }
                    onClick={() => setMethod("balance")}
                  >
                    Balance <small>{usd(session?.balance.amount)}</small>
                  </button>
                </div>
                <p className="lc-stat lc-item-total">
                  <span>Items</span>
                  <strong>{usd(Number(pricing.subtotal_cents) / 100)}</strong>
                </p>
                {Number(pricing.partner_fee_cents) > 0 && (
                  <p className="lc-stat lc-fee">
                    <span>{String(pricing.fee_label || "Platform fee")}{Number(pricing.fee_quantity) > 1
                      ? ` · ${usd(Number(pricing.partner_fee_cents) / Number(pricing.fee_quantity) / 100)} × ${pricing.fee_quantity}` : ""}</span>
                    <span>{usd(Number(pricing.partner_fee_cents) / 100)}</span>
                  </p>
                )}
                <p className="lc-stat lc-total">
                  <span>Total</span>
                  <strong>{usd(Number(pricing.total_cents) / 100)}</strong>
                </p>
                {method === "card" && (
                  <small>
                    Card processing is shown in secure checkout. Apple Pay
                    appears when available.
                  </small>
                )}
                <button
                  className="lc-primary"
                  disabled={
                    !!busy ||
                    !paymentMethods.includes(
                      method === "card" ? "stripe_card" : "usdc",
                    )
                  }
                  onClick={async () => {
                    if (method === "card") {
                      await commerce.payCard();
                    }
                    else if (await commerce.payBalance()) {
                      setCheckoutItem(null);
                      setShowOpening(true);
                      navigate("collection");
                    }
                  }}
                >
                  {busy ||
                    (method === "card"
                      ? "Continue to card"
                      : "Pay with balance")}
                </button>
              </>
            )}
            </>}
          </div>
        </LiveModal>
      )}
      {showOpening && play && flow && (
        <LiveReveal
          key={play.id}
          play={play}
          item={flow.item}
          decisions={flow.decisions || play.decisions || []}
          preferences={normalizeOpeningPreferences(flow.openingPreferences)}
          busy={busy}
          error={error}
          onOpen={() => void commerce.openBoxes()}
          onChoose={commerce.choose}
          onSettle={async () => {
            const result = settlementSummary(flow.decisions || play.decisions || [], play.rewards);
            if (await commerce.settle()) {
              setShowOpening(false);
              setSuccessMessage(result.success);
              navigate(result.claimed ? "collection" : "home");
            }
          }}
          onClose={() => {
            if (!busy) setShowOpening(false);
          }}
        />
      )}
      {profile && session && (
        <LiveBalance key={commerce.address} session={session} readWallet={commerce.readWallet} send={commerce.send}
          onClose={() => setProfile(false)} onSignOut={async () => {
            if (await commerce.signOut()) setProfile(false);
          }} />
      )}
      {holding && (
        <LiveModal title="In your vault" onClose={() => setHolding(null)}>
          <div className="lc-checkout">
            <Art src={assetImage(holding)} name={String(holding.name)} />
            <h2>{String(holding.name)}</h2>
            {asRows(holding.attributes).map((attribute, index) => (
              <p className="lc-stat" key={index}>
                <span>{String(attribute.trait_type)}</span>
                <strong>{String(attribute.value)}</strong>
              </p>
            ))}
            <button
              className="lc-primary"
              onClick={() => {
                setShippingToken(String(holding.token_id));
                setHolding(null);
                setShipping(true);
              }}
            >
              Ship
            </button>
          </div>
        </LiveModal>
      )}
      {shipping && session && (
        <LiveRedemption
          initialTokenId={shippingToken}
          holdings={holdings}
          session={session}
          api={commerce.api}
          send={commerce.send}
          onComplete={async () => {
            setShipping(false);
            setShipped(true);
            navigate("collection");
            await commerce.refresh();
          }}
          onClose={() => setShipping(false)}
        />
      )}
      {busy && !profile && !checkoutItem && !(showOpening && play && flow) && <CommerceProgress message={busy} />}
    </div>
  );
}
