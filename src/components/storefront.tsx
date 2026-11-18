"use client";
import Link from "next/link";

import { AddressElement, Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type {
  StripeAddressElementChangeEvent,
  StripeAddressElementOptions,
} from "@stripe/stripe-js";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Box,
  Check,
  ChevronDown,
  CreditCard,
  Home,
  Info,
  Layers3,
  LoaderCircle,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  Truck,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import { LiveProductDetail, LiveModal } from "@/components/live-catalog";
import "./live-storefront.css";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ApiRecord, CatalogItem, StorefrontResponse } from "@/lib/types";
import { PackBrowser, PackCard, PackHero } from "@/components/pack-catalog";
import { LiveReveal } from "@/components/live-reveal";
import { drawDemoPulls, type DemoPull } from "@/lib/demo-pulls";
import { RevealModeSelector } from "@/components/reveal-mode";
import { useOpeningPreferences } from "@/components/use-opening-preferences";
import { normalizeOpeningPreferences, type OpeningPreferences } from "@/lib/opening-preferences";
import { CommerceLogo, ThemeSwitch } from "@/components/brand-identity";
import { readDemoStorage, writeDemoStorage, removeDemoStorage } from "@/lib/demo-storage";
import { storefrontConfig } from "@/config/storefront";

type Tab = "home" | "market" | "packs" | "collection" | "activity";
type PaymentMethod = "balance" | "card";
type ShopView = "graded" | "sealed";
type BalanceSignal = { id: string; delta: number };
type Holding = {
  id: string;
  catalogId?: string;
  name: string;
  image: string;
  brand: string;
  grade: string;
  value: number;
  quantity: number;
  session?: boolean;
};
type SessionActivity = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  amount: number;
  date: string;
  status: string;
  image?: string;
  images?: string[];
};
type Shipment = {
  id: string;
  holdings: Holding[];
  carrier: "USPS" | "UPS";
  service: string;
  tracking: string;
  destination: string;
  status: string;
  date: string;
};
type ShipmentSelection = { holdingId: string; quantity: number };
type MarketOrder = {
  id: string;
  productKey: string;
  name: string;
  image: string;
  side: "listing" | "offer";
  price: number;
  quantity: number;
  status: "Open";
  date: string;
};
type MarketIntent = {
  side: "listing" | "offer";
  productKey: string;
  name: string;
  image: string;
  referencePrice: number;
  maxQuantity: number;
  returnItem?: CatalogItem;
  returnHolding?: Holding;
};
type DemoState = {
  balance: number;
  holdings: Holding[];
  activity: SessionActivity[];
  shipments: Shipment[];
  marketOrders: MarketOrder[];
};
type BoxData = { box: ApiRecord; ranges: ApiRecord; history: ApiRecord };

type BoxRun = { id: string; item: CatalogItem; rewards: DemoPull[]; decisions: Array<"claim"|"sell_back">; revealed: boolean; total: number; preferences: OpeningPreferences };
type ShippingRate = {
  id: string;
  carrier: "USPS" | "UPS";
  service: string;
  eta: string;
  price: number;
};
type ShippingAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
};

