export type ApiRecord = Record<string, unknown>;

export type PurchaseInstruction = {
  supported: boolean;
  action: string;
  reason: string | null;
  quoteItem: ApiRecord | null;
};

export type CatalogItem = {
  key: string;
  id: string;
  surface: CatalogSurface;
  type: string;
  name: string;
  description: string;
  image: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  currency: string;
  availability: number | null;
  purchase: PurchaseInstruction;
  raw: ApiRecord;
};

export type CatalogSurface =
  | "explore"
  | "listings"
  | "boxes"
  | "ebay"
  | "collections"
  | "fair-drops"
  | "digital-packs"
  | "redemptions"
  | "search";

export type StorefrontResponse = {
  readiness: ApiRecord;
  partner: ApiRecord;
  catalog: CatalogItem[];
  boxes: CatalogItem[];
  options: {
    brands: string[];
    categories: string[];
    subcategories: string[];
  };
};

export type Identity = {
  userId: string;
  externalCustomerId: string;
  walletAddress: string;
  email: string | null;
  name: string | null;
};

export type SessionResponse = {
  balance: {
    amount: string;
    currency: "USDC";
    token: `0x${string}`;
    chain_id: number;
  };
  identity: Identity;
  customer: ApiRecord | null;
  holdings: ApiRecord;
  orders: ApiRecord[];
  redemptions: ApiRecord[];
  boxPlays: BoxPlay[];
};

export type CheckoutResponse = {
  quote: ApiRecord;
  payment: ApiRecord;
  checkout: ApiRecord;
};

export type TransactionInstruction = {
  chain: "abstract";
  chain_id?: number;
  from: `0x${string}`;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  phase?: string;
};

export type BoxPlay = ApiRecord & {
  id: string;
  order_id: string;
  external_customer_id: string;
  box_id: number;
  wallet_address: string;
  status: string;
  quantity: number;
  buy_tx_hash?: string | null;
  rewards: Array<{
    index: number;
    product_id: number;
    token_id: string;
    product: ApiRecord;
    rarity: string | null;
    buyback_amount: number;
    disposition: "claim" | "sell_back" | null;
  }>;
  decisions: Array<"claim" | "sell_back">;
  dyli_order_ids: Array<string | number>;
  commit_tx_hash?: string | null;
  finalize_tx_hash?: string | null;
  reward?: ApiRecord | null;
  disposition?: "claim" | "sell_back" | null;
  dispositions?: Array<{
    type: "claim" | "sell_back";
    available: boolean;
    amount?: number | null;
    currency?: string | null;
  }>;
  transaction?: TransactionInstruction | null;
};

export type RedemptionItemInput = {
  tokenId: string;
  quantity: number;
};

export type Redemption = ApiRecord & {
  id: string;
  external_customer_id: string;
  wallet_address: string;
  items: ApiRecord[];
  address: ApiRecord;
  shipping_options?: Record<string, ApiRecord[]>;
  collection_requirements?: ApiRecord[];
  selected_shipping_option?: ApiRecord | null;
  pricing?: ApiRecord | null;
  payment?: ApiRecord | null;
  transaction?: TransactionInstruction | null;
  redemption_tx_hash?: string | null;
  status: string;
  expires_at?: string;
  result?: ApiRecord | null;
};

export type ShippingAddress = {
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
};
