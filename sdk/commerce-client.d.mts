export type JsonObject = Record<string, unknown>;
export type ClientOptions = { apiKey: string; partnerSlug?: string; baseUrl?: string; fetch?: typeof globalThis.fetch; timeoutMs?: number };
export type RequestOptions = { method?: string; body?: JsonObject; headers?: HeadersInit; signal?: AbortSignal };
export class CommerceError extends Error { status: number; payload: JsonObject; requestId: string | null; }
export function createCommerceClient(options: ClientOptions): {
  request<T = JsonObject>(path: string, options?: RequestOptions): Promise<T>;
  readiness(): Promise<JsonObject>;
  bootstrap(): Promise<JsonObject>;
  verifySession(accessToken: string, walletAddress?: string): Promise<JsonObject>;
  quote(body: JsonObject, key: string): Promise<JsonObject>;
  stripeCheckout(quoteId: string, body: JsonObject, key: string): Promise<JsonObject>;
  createOrder(body: JsonObject, key: string): Promise<JsonObject>;
  openBox(orderId: string, key: string): Promise<JsonObject>;
  communitySettings(): Promise<JsonObject>;
  market(query?: Record<string, string>): Promise<JsonObject>;
  collectors(query: string): Promise<JsonObject>;
  collectorHoldings(username: string, page?: number): Promise<JsonObject>;
  trades(customer: string, offset?: number, view?: 'all' | 'incoming' | 'outgoing' | 'history'): Promise<JsonObject>;
  prepareCommunityAction(body: JsonObject, key: string): Promise<JsonObject>;
  communityAction(id: string): Promise<JsonObject>;
  communityActions(customer: string): Promise<JsonObject>;
  confirmCommunityAction(id: string, txHash: string): Promise<JsonObject>;
  declineTrade(id: string, customer: string): Promise<JsonObject>;
};