const STORAGE_KEY = "vaulted-session-poc-v5";
const PROFILE_KEY = "vaulted-session-profile-v1";
const SESSION_START_BALANCE = 500;
const PLATFORM_FEE = 0;
const EMPTY_DEMO: DemoState = {
  balance: SESSION_START_BALANCE,
  holdings: [],
  activity: [],
  shipments: [],
  marketOrders: [],
};
const SHIPPING_RATES: ShippingRate[] = [
  {
    id: "usps-ground",
    carrier: "USPS",
    service: "Ground Advantage",
    eta: "3–5 days",
    price: 5.84,
  },
  {
    id: "ups-ground",
    carrier: "UPS",
    service: "Ground",
    eta: "2–4 days",
    price: 8.42,
  },
];
const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const stripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : null;

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
const signedMoney = (value: number) =>
  `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
const compact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
const text = (value: unknown) => String(value ?? "").trim();
const record = (value: unknown): ApiRecord =>
  value && typeof value === "object" ? (value as ApiRecord) : {};
const records = (value: unknown): ApiRecord[] =>
  Array.isArray(value) ? (value as ApiRecord[]) : [];
const isBox = (item: CatalogItem) =>
  ["pack", "box"].includes(item.type.toLowerCase()) || ["packs", "boxes"].includes(item.surface);
const isSealed = (item: CatalogItem) =>
  ["booster pack", "booster box", "booster bundle"].includes(
    text(item.subcategory).toLowerCase(),
  );
const needsArtBoost = (...values: unknown[]) =>
  /booster|pack|sealed/.test(values.map(text).join(" ").toLowerCase());
const normalizedName = (value: string) => value.trim().toLowerCase();
const holdingMatchesItem = (holding: Holding, item: CatalogItem) =>
  holding.catalogId === item.id ||
  normalizedName(holding.name) === normalizedName(item.name);
const marketOrderMatches = (
  order: MarketOrder,
  productKey: string,
  name: string,
) =>
  order.productKey === productKey ||
  normalizedName(order.name) === normalizedName(name);
const trackingNumber = (carrier: "USPS" | "UPS") => {
  const value = crypto.randomUUID().replaceAll("-", "").toUpperCase();
  return carrier === "UPS"
    ? `1Z${value.slice(0, 16)}`
    : `9400${value.replace(/\D/g, "").padEnd(18, "7").slice(0, 18)}`;
};

const imageFor = (value: ApiRecord) => {
  const images = Array.isArray(value.images) ? value.images : [];
  return text(
    value.image_url ||
      value.image ||
      value.master_image ||
      value.cover_image_url ||
      images[0],
  );
};

const nameFor = (value: ApiRecord) => {
  const name = text(
    value.name ||
      value.title ||
      value.product ||
      `Collectible ${value.token_id || ""}`,
  );
  const brand = text(value.brand);
  return brand && name.toLowerCase().startsWith(`${brand.toLowerCase()} - `)
    ? name.slice(brand.length + 3)
    : name;
};

const maxQuantity = (item: CatalogItem) =>
  Math.max(1, Math.min(8, item.availability ?? 1));

function groupOddsBuckets(buckets: ApiRecord[]) {
  const grouped = new Map<string, ApiRecord>();
  for (const bucket of buckets) {
    const tier = text(bucket.tier || "Pull");
    const key = tier.toLowerCase();
    const minimum = Number(bucket.min || 0);
    const maximum = Number(bucket.max || 0);
    const chance = Number(bucket.percent || bucket.rarity || 0);
    const existing = grouped.get(key);
    grouped.set(
      key,
      existing
        ? {
            ...existing,
            min: Math.min(Number(existing.min || 0), minimum),
            max: Math.max(Number(existing.max || 0), maximum),
            percent: Number(existing.percent || 0) + chance,
          }
        : { tier, min: minimum, max: maximum, percent: chance },
    );
  }
  return [...grouped.values()];
}

function balancedPreview(items: CatalogItem[], limit: number) {
  const groups = new Map<string, CatalogItem[]>();
  for (const item of items) {
    const key = item.brand || "Other";
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  const result: CatalogItem[] = [];
  let index = 0;
  while (result.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      if (group[index]) {
        result.push(group[index]);
        added = true;
        if (result.length === limit) return result;
      }
    }
    if (!added) return result;
    index += 1;
  }
  return result;
}

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as ApiRecord;
  if (!response.ok)
    throw new Error(text(payload.message || payload.error || "Request failed"));
  return payload as T;
}



export function Storefront({
  initialStorefront,
}: {
  initialStorefront: StorefrontResponse | null;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [storefront, setStorefront] = useState<StorefrontResponse | null>(
    initialStorefront,
  );
  const [storefrontError, setStorefrontError] = useState("");
  const [demo, setDemo] = useState<DemoState>(EMPTY_DEMO);
  const [profileName, setProfileName] = useState("");
  const [profileReady, setProfileReady] = useState(false);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [purchase, setPurchase] = useState<CatalogItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [payment, setPayment] = useState<PaymentMethod>("card");
  const [checkoutStage, setCheckoutStage] = useState<
    "checkout" | "processing" | "success"
  >("checkout");
  const [boxRun, setBoxRun] = useState<BoxRun | null>(null);
  const [showDemoOpening, setShowDemoOpening] = useState(false);
  const settledDemoRuns = useRef(new Set<string>());
  const openingSettings = useOpeningPreferences("demo");
  const [redemptionOpen, setRedemptionOpen] = useState(false);
  const [redemptionHoldingId, setRedemptionHoldingId] = useState("");
  const [collectionSection, setCollectionSection] = useState<
    "owned" | "shipped"
  >("owned");
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [notice, setNotice] = useState("");
  const [marketIntent, setMarketIntent] = useState<MarketIntent | null>(null);
  const [balanceSignal, setBalanceSignal] = useState<BalanceSignal | null>(
    null,
  );
  const previousBalance = useRef(SESSION_START_BALANCE);

  useEffect(() => {
    let restoredDemo = EMPTY_DEMO;
    const saved = readDemoStorage(STORAGE_KEY);
    if (saved) {
      try {
        const restored = JSON.parse(saved) as DemoState;
        if (
          Array.isArray(restored.holdings) &&
          Array.isArray(restored.activity)
        ) {
          restoredDemo = {
            ...restored,
            balance: SESSION_START_BALANCE,
            shipments: Array.isArray(restored.shipments)
              ? restored.shipments
              : [],
            marketOrders: Array.isArray(restored.marketOrders)
              ? restored.marketOrders
              : [],
          };
          writeDemoStorage(
            STORAGE_KEY,
            JSON.stringify(restoredDemo),
          );
        }
      } catch {
        removeDemoStorage(STORAGE_KEY);
      }
    }
    const savedName = readDemoStorage(PROFILE_KEY) || "Collector";
    const frame = window.requestAnimationFrame(() => {
      setDemo(restoredDemo);
      setProfileName(savedName);
      setProfileReady(true);
    });
    const controller = new AbortController();
    if (!initialStorefront) {
      void fetch("/api/storefront", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok)
            throw new Error(
              payload.message || payload.error || "Catalog unavailable",
            );
          setStorefront(payload as StorefrontResponse);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setStorefrontError(
            error instanceof Error ? error.message : "Catalog unavailable",
          );
        });
    }
    return () => {
      controller.abort();
      window.cancelAnimationFrame(frame);
    };
  }, [initialStorefront]);

  useEffect(() => {
    const delta = demo.balance - previousBalance.current;
    previousBalance.current = demo.balance;
    if (!profileReady || delta === 0) return;
    const signal = { id: crypto.randomUUID(), delta };
    setBalanceSignal(signal);
    const timeout = window.setTimeout(() => {
      setBalanceSignal((current) =>
        current?.id === signal.id ? null : current,
      );
    }, 2500);
    return () => window.clearTimeout(timeout);
  }, [demo.balance, profileReady]);

  const updateDemo = useCallback(
    (update: (current: DemoState) => DemoState) => {
      setDemo((current) => {
        const next = update(current);
        writeDemoStorage(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const holdings = demo.holdings;
  const collectionValue = demo.holdings.reduce(
    (sum, item) => sum + item.value * item.quantity,
    0,
  );
  const catalog = storefront?.catalog || [];
  const boxes = storefront?.packs || storefront?.boxes || [];

  const navigate = (next: Tab) => {
    if (next === "collection") setCollectionSection("owned");
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const beginPurchase = (item: CatalogItem) => {
    setSelected(null);
    setPurchase(item);
    setQuantity(1);
    setPayment(
      demo.balance >= (item.price || 0) + PLATFORM_FEE ? "balance" : "card",
    );
    setCheckoutStage("checkout");
  };

  const loadBoxData = async (item: CatalogItem) =>
    api<BoxData>(`/api/packs/${encodeURIComponent(item.id)}`);

  const checkout = async () => {
    if (!purchase || checkoutStage !== "checkout") return;
    const total = (purchase.price || 0) * quantity + PLATFORM_FEE;
    setCheckoutStage("processing");
    try {
      const boxDataPromise = isBox(purchase)
        ? loadBoxData(purchase)
        : Promise.resolve(null);
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      const boxData = await boxDataPromise;
      const rewards = boxData ? drawDemoPulls(boxData, purchase, quantity) : [];
      const entry: SessionActivity = {
        id: crypto.randomUUID(),
        type: isBox(purchase) ? "box" : "purchase",
        title: purchase.name,
        subtitle: `${quantity} × ${payment === "balance" ? "Balance" : "Card"}`,
        amount: -total,
        date: new Date().toISOString(),
        status: isBox(purchase) ? "Opening" : "In collection",
        image: purchase.image || "",
      };
      updateDemo((current) => {
        const next = {
          ...current,
          balance:
            payment === "balance"
              ? Math.max(0, current.balance - total)
              : current.balance,
          activity: [entry, ...current.activity],
        };
        if (!isBox(purchase)) {
          const existing = current.holdings.find(
            (item) => item.name === purchase.name,
          );
          next.holdings = existing
            ? current.holdings.map((item) =>
                item.id === existing.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item,
              )
            : [
                {
                  id: crypto.randomUUID(),
                  catalogId: purchase.id,
                  name: purchase.name,
                  image: purchase.image || "",
                  brand: purchase.brand || "Collectible",
                  grade: text(
                    record(purchase.raw).cert ||
                      purchase.subcategory ||
                      "Authenticated",
                  ),
                  value: purchase.price || 0,
                  quantity,
                  session: true,
                },
                ...current.holdings,
              ];
        }
        return next;
      });
      if (boxData) {
        const item = purchase;
        setPurchase(null);
        setBoxRun({ id: entry.id, item, rewards, total: quantity, decisions: [], revealed: false, preferences: normalizeOpeningPreferences(openingSettings.preferences) });
        setShowDemoOpening(true);
      } else {
        setPurchase(null);
        navigate("collection");
      }
    } catch (error) {
      setCheckoutStage("checkout");
      setNotice(
        error instanceof Error ? error.message : "Could not complete checkout",
      );
    }
  };

  

    const settleDemoPulls = () => {
    if (!boxRun || settledDemoRuns.current.has(boxRun.id) || boxRun.decisions.length !== boxRun.total || boxRun.rewards.some((reward,index) => !boxRun.decisions[index] || (boxRun.decisions[index] === 'sell_back' && reward.buyback <= 0))) return;
    settledDemoRuns.current.add(boxRun.id);
    const credited = boxRun.rewards.reduce((sum,reward,index) => sum + (boxRun.decisions[index] === "sell_back" ? reward.buyback : 0), 0);
    const claimed = boxRun.decisions.filter(choice => choice === "claim").length;
    const activity: SessionActivity[] = boxRun.rewards.map((reward,index) => ({id:crypto.randomUUID(),type:boxRun.decisions[index] === "sell_back" ? "sell" : "keep",title:reward.name,subtitle:boxRun.item.name,amount:boxRun.decisions[index] === "sell_back" ? reward.buyback : 0,date:new Date().toISOString(),status:boxRun.decisions[index] === "sell_back" ? "Sold" : "In collection",image:reward.image}));
    updateDemo(current => {
      let holdings = [...current.holdings];
      for (const [index,reward] of boxRun.rewards.entries()) {
        const sell = boxRun.decisions[index] === 'sell_back';
        if (!sell) {
          const existing = holdings.find(holding => holding.id === reward.id);
          holdings = existing ? holdings.map(holding => holding.id === reward.id ? {...holding,quantity:holding.quantity+1} : holding) : [{id:reward.id,name:reward.name,image:reward.image,brand:reward.brand,grade:reward.grade,value:reward.value,quantity:1,session:true},...holdings];
        }
      }
      return {...current,balance:current.balance+credited,holdings,activity:[...activity,...current.activity.map(entry => entry.id === boxRun.id ? {...entry,status:"Completed"} : entry)]};
    });
    setNotice(`${credited ? `${money(credited)} added to your demo balance. ` : ''}${claimed ? `${claimed} added to your demo vault.` : ''}`);
    setBoxRun(null);setShowDemoOpening(false);navigate('collection');
  };



  const completeRedemption = (
    selections: ShipmentSelection[],
    rate: ShippingRate,
    address: ShippingAddress,
    shippingCost: number,
  ) => {
    const selectedHoldings = selections.flatMap((selection) => {
      const holding = holdings.find((item) => item.id === selection.holdingId);
      return holding
        ? [
            {
              ...holding,
              quantity: Math.min(holding.quantity, selection.quantity),
            },
          ]
        : [];
    });
    const selectedCount = selectedHoldings.reduce(
      (sum, holding) => sum + holding.quantity,
      0,
    );
    if (!selectedCount) return;
    const date = new Date().toISOString();
    const entry: SessionActivity = {
      id: crypto.randomUUID(),
      type: "redemption",
      title:
        selectedCount === 1
          ? selectedHoldings[0].name
          : `${selectedCount} collectibles`,
      subtitle: `${rate.carrier} ${rate.service} · ${address.city}, ${address.state}`,
      amount: -shippingCost,
      date,
      status: "Label created",
      images: selectedHoldings.map((holding) => holding.image).filter(Boolean),
    };
    const shipment: Shipment = {
      id: crypto.randomUUID(),
      holdings: selectedHoldings,
      carrier: rate.carrier,
      service: rate.service,
      tracking: trackingNumber(rate.carrier),
      destination: `${address.city}, ${address.state}`,
      status: "Label created",
      date,
    };
    updateDemo((current) => ({
      ...current,
      balance: Math.max(0, current.balance - shippingCost),
      holdings: current.holdings.flatMap((item) => {
        const shipped = selections.find(
          (selection) => selection.holdingId === item.id,
        )?.quantity;
        if (!shipped) return [item];
        const remaining = item.quantity - shipped;
        return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
      }),
      activity: [entry, ...current.activity],
      shipments: [shipment, ...current.shipments],
    }));
  };

  const createMarketOrder = (price: number, quantity: number) => {
    if (!marketIntent) return;
    const order: MarketOrder = {
      id: crypto.randomUUID(),
      productKey: marketIntent.productKey,
      name: marketIntent.name,
      image: marketIntent.image,
      side: marketIntent.side,
      price,
      quantity,
      status: "Open",
      date: new Date().toISOString(),
    };
    const entry: SessionActivity = {
      id: crypto.randomUUID(),
      type: marketIntent.side,
      title: marketIntent.name,
      subtitle: `${quantity} × ${money(price)}`,
      amount: 0,
      date: order.date,
      status: marketIntent.side === "listing" ? "Listed" : "Offer open",
      image: marketIntent.image,
    };
    updateDemo((current) => ({
      ...current,
      marketOrders: [order, ...current.marketOrders],
      activity: [entry, ...current.activity],
    }));
    if (marketIntent.returnItem) setSelected(marketIntent.returnItem);
    if (marketIntent.returnHolding)
      setSelectedHolding(marketIntent.returnHolding);
    setMarketIntent(null);
  };

  const resetWelcome = () => {
    removeDemoStorage(PROFILE_KEY);
    removeDemoStorage(STORAGE_KEY);
    previousBalance.current = SESSION_START_BALANCE;
    setBalanceSignal(null);
    setDemo(EMPTY_DEMO);
    setProfileName("Collector");
    setSelected(null);
    setPurchase(null);
    setBoxRun(null);
    setShowDemoOpening(false);
    setRedemptionOpen(false);
    setRedemptionHoldingId("");
    setCollectionSection("owned");
    setSelectedHolding(null);
    setTab("home");
  };

  return (
    <div className="store-app">
      <Header
        brand={storefrontConfig.brand.name}
        active={tab}
        balance={demo.balance}
        balanceSignal={balanceSignal}
        profileName={profileName || "Collector"}
        onNavigate={navigate}
        onReset={resetWelcome}
      />
      <div className="dyli-demo-banner" role="status"><span><strong>Demo mode</strong> Virtual funds. No real purchases or shipments.</span>{!storefrontConfig.demo.enabled && <Link prefetch={false} href="/">Exit demo</Link>}</div>
      {notice ? (
        <div className="app-notice">
          <Info />
          {notice}
          <button aria-label="Dismiss" onClick={() => setNotice("")}>
            <X />
          </button>
        </div>
      ) : null}
      <main className="store-main">
        {tab === "home" ? (
          <HomeView
            holdings={holdings}
            boxes={boxes}
            shop={catalog}
            onNavigate={navigate}
            onSelect={setSelected}
            onSelectHolding={(holding) => {
              navigate("collection");
              setSelectedHolding(holding);
            }}
            onBuy={beginPurchase}
          />
        ) : null}
        {tab === "market" ? (
          <MarketView
            items={catalog}
            loading={!storefront && !storefrontError}
            error={storefrontError}
            onSelect={setSelected}
            onBuy={beginPurchase}
          />
        ) : null}
        {tab === "packs" ? (
          <BoxesView
            items={boxes}
            loading={!storefront && !storefrontError}
            error={storefrontError}
            onSelect={setSelected}
          />
        ) : null}
        {tab === "collection" ? (
          <CollectionView
            holdings={holdings}
            shipments={demo.shipments}
            value={collectionValue}
            section={collectionSection}
            onSection={setCollectionSection}
            onRedeem={() => {
              setRedemptionHoldingId("");
              setRedemptionOpen(true);
            }}
            onSelectHolding={setSelectedHolding}
          />
        ) : null}
        {tab === "activity" ? (
          <ActivityView sessionActivity={demo.activity} />
        ) : null}
      </main>
      {tab === "home" ? <StoreFooter /> : null}
      <BottomNav active={tab} onNavigate={navigate} />
      {selected ? (
        <ProductDetail
          item={selected}
          ownedHolding={holdings.find((holding) =>
            holdingMatchesItem(holding, selected),
          )}
          orders={demo.marketOrders}
          onClose={() => setSelected(null)}
          onBuy={() => beginPurchase(selected)}
          onOffer={() => {
            setSelected(null);
            setMarketIntent({
              side: "offer",
              productKey: selected.id,
              name: selected.name,
              image: selected.image || "",
              referencePrice: selected.price || 0,
              maxQuantity: maxQuantity(selected),
              returnItem: selected,
            });
          }}
          onList={(holding) => {
            setSelected(null);
            setMarketIntent({
              side: "listing",
              productKey: selected.id,
              name: holding.name,
              image: holding.image,
              referencePrice: selected.price || holding.value,
              maxQuantity: holding.quantity,
              returnItem: selected,
            });
          }}
          onShip={(holding) => {
            setSelected(null);
            setRedemptionHoldingId(holding.id);
            setRedemptionOpen(true);
          }}
        />
      ) : null}
      {selectedHolding ? (
        <HoldingDetail
          holding={selectedHolding}
          activity={demo.activity.filter(
            (entry) => entry.title === selectedHolding.name,
          )}
          orders={demo.marketOrders}
          onClose={() => setSelectedHolding(null)}
          onList={() => {
            setSelectedHolding(null);
            setMarketIntent({
              side: "listing",
              productKey: selectedHolding.catalogId || selectedHolding.id,
              name: selectedHolding.name,
              image: selectedHolding.image,
              referencePrice: selectedHolding.value,
              maxQuantity: selectedHolding.quantity,
              returnHolding: selectedHolding,
            });
          }}
          onShip={() => {
            setRedemptionHoldingId(selectedHolding.id);
            setSelectedHolding(null);
            setRedemptionOpen(true);
          }}
        />
      ) : null}
      {purchase ? (
        <Checkout
          item={purchase}
          quantity={quantity}
          payment={payment}
          balance={demo.balance}
          stage={checkoutStage}
          preferences={openingSettings.preferences}
          onPreferences={openingSettings.update}
          onQuantity={setQuantity}
          onPayment={setPayment}
          onClose={() => checkoutStage !== "processing" && setPurchase(null)}
          onCheckout={checkout}
          onCollection={() => {
            setPurchase(null);
            navigate("collection");
          }}
        />
      ) : null}
      {boxRun && !showDemoOpening && <div className="dyli-demo-resume"><span>You have a demo opening to finish.</span><button className="secondary-button" onClick={() => setShowDemoOpening(true)}>Continue opening</button></div>}
      {boxRun && showDemoOpening ? <LiveReveal demo item={boxRun.item} play={{id:boxRun.id,quantity:boxRun.total,rewards:boxRun.revealed ? boxRun.rewards.map((reward,index) => ({index,token_id:reward.id,product_id:0,product:{name:reward.name,image:reward.image,brand:reward.brand,grade:reward.grade,fmv_usd:reward.value},rarity:reward.tier,buyback_amount:reward.buyback,disposition:null})) : []}} decisions={boxRun.decisions} busy="" error="" preferences={boxRun.preferences} onOpen={() => setBoxRun(current => current ? {...current,revealed:true}:null)} onChoose={(index,choice) => setBoxRun(current => {if(!current)return current;const decisions=[...current.decisions];decisions[index]=choice;return {...current,decisions};})} onSettle={settleDemoPulls} onClose={() => setShowDemoOpening(false)} /> : null}
      {redemptionOpen ? (
        <RedemptionModal
          holdings={holdings}
          profileName={profileName}
          initialHoldingId={redemptionHoldingId}
          onClose={() => {
            setRedemptionOpen(false);
            setRedemptionHoldingId("");
          }}
          onDone={() => {
            setRedemptionOpen(false);
            setRedemptionHoldingId("");
            setCollectionSection("shipped");
            setTab("collection");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onSubmit={completeRedemption}
        />
      ) : null}
      {marketIntent ? (
        <MarketOrderModal
          intent={marketIntent}
          onClose={() => setMarketIntent(null)}
          onSubmit={createMarketOrder}
        />
      ) : null}
      {!profileReady ? (
        <div className="welcome-layer" />
      ) : null}
    </div>
  );
}

const NAV: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "home", label: "Home", icon: <Home /> },
  { id: "market", label: "Shop", icon: <ShoppingBag /> },
  { id: "packs", label: "Packs", icon: <Box /> },
  { id: "collection", label: "Collection", icon: <Layers3 /> },
  { id: "activity", label: "Activity", icon: <Activity /> },
];

function StoreFooter() {
  return (
    <footer className="store-footer">
      <a href="https://www.dyli.io" target="_blank" rel="noreferrer">
        <span>Powered by</span>
        <Image
          src="/dyli-logo.svg"
          alt="DYLI"
          width={77}
          height={29}
          unoptimized
        />
      </a>
      <small>© {new Date().getFullYear()} {storefrontConfig.brand.name}</small>
    </footer>
  );
}

function Logo({ brand }: { brand: string }) {
  return <CommerceLogo name={brand} />;
}

function Header({
  brand,
  active,
  balance,
  balanceSignal,
  profileName,
  onNavigate,
  onReset,
}: {
  brand: string;
  active: Tab;
  balance: number;
  balanceSignal: BalanceSignal | null;
  profileName: string;
  onNavigate: (tab: Tab) => void;
  onReset: () => void;
}) {
  return (
    <header className="store-header">
      <button onClick={() => onNavigate("home")} className="brand-button">
        <Logo brand={brand} />
      </button>
      <nav>
        {NAV.slice(1).map((item) => (
          <button
            className={active === item.id ? "active" : ""}
            key={item.id}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="header-account">
        <ThemeSwitch />
        <span
          className={`balance-chip ${balanceSignal ? (balanceSignal.delta > 0 ? "balance-up" : "balance-down") : ""}`}
          aria-live="polite"
        >
          <WalletCards />
          <AnimatePresence initial={false} mode="popLayout">
            <motion.b
              key={balance}
              initial={{
                opacity: 0,
                y: balanceSignal?.delta && balanceSignal.delta > 0 ? 9 : -9,
              }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: balanceSignal?.delta && balanceSignal.delta > 0 ? -9 : 9,
              }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {money(balance)}
            </motion.b>
          </AnimatePresence>
          <AnimatePresence>
            {balanceSignal ? (
              <motion.em
                className={balanceSignal.delta > 0 ? "credit" : "debit"}
                key={balanceSignal.id}
                initial={{ opacity: 0, y: balanceSignal.delta > 0 ? 8 : -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: balanceSignal.delta > 0 ? -5 : 5 }}
                transition={{ duration: 0.24 }}
              >
                {signedMoney(balanceSignal.delta)}
              </motion.em>
            ) : null}
          </AnimatePresence>
        </span>
        <details className="profile-menu">
          <summary className="profile-chip">
            <i>{profileName.charAt(0).toUpperCase()}</i>
            <span>{profileName}</span>
            <ChevronDown />
          </summary>
          <div>
            <button onClick={onReset}>Reset demo</button>
          </div>
        </details>
      </div>
    </header>
  );
}

function BottomNav({
  active,
  onNavigate,
}: {
  active: Tab;
  onNavigate: (tab: Tab) => void;
}) {
  return (
    <nav className="bottom-nav">
      {NAV.map((item) => (
        <button
          className={active === item.id ? "active" : ""}
          key={item.id}
          onClick={() => onNavigate(item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}



function HomeView({
  holdings,
  boxes,
  shop,
  onNavigate,
  onSelect,
  onSelectHolding,
  onBuy,
}: {
  holdings: Holding[];
  boxes: CatalogItem[];
  shop: CatalogItem[];
  onNavigate: (tab: Tab) => void;
  onSelect: (item: CatalogItem) => void;
  onSelectHolding: (holding: Holding) => void;
  onBuy: (item: CatalogItem) => void;
}) {
  const shopPreview = balancedPreview(shop, 4);
  return (
    <div className="page-in">
      <PackHero items={boxes} onSelect={onSelect} onExplore={() => onNavigate("packs")} demo />
      {holdings.length ? (
        <section className="asset-section">
          <SectionTitle
            title="Your collection"
            action="View all"
            onAction={() => onNavigate("collection")}
          />
          <div className="asset-strip">
            {holdings.slice(0, 8).map((holding) => (
              <HoldingCard
                key={`${holding.id}-${holding.session ? "session" : "live"}`}
                holding={holding}
                onSelect={() => onSelectHolding(holding)}
              />
            ))}
          </div>
        </section>
      ) : null}
      {boxes.length ? (
        <section className="asset-section" id="home-buy">
          <SectionTitle
            title="Open a pack"
            action="See all"
            onAction={() => onNavigate("packs")}
          />
          <div className="home-pack-grid">
            {boxes.slice(0, 3).map((item) => (
              <BoxCard
                key={item.key}
                item={item}
                onSelect={() => onSelect(item)}
              />
            ))}
          </div>
        </section>
      ) : null}
      {shopPreview.length ? (
        <section
          className="asset-section home-shop"
          id={boxes.length ? undefined : "home-buy"}
        >
          <SectionTitle
            title="Shop"
            action="See all"
            onAction={() => onNavigate("market")}
          />
          <div className="home-shop-grid">
            {shopPreview.map((item) => (
              <ProductCard
                key={item.key}
                item={item}
                onSelect={() => onSelect(item)}
                onBuy={() => onBuy(item)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <button onClick={onAction}>
        {action}
        <ArrowRight />
      </button>
    </div>
  );
}

function HoldingCard({
  holding,
  onSelect,
}: {
  holding: Holding;
  onSelect?: () => void;
}) {
  return (
    <article
      className={`holding-card ${needsArtBoost(holding.name, holding.grade) ? "boost-art" : ""}`}
    >
      {onSelect ? (
        <button
          className="cover-button"
          onClick={onSelect}
          aria-label={`View ${holding.name}`}
        />
      ) : null}
      <div>
        <ProductImage
          src={holding.image}
          alt={holding.name}
          sizes="(max-width: 700px) 44vw, 210px"
          boost={needsArtBoost(holding.name, holding.grade)}
        />
      </div>
      <small>
        {holding.brand} · {holding.grade}
      </small>
      <strong>{holding.name}</strong>
      <p>
        <b>{money(holding.value * holding.quantity)}</b>
        {holding.quantity > 1 ? <span>×{holding.quantity}</span> : null}
      </p>
    </article>
  );
}

function MarketView({
  items,
  loading,
  error,
  onSelect,
  onBuy,
}: {
  items: CatalogItem[];
  loading: boolean;
  error: string;
  onSelect: (item: CatalogItem) => void;
  onBuy: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ShopView>("graded");
  const viewItems = items.filter((item) =>
    view === "sealed" ? isSealed(item) : !isSealed(item),
  );
  const filtered = viewItems.filter((item) =>
    `${item.name} ${item.brand} ${item.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="page-in">
      <PageTitle title="Shop" count={viewItems.length} />
      <div className="shop-tools">
        <div className="shop-switch" role="tablist" aria-label="Shop category">
          <button
            className={view === "graded" ? "active" : ""}
            onClick={() => setView("graded")}
            role="tab"
            aria-selected={view === "graded"}
          >
            Graded
          </button>
          <button
            className={view === "sealed" ? "active" : ""}
            onClick={() => setView("sealed")}
            role="tab"
            aria-selected={view === "sealed"}
          >
            Sealed
          </button>
        </div>
        <label className="search-pack">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${view}`}
          />
        </label>
      </div>
      {loading ? <CardSkeleton /> : null}
      {error ? <Empty message={error} /> : null}
      <div className="product-grid">
        {filtered.map((item) => (
          <ProductCard
            key={item.key}
            item={item}
            onSelect={() => onSelect(item)}
            onBuy={() => onBuy(item)}
          />
        ))}
      </div>
      {!loading && !error && !filtered.length ? (
        <Empty message={`No ${view} collectibles found.`} />
      ) : null}
    </div>
  );
}

function PageTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      {count != null ? <span>{count}</span> : null}
    </div>
  );
}

function ProductCard({
  item,
  onSelect,
  onBuy,
}: {
  item: CatalogItem;
  onSelect: () => void;
  onBuy: () => void;
}) {
  return (
    <article
      className={`product-card ${needsArtBoost(item.name, item.subcategory, item.category) ? "boost-art" : ""}`}
    >
      <button
        className="cover-button"
        onClick={onSelect}
        aria-label={`View ${item.name}`}
      />
      <div className="product-art">
        <ProductImage
          src={item.image}
          alt={item.name}
          sizes="(max-width: 700px) 45vw, 230px"
          boost={needsArtBoost(item.name, item.subcategory, item.category)}
        />
        {item.availability && item.availability <= 3 ? (
          <span>{item.availability} left</span>
        ) : null}
      </div>
      <small>{item.brand || item.category}</small>
      <strong>{item.name}</strong>
      <p>
        <b>{money(item.price || 0)}</b>
        {item.availability && item.availability > 1 ? (
          <span>{item.availability} available</span>
        ) : null}
      </p>
      <button
        aria-label={`Buy ${item.name}`}
        className="add-button"
        onClick={onBuy}
      >
        <Plus />
      </button>
    </article>
  );
}

function BoxesView({
  items,
  loading,
  error,
  onSelect,
}: {
  items: CatalogItem[];
  loading: boolean;
  error: string;
  onSelect: (item: CatalogItem) => void;
}) {
  return <div className="page-in"><PackBrowser items={items} loading={loading} error={error} onSelect={onSelect} onRetry={() => window.location.reload()} /></div>;
}

function BoxCard({
  item,
  onSelect,
}: {
  item: CatalogItem;
  onSelect: () => void;
}) {
  return <PackCard item={item} onSelect={onSelect} />;
}

function ShipmentCard({ shipment }: { shipment: Shipment }) {
  const itemCount = shipment.holdings.reduce(
    (sum, holding) => sum + holding.quantity,
    0,
  );
  const first = shipment.holdings[0];
  return (
    <article className="shipment-card">
      <div className="shipment-images">
        {shipment.holdings.slice(0, 3).map((holding) => (
          <span key={holding.id}>
            <ProductImage
              src={holding.image}
              alt={holding.name}
              sizes="96px"
              boost={needsArtBoost(holding.name, holding.grade)}
            />
          </span>
        ))}
      </div>
      <section>
        <span>{shipment.status}</span>
        <strong>
          {itemCount === 1 ? first.name : `${itemCount} collectibles`}
        </strong>
        <small>
          {shipment.carrier} {shipment.service} · {shipment.destination}
        </small>
        <p>
          <b>{shipment.tracking}</b>
          <time dateTime={shipment.date}>
            {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
            }).format(new Date(shipment.date))}
          </time>
        </p>
      </section>
    </article>
  );
}

function CollectionView({
  holdings,
  shipments,
  value,
  section,
  onSection,
  onRedeem,
  onSelectHolding,
}: {
  holdings: Holding[];
  shipments: Shipment[];
  value: number;
  section: "owned" | "shipped";
  onSection: (section: "owned" | "shipped") => void;
  onRedeem: () => void;
  onSelectHolding: (holding: Holding) => void;
}) {
  const itemCount = holdings.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="page-in">
      <div className="collection-title">
        <div>
          <h1>Collection</h1>
          <span>
            {section === "owned"
              ? `${itemCount} items`
              : `${shipments.length} shipments`}
          </span>
        </div>
        {section === "owned" ? <strong>{money(value)}</strong> : null}
      </div>
      <nav className="collection-tabs" aria-label="Collection sections">
        <button
          className={section === "owned" ? "active" : ""}
          onClick={() => onSection("owned")}
        >
          Collection<span>{itemCount}</span>
        </button>
        <button
          className={section === "shipped" ? "active" : ""}
          onClick={() => onSection("shipped")}
        >
          Shipped<span>{shipments.length}</span>
        </button>
      </nav>
      {section === "owned" ? (
        <>
          <section className="redemption-card">
            <span>
              <Truck />
            </span>
            <div>
              <strong>Ship from your vault</strong>
              <small>UPS &amp; USPS rates</small>
            </div>
            <button disabled={!holdings.length} onClick={onRedeem}>
              Start shipment
              <ArrowRight />
            </button>
          </section>
          {!holdings.length ? (
            <Empty message="Open a pack or shop to start your Collection." />
          ) : null}
          <div className="collection-grid">
            {holdings.map((holding) => (
              <HoldingCard
                key={`${holding.id}-${holding.session ? "session" : "live"}`}
                holding={holding}
                onSelect={() => onSelectHolding(holding)}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          {!shipments.length ? <Empty message="No shipments yet." /> : null}
          <div className="shipment-list">
            {shipments.map((shipment) => (
              <ShipmentCard key={shipment.id} shipment={shipment} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ActivityThumb({ entry }: { entry: SessionActivity }) {
  const images = (entry.images?.length ? entry.images : [entry.image]).filter(
    (image): image is string => Boolean(image),
  );
  if (images.length) {
    return (
      <span className="activity-images">
        {images.slice(0, 3).map((image, index) => (
          <i key={`${image}-${index}`}>
            <ProductImage
              src={image}
              alt=""
              sizes="46px"
              boost={needsArtBoost(entry.title)}
            />
          </i>
        ))}
      </span>
    );
  }
  return (
    <span>
      {entry.type === "sell" ? (
        <Banknote />
      ) : entry.type === "keep" ? (
        <PackageCheck />
      ) : entry.type === "box" ? (
        <Box />
      ) : entry.type === "redemption" ? (
        <Truck />
      ) : (
        <ShoppingBag />
      )}
    </span>
  );
}

function ActivityView({
  sessionActivity,
}: {
  sessionActivity: SessionActivity[];
}) {
  const all = [...sessionActivity].sort(
    (left, right) =>
      new Date(right.date).getTime() - new Date(left.date).getTime(),
  );
  return (
    <div className="page-in">
      <PageTitle title="Activity" />
      {!all.length ? <Empty message="No activity yet." /> : null}
      <div className="activity-list">
        {all.map((entry) => (
          <div className="activity-row" key={entry.id}>
            <ActivityThumb entry={entry} />
            <div>
              <strong>{entry.title}</strong>
              <small>{entry.subtitle}</small>
            </div>
            <em>{entry.status}</em>
            <b className={entry.amount > 0 ? "credit" : ""}>
              {entry.amount === 0
                ? "—"
                : `${entry.amount > 0 ? "+" : ""}${money(entry.amount)}`}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketDepth({
  productKey,
  name,
  orders,
}: {
  productKey: string;
  name: string;
  orders: MarketOrder[];
}) {
  const productOrders = orders.filter(
    (order) =>
      order.status === "Open" && marketOrderMatches(order, productKey, name),
  );
  const listings = productOrders
    .filter((order) => order.side === "listing")
    .sort((left, right) => left.price - right.price);
  const offers = productOrders
    .filter((order) => order.side === "offer")
    .sort((left, right) => right.price - left.price);
  if (!listings.length && !offers.length) return null;
  return (
    <section className="market-depth">
      <h2>Market</h2>
      <div>
        {listings.length ? (
          <article>
            <header>
              <span>Listings</span>
              <small>Price · Qty</small>
            </header>
            {listings.map((order) => (
              <p className="session-depth" key={order.id}>
                <b>{money(order.price)}</b>
                <span>{order.quantity}</span>
                <small>You</small>
              </p>
            ))}
          </article>
        ) : null}
        {offers.length ? (
          <article>
            <header>
              <span>Offers</span>
              <small>Price · Qty</small>
            </header>
            {offers.map((order) => (
              <p className="session-depth" key={order.id}>
                <b>{money(order.price)}</b>
                <span>{order.quantity}</span>
                <small>You</small>
              </p>
            ))}
          </article>
        ) : null}
      </div>
    </section>
  );
}

function HoldingDetail({
  holding,
  activity,
  orders,
  onClose,
  onList,
  onShip,
}: {
  holding: Holding;
  activity: SessionActivity[];
  orders: MarketOrder[];
  onClose: () => void;
  onList: () => void;
  onShip: () => void;
}) {
  
  return (
    <LiveModal title="Demo collectible" className="holding-modal dyli-demo-modal" header={null} onClose={onClose}>
        <header>
          <button aria-label="Close collectible" onClick={onClose}>
            <X />
          </button>
          <span>Collectible</span>
        </header>
        <div className="holding-detail-body">
          <div className="holding-detail-art">
            <ProductImage
              src={holding.image}
              alt={holding.name}
              sizes="(max-width: 660px) 76vw, 340px"
              priority
              boost={needsArtBoost(holding.name, holding.grade)}
            />
          </div>
          <div className="holding-detail-copy">
            <small>{holding.brand}</small>
            <h1>{holding.name}</h1>
            <strong>{money(holding.value)}</strong>
            <div className="holding-metadata">
              <p>
                <span>Grade</span>
                <b>{holding.grade}</b>
              </p>
              <p>
                <span>Quantity</span>
                <b>{holding.quantity}</b>
              </p>
              <p>
                <span>Collection value</span>
                <b>{money(holding.value * holding.quantity)}</b>
              </p>
            </div>
            <MarketDepth
              productKey={holding.catalogId || holding.id}
              name={holding.name}
              orders={orders}
            />
            {activity.length ? (
              <section className="holding-activity">
                <h2>Activity</h2>
                {activity.slice(0, 4).map((entry) => (
                  <div key={entry.id}>
                    <span>{entry.status}</span>
                    <small>{entry.subtitle}</small>
                    <time dateTime={entry.date}>
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(entry.date))}
                    </time>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        </div>
        <footer>
          <button onClick={onList}>List</button>
          <button onClick={onShip}>Ship</button>
        </footer>
      </LiveModal>
  );
}

function ProductDetail(props: Parameters<typeof CollectibleDetail>[0]) {
  return isBox(props.item)
    ? <LiveProductDetail item={props.item} onClose={props.onClose} onCheckout={props.onBuy} />
    : <CollectibleDetail {...props} />;
}

function CollectibleDetail({
  item,
  ownedHolding,
  orders,
  onClose,
  onBuy,
  onOffer,
  onList,
  onShip,
}: {
  item: CatalogItem;
  ownedHolding?: Holding;
  orders: MarketOrder[];
  onClose: () => void;
  onBuy: () => void;
  onOffer: () => void;
  onList: (holding: Holding) => void;
  onShip: (holding: Holding) => void;
}) {
  
  const [detail, setDetail] = useState<BoxData | null>(null);
  useEffect(() => {
    if (!isBox(item)) return;
    let active = true;
    void api<BoxData>(`/api/packs/${encodeURIComponent(item.id)}`)
      .then((payload) => active && setDetail(payload))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [item]);
  const box = detail?.box || record(item.raw);
  const chases = records(
    box.top_chase_cards || record(item.raw).top_chase_cards,
  );
  const odds = groupOddsBuckets(
    records(box.odds_buckets || record(item.raw).odds_buckets),
  );
  return (
    <LiveModal title="Demo collectible" className="detail-modal dyli-demo-modal" header={null} onClose={onClose}>
        <header>
          <button aria-label="Close details" onClick={onClose}>
            <ArrowLeft />
          </button>
          <span>{isBox(item) ? "Pack details" : "Product details"}</span>
        </header>
        <div className="detail-body">
          <div className="detail-art">
            <ProductImage
              src={item.image}
              alt={item.name}
              sizes="(max-width: 720px) 82vw, 500px"
              priority
              boost={
                !isBox(item) &&
                needsArtBoost(item.name, item.subcategory, item.category)
              }
            />
          </div>
          <div className="detail-copy">
            <small>
              {[item.brand, text(box.type || item.subcategory || item.category)]
                .filter(Boolean)
                .join(" · ")}
            </small>
            <h1>{item.name}</h1>
            <strong className="detail-price">{money(item.price || 0)}</strong>
            {isBox(item) ? (
              <>
                <div className="pack-stats">
                  <span>
                    <small>Inventory</small>
                    <strong>
                      {compact(
                        Number(box.inventory_count || item.availability || 0),
                      )}
                    </strong>
                  </span>
                  <span>
                    <small>Expected value</small>
                    <strong>
                      {money(
                        Number(
                          box.expected_value_usd ||
                            box.ev_usd ||
                            box.avg_item_value_usd ||
                            0,
                        ),
                      )}
                    </strong>
                  </span>
                  <span>
                    <small>Sell back</small>
                    <strong>
                      {Math.round(Number(box.buyback_rate || 0) * 100)}%
                    </strong>
                  </span>
                </div>
                {chases.length ? (
                  <section className="detail-section">
                    <h2>Top pulls</h2>
                    <div className="chase-strip">
                      {chases.slice(0, 6).map((chase) => (
                        <article
                          key={`${text(chase.token_id)}-${text(chase.name)}`}
                        >
                          <span>
                            <ProductImage
                              src={imageFor(chase)}
                              alt={nameFor(chase)}
                              sizes="150px"
                              boost={needsArtBoost(
                                nameFor(chase),
                                chase.subcategory,
                                chase.category,
                              )}
                            />
                          </span>
                          <strong>{nameFor(chase)}</strong>
                          <small>
                            {money(
                              Number(chase.fmv_usd || chase.box_price || 0),
                            )}
                          </small>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
                {odds.length ? (
                  <section className="detail-section odds-section">
                    <h2>Pull odds</h2>
                    <div className="odds-list">
                      {odds.map((bucket, index) => (
                        <div key={`${text(bucket.tier)}-${index}`}>
                          <span>{text(bucket.tier || "Pull")}</span>
                          <i>
                            {money(Number(bucket.min || 0))}–
                            {money(Number(bucket.max || 0))}
                          </i>
                          <strong>
                            {new Intl.NumberFormat("en-US", {
                              maximumFractionDigits: 2,
                            }).format(Number(bucket.percent || 0))}
                            %
                          </strong>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <>
                <MarketDepth
                  productKey={item.id}
                  name={item.name}
                  orders={orders}
                />
                <div className="item-facts">
                  <p>
                    <span>Category</span>
                    <strong>{item.category || "Collectible"}</strong>
                  </p>
                  <p>
                    <span>Available</span>
                    <strong>{item.availability ?? 1}</strong>
                  </p>
                  <p>
                    <span>Delivery</span>
                    <strong>Collection</strong>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        <footer>
          <span>
            {ownedHolding
              ? `${ownedHolding.quantity} in Vault`
              : `${compact(item.availability ?? 1)} available`}
          </span>
          <div className="detail-actions">
            {isBox(item) ? (
              <button onClick={onBuy}>
                Open pack
                <ArrowRight />
              </button>
            ) : ownedHolding ? (
              <>
                <button
                  className="secondary"
                  onClick={() => onList(ownedHolding)}
                >
                  List
                </button>
                <button onClick={() => onShip(ownedHolding)}>
                  Ship
                  <ArrowRight />
                </button>
              </>
            ) : (
              <>
                <button className="secondary" onClick={onOffer}>
                  Make offer
                </button>
                <button onClick={onBuy}>
                  Buy now
                  <ArrowRight />
                </button>
              </>
            )}
          </div>
        </footer>
      </LiveModal>
  );
}

function MarketOrderModal({
  intent,
  onClose,
  onSubmit,
}: {
  intent: MarketIntent;
  onClose: () => void;
  onSubmit: (price: number, quantity: number) => void;
}) {
  
  const startingPrice =
    intent.side === "offer"
      ? Math.max(0.01, intent.referencePrice * 0.9)
      : Math.max(0.01, intent.referencePrice);
  const [price, setPrice] = useState(startingPrice.toFixed(2));
  const [quantity, setQuantity] = useState(1);
  const numericPrice = Number(price);
  const valid = Number.isFinite(numericPrice) && numericPrice > 0;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (valid) onSubmit(numericPrice, quantity);
  };
  return (
    <LiveModal title="Demo order" className="order-modal dyli-demo-modal" header={null} onClose={onClose}>
        <header>
          <button aria-label="Close order" onClick={onClose}>
            <X />
          </button>
          <span>{intent.side === "listing" ? "List" : "Make offer"}</span>
        </header>
        <form onSubmit={submit}>
          <div className="order-product">
            <span>
              <ProductImage
                src={intent.image}
                alt={intent.name}
                sizes="80px"
                boost={needsArtBoost(intent.name)}
              />
            </span>
            <div>
              <small>
                {intent.side === "listing" ? "From your Vault" : "Open offer"}
              </small>
              <strong>{intent.name}</strong>
            </div>
          </div>
          <label className="price-field">
            <span>Price per item</span>
            <div>
              <i>$</i>
              <input
                autoFocus
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
              <small>USD</small>
            </div>
          </label>
          {intent.maxQuantity > 1 ? (
            <div className="order-quantity">
              <span>Quantity</span>
              <div>
                <button
                  aria-label="Decrease quantity"
                  type="button"
                  disabled={quantity <= 1}
                  onClick={() =>
                    setQuantity((current) => Math.max(1, current - 1))
                  }
                >
                  <Minus />
                </button>
                <b>{quantity}</b>
                <button
                  aria-label="Increase quantity"
                  type="button"
                  disabled={quantity >= intent.maxQuantity}
                  onClick={() =>
                    setQuantity((current) =>
                      Math.min(intent.maxQuantity, current + 1),
                    )
                  }
                >
                  <Plus />
                </button>
              </div>
            </div>
          ) : null}
          <div className="order-total">
            <span>
              {intent.side === "listing" ? "Listing value" : "Offer total"}
            </span>
            <strong>{valid ? money(numericPrice * quantity) : "—"}</strong>
          </div>
          <button className="order-submit" disabled={!valid} type="submit">
            {intent.side === "listing" ? "List now" : "Place offer"}
            <ArrowRight />
          </button>
        </form>
      </LiveModal>
  );
}

function StripeShippingAddress({
  profileName,
  onChange,
}: {
  profileName: string;
  onChange: (address: ShippingAddress, complete: boolean) => void;
}) {
  const options: StripeAddressElementOptions = {
    mode: "shipping",
    allowedCountries: ["US"],
    blockPoBox: true,
    autocomplete: googleMapsApiKey
      ? { mode: "google_maps_api", apiKey: googleMapsApiKey }
      : { mode: "automatic" },
    defaultValues: { name: profileName, address: { country: "US" } },
  };
  const handleChange = (event: StripeAddressElementChangeEvent) => {
    const address = event.value.address;
    onChange(
      {
        name: event.value.name,
        line1: address.line1,
        line2: address.line2 || "",
        city: address.city,
        state: address.state,
        postalCode: address.postal_code,
      },
      event.complete,
    );
  };
  return <AddressElement options={options} onChange={handleChange} />;
}

function NativeShippingAddress({
  address,
  onChange,
}: {
  address: ShippingAddress;
  onChange: (address: ShippingAddress, complete: boolean) => void;
}) {
  const update = (field: keyof ShippingAddress, value: string) => {
    const next = { ...address, [field]: value };
    onChange(
      next,
      Boolean(
        next.name && next.line1 && next.city && next.state && next.postalCode,
      ),
    );
  };
  return (
    <div className="native-address">
      <label>
        <span>Name</span>
        <input
          required
          autoComplete="shipping name"
          value={address.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </label>
      <label>
        <span>Address</span>
        <input
          required
          autoComplete="shipping address-line1"
          value={address.line1}
          onChange={(event) => update("line1", event.target.value)}
        />
      </label>
      <label>
        <span>Apartment, suite, etc.</span>
        <input
          autoComplete="shipping address-line2"
          value={address.line2}
          onChange={(event) => update("line2", event.target.value)}
        />
      </label>
      <div>
        <label>
          <span>City</span>
          <input
            required
            autoComplete="shipping address-level2"
            value={address.city}
            onChange={(event) => update("city", event.target.value)}
          />
        </label>
        <label>
          <span>State</span>
          <input
            required
            autoComplete="shipping address-level1"
            value={address.state}
            onChange={(event) => update("state", event.target.value)}
          />
        </label>
        <label>
          <span>ZIP</span>
          <input
            required
            inputMode="numeric"
            autoComplete="shipping postal-code"
            value={address.postalCode}
            onChange={(event) => update("postalCode", event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

function RedemptionModal({
  holdings,
  profileName,
  initialHoldingId,
  onClose,
  onDone,
  onSubmit,
}: {
  holdings: Holding[];
  profileName: string;
  initialHoldingId: string;
  onClose: () => void;
  onDone: () => void;
  onSubmit: (
    selections: ShipmentSelection[],
    rate: ShippingRate,
    address: ShippingAddress,
    shippingCost: number,
  ) => void;
}) {
  
  const [selectedQuantities, setSelectedQuantities] = useState<
    Record<string, number>
  >(initialHoldingId ? { [initialHoldingId]: 1 } : {});
  const [rateId, setRateId] = useState(SHIPPING_RATES[0].id);
  const [address, setAddress] = useState<ShippingAddress>({
    name: profileName,
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const [addressComplete, setAddressComplete] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesReady, setRatesReady] = useState(false);
  const [shipment, setShipment] = useState<{
    holdings: Holding[];
    rate: ShippingRate;
    address: ShippingAddress;
  } | null>(null);
  const rateTimer = useRef<number | null>(null);
  const selections = Object.entries(selectedQuantities).map(
    ([holdingId, quantity]) => ({ holdingId, quantity }),
  );
  const selectedCount = selections.reduce(
    (sum, selection) => sum + selection.quantity,
    0,
  );
  const rate =
    SHIPPING_RATES.find((option) => option.id === rateId) || SHIPPING_RATES[0];
  const shippingCost = rate.price + Math.max(0, selectedCount - 1) * 1.25;
  useEffect(
    () => () => {
      if (rateTimer.current) window.clearTimeout(rateTimer.current);
    },
    [],
  );
  const updateAddress = (next: ShippingAddress, complete: boolean) => {
    setAddress(next);
    setAddressComplete(complete);
    setRatesReady(false);
    if (rateTimer.current) window.clearTimeout(rateTimer.current);
    if (!complete) {
      setRatesLoading(false);
      return;
    }
    setRatesLoading(true);
    rateTimer.current = window.setTimeout(() => {
      setRatesLoading(false);
      setRatesReady(true);
    }, 650);
  };
  const toggleHolding = (holding: Holding) => {
    setSelectedQuantities((current) => {
      if (current[holding.id]) {
        const next = { ...current };
        delete next[holding.id];
        return next;
      }
      return { ...current, [holding.id]: 1 };
    });
  };
  const changeQuantity = (holding: Holding, change: number) => {
    setSelectedQuantities((current) => ({
      ...current,
      [holding.id]: Math.max(
        1,
        Math.min(holding.quantity, (current[holding.id] || 1) + change),
      ),
    }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCount || !addressComplete || !ratesReady) return;
    const selectedHoldings = selections.flatMap((selection) => {
      const holding = holdings.find((item) => item.id === selection.holdingId);
      return holding ? [{ ...holding, quantity: selection.quantity }] : [];
    });
    setShipment({ holdings: selectedHoldings, rate, address });
    onSubmit(selections, rate, address, shippingCost);
  };
  return (
    <LiveModal title="Demo shipping" className="redemption-modal dyli-demo-modal" header={null} onClose={onClose}>
        <header>
          <button
            aria-label="Close shipment"
            onClick={shipment ? onDone : onClose}
          >
            <X />
          </button>
          <span>Get shipped</span>
        </header>
        {shipment ? (
          <div className="redemption-complete">
            <div className="redemption-complete-images">
              {shipment.holdings.slice(0, 3).map((holding) => (
                <span key={holding.id}>
                  <ProductImage
                    src={holding.image}
                    alt={holding.name}
                    sizes="110px"
                    boost={needsArtBoost(holding.name, holding.grade)}
                  />
                </span>
              ))}
            </div>
            <h1>On its way.</h1>
            <strong>
              {shipment.holdings.reduce(
                (sum, holding) => sum + holding.quantity,
                0,
              ) === 1
                ? shipment.holdings[0].name
                : `${shipment.holdings.reduce((sum, holding) => sum + holding.quantity, 0)} collectibles`}
            </strong>
            <p>
              {shipment.rate.carrier} {shipment.rate.service} ·{" "}
              {shipment.address.city}, {shipment.address.state}
            </p>
            <button onClick={onDone}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <section className="redeem-section">
              <div className="redeem-heading">
                <h2>Collectibles</h2>
                <span>{selectedCount} selected</span>
              </div>
              <div className="redeem-items">
                {holdings.map((holding) => {
                  const selectedQuantity = selectedQuantities[holding.id] || 0;
                  return (
                    <article
                      className={selectedQuantity ? "active" : ""}
                      key={holding.id}
                    >
                      <button
                        type="button"
                        className="redeem-select"
                        aria-pressed={Boolean(selectedQuantity)}
                        onClick={() => toggleHolding(holding)}
                      >
                        <span>
                          <ProductImage
                            src={holding.image}
                            alt={holding.name}
                            sizes="64px"
                            boost={needsArtBoost(holding.name, holding.grade)}
                          />
                        </span>
                        <div>
                          <strong>{holding.name}</strong>
                          <small>
                            {holding.grade} · {holding.quantity} available
                          </small>
                        </div>
                        <Check />
                      </button>
                      {selectedQuantity && holding.quantity > 1 ? (
                        <div className="redeem-quantity">
                          <button
                            type="button"
                            aria-label={`Decrease ${holding.name} quantity`}
                            disabled={selectedQuantity <= 1}
                            onClick={() => changeQuantity(holding, -1)}
                          >
                            <Minus />
                          </button>
                          <b>{selectedQuantity}</b>
                          <button
                            type="button"
                            aria-label={`Increase ${holding.name} quantity`}
                            disabled={selectedQuantity >= holding.quantity}
                            onClick={() => changeQuantity(holding, 1)}
                          >
                            <Plus />
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
            <section className="redeem-section">
              <h2>Shipping address</h2>
              <div className="stripe-address-shell">
                <MapPin />
                {stripePromise ? (
                  <Elements
                    stripe={stripePromise}
                    options={{
                      appearance: {
                        theme: "flat",
                        variables: {
                          colorPrimary: "#111216",
                          colorText: "#111216",
                          colorDanger: "#ca4452",
                          colorBackground: "#ffffff",
                          borderRadius: "11px",
                          fontFamily: "Arial, sans-serif",
                          spacingUnit: "4px",
                        },
                      },
                    }}
                  >
                    <StripeShippingAddress
                      profileName={profileName}
                      onChange={updateAddress}
                    />
                  </Elements>
                ) : (
                  <NativeShippingAddress
                    address={address}
                    onChange={updateAddress}
                  />
                )}
              </div>
            </section>
            {addressComplete ? (
              <section className="redeem-section delivery-section">
                <h2>Delivery</h2>
                {ratesLoading ? (
                  <div className="rates-loading">
                    <LoaderCircle />
                    <span>Getting rates</span>
                  </div>
                ) : ratesReady ? (
                  <div className="shipping-rates">
                    {SHIPPING_RATES.map((option) => (
                      <button
                        type="button"
                        className={option.id === rateId ? "active" : ""}
                        aria-pressed={option.id === rateId}
                        key={option.id}
                        onClick={() => setRateId(option.id)}
                      >
                        <i>{option.carrier}</i>
                        <span>
                          <strong>{option.service}</strong>
                          <small>{option.eta}</small>
                        </span>
                        <b>
                          {money(
                            option.price +
                              Math.max(0, selectedCount - 1) * 1.25,
                          )}
                        </b>
                        <Check />
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
            {ratesReady ? (
              <div className="redemption-total">
                <span>Shipping</span>
                <strong>{money(shippingCost)}</strong>
              </div>
            ) : null}
            <button
              className="ship-button"
              disabled={!selectedCount || !addressComplete || !ratesReady}
              type="submit"
            >
              {!selectedCount
                ? "Select collectibles"
                : !addressComplete
                  ? "Complete address"
                  : ratesLoading
                    ? "Getting rates…"
                    : "Get shipped"}
              {ratesLoading ? <LoaderCircle /> : <ArrowRight />}
            </button>
          </form>
        )}
      </LiveModal>
  );
}

function Checkout({
  item,
  quantity,
  payment,
  balance,
  stage,
  preferences,
  onPreferences,
  onQuantity,
  onPayment,
  onClose,
  onCheckout,
  onCollection,
}: {
  item: CatalogItem;
  quantity: number;
  payment: PaymentMethod;
  balance: number;
  stage: "checkout" | "processing" | "success";
  preferences: OpeningPreferences;
  onPreferences: (value: OpeningPreferences) => void;
  onQuantity: (value: number) => void;
  onPayment: (value: PaymentMethod) => void;
  onClose: () => void;
  onCheckout: () => void;
  onCollection: () => void;
}) {
  
  const subtotal = (item.price || 0) * quantity;
  const total = subtotal + PLATFORM_FEE;
  return (
    <LiveModal title="Demo checkout" className="checkout-modal dyli-demo-modal" header={null} onClose={onClose} dismissible={stage !== "processing"}>
        <header>
          <button
            aria-label="Close checkout"
            onClick={onClose}
            disabled={stage === "processing"}
          >
            <X />
          </button>
          <span>Demo checkout</span>
        </header>
        {stage === "processing" ? (
          <div className="store-checkout-processing">
            <LoaderCircle />
            <strong>
              {isBox(item) ? "Opening next…" : "Adding to Collection…"}
            </strong>
          </div>
        ) : stage === "success" ? (
          <div className="store-checkout-success">
            <span>
              <Check />
            </span>
            <strong>Added to Collection</strong>
            <button onClick={onCollection}>View collection</button>
          </div>
        ) : (
          <div className="checkout-body">
            <div className="checkout-item">
              <span>
                <ProductImage
                  src={item.image}
                  alt={item.name}
                  sizes="110px"
                  boost={needsArtBoost(
                    item.name,
                    item.subcategory,
                    item.category,
                  )}
                />
              </span>
              <div>
                <small>{item.brand || item.category}</small>
                <strong>{item.name}</strong>
                <b>{money(item.price || 0)}</b>
              </div>
            </div>
            <div className="quantity-control">
              <span>Quantity</span>
              <div>
                <button
                  aria-label="Decrease quantity"
                  onClick={() => onQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus />
                </button>
                <b>{quantity}</b>
                <button
                  aria-label="Increase quantity"
                  onClick={() =>
                    onQuantity(Math.min(maxQuantity(item), quantity + 1))
                  }
                  disabled={quantity >= maxQuantity(item)}
                >
                  <Plus />
                </button>
              </div>
            </div>
            {isBox(item) && <RevealModeSelector value={preferences} onChange={onPreferences} quantity={quantity} />}
            <div className="payment-options">
              <button
                className={payment === "card" ? "active" : ""}
                onClick={() => onPayment("card")}
              >
                <CreditCard />
                <span>
                  <strong>Card</strong>
                </span>
                {payment === "card" ? <Check /> : null}
              </button>
              <button
                className={payment === "balance" ? "active" : ""}
                onClick={() => onPayment("balance")}
              >
                <WalletCards />
                <span>
                  <strong>Balance</strong>
                  <small>{money(balance)}</small>
                </span>
                {payment === "balance" ? <Check /> : null}
              </button>
            </div>
            <div className="checkout-lines">
              <p>
                <span>Items</span>
                <b>{money(subtotal)}</b>
              </p>
              <p>
                <span>Storefront fee</span>
                <b>{money(PLATFORM_FEE)}</b>
              </p>
            </div>
            <div className="total-row">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
            <button className="pay-button" onClick={onCheckout}>
              {isBox(item) ? "Open demo pack" : "Complete demo purchase"}
              <span>{money(total)}</span>
            </button>
          </div>
        )}
      </LiveModal>
  );
}



function ProductImage({
  src,
  alt,
  sizes,
  priority = false,
  boost,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  boost?: boolean;
}) {
  return src ? (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={(boost ?? needsArtBoost(alt)) ? "asset-boost" : undefined}
    />
  ) : (
    <span className="image-empty">
      <Layers3 />
    </span>
  );
}
function Empty({ message }: { message: string }) {
  return (
    <div className="empty">
      <Layers3 />
      <span>{message}</span>
    </div>
  );
}
function CardSkeleton() {
  return (
    <div className="product-grid">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="card-skeleton" key={index}>
          <span />
          <i />
          <b />
        </div>
      ))}
    </div>
  );
}
