import type { ApiRecord } from "./types";

export type AbstractPaymaster = { chainId: 2741 | 11124; address: `0x${string}`; input: `0x${string}` };

export function parseAbstractPaymaster(wallet: ApiRecord | undefined): AbstractPaymaster | null {
  const gas = wallet?.gas_sponsorship as ApiRecord | undefined;
  if (!gas || gas.available !== true) return null;
  const chainId = Number(wallet?.chain_id);
  const address = String(gas.paymaster || "").toLowerCase();
  const input = String(gas.paymaster_input || "");
  if (gas.provider !== "abstract_paymaster" || ![2741, 11124].includes(chainId) ||
      gas.chain_id !== chainId || !/^0x[a-f\d]{40}$/.test(address) || /^0x0{40}$/.test(address) ||
      input !== `0x8c5a3445${"20".padStart(64, "0")}${"0".repeat(64)}`) {
    throw new Error("DYLI returned invalid gas sponsorship settings");
  }
  return { chainId: chainId as 2741 | 11124, address: address as `0x${string}`, input: input as `0x${string}` };
}

// Explicit public allowlist: never serialize an upstream response or env wholesale.
export type CommerceRuntime = {
  authMode: "dyli_managed" | "partner" | "existing";
  appId: string;
  chainId: 2741 | 11124;
  allowedOrigins: string[];
  storefrontOrigin: string | null;
  sponsorTransactions: boolean;
  paymaster?: AbstractPaymaster | null;
  name: string;
  boxesOnly: boolean;
};

export function shopEnabled(readiness: ApiRecord, boxesOnlyOverride = false) {
  const partner = readiness.partner as ApiRecord | undefined;
  const rules = partner?.catalog_rules as ApiRecord | undefined;
  return !boxesOnlyOverride && rules?.show_explore !== false &&
    !(rules?.show_primary === false && rules?.show_secondary === false);
}

export function parseCommerceRuntime(payload: ApiRecord): CommerceRuntime {
  const auth = payload.auth as ApiRecord | undefined;
  const wallet = payload.wallet as ApiRecord | undefined;
  const storefront = payload.storefront as ApiRecord | undefined;
  if (payload.bootstrap_version !== 1 || ![2741, 11124].includes(Number(wallet?.chain_id))) {
    throw new Error("Connect a DYLI environment with Commerce bootstrap v1 enabled");
  }
  if (auth?.mode === "existing" && auth.available === true) {
    const origin = typeof auth.storefront_origin === "string" ? auth.storefront_origin : null;
    if (!origin || new URL(origin).protocol !== "https:") throw new Error("Register a storefront origin with DYLI");
    return {
      authMode: "existing", appId: "", chainId: Number(wallet?.chain_id) as 2741 | 11124,
      allowedOrigins: [origin], storefrontOrigin: origin, sponsorTransactions: false,
      paymaster: parseAbstractPaymaster(wallet),
      name: typeof storefront?.name === "string" ? storefront.name : "Vaulted",
      boxesOnly: storefront?.boxes_only === true,
    };
  }
  if (auth?.mode !== "dyli_managed" || auth.available !== true || typeof auth.app_id !== "string" || !auth.app_id) {
    throw new Error("Ask DYLI to activate managed sign-in for this storefront");
  }
  const origins = Array.isArray(auth.allowed_origins) ? auth.allowed_origins.filter((value): value is string => typeof value === "string") : [];
  const origin = typeof auth.storefront_origin === "string" ? auth.storefront_origin : null;
  if (!origin || !origins.includes(origin)) throw new Error("DYLI must register a storefront origin before checkout");
  return {
    authMode: "dyli_managed", appId: auth.app_id,
    chainId: Number(wallet?.chain_id) as 2741 | 11124,
    allowedOrigins: origins, storefrontOrigin: origin,
    sponsorTransactions: false,
    paymaster: parseAbstractPaymaster(wallet),
    name: typeof storefront?.name === "string" ? storefront.name : "Vaulted",
    boxesOnly: storefront?.boxes_only === true,
  };
}

export function registeredCheckoutOrigin(runtime: CommerceRuntime, configured: string | undefined, requestUrl: string, production: boolean) {
  // Remote callbacks require registration; loopback may target the dev port.
  // Production never derives a redirect destination from Host or forwarded headers.
  const candidate = (!production && isLoopbackCheckoutUrl(new URL(requestUrl)))
    ? new URL(requestUrl).origin : configured || runtime.storefrontOrigin;
  if (!candidate) throw new Error("A registered storefront origin is required");
  const parsed = new URL(candidate);
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash ||
      (parsed.protocol !== "https:" && !isLoopbackCheckoutUrl(parsed))) {
    throw new Error("A valid storefront origin is required");
  }
  if (!isLoopbackCheckoutUrl(parsed) && !runtime.allowedOrigins.includes(parsed.origin) && parsed.origin !== runtime.storefrontOrigin) {
    throw new Error("Register this storefront origin with DYLI before checkout");
  }
  return parsed.origin;
}

function isLoopbackCheckoutUrl(url: URL) {
  return ["http:", "https:"].includes(url.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function checkoutReturnUrls(runtime: CommerceRuntime, requestedUrl: unknown, fallbackOrigin?: string) {
  const raw = requestedUrl === undefined ? fallbackOrigin || runtime.storefrontOrigin : requestedUrl;
  if (typeof raw !== "string" || !raw || raw.length > 1800 || raw !== raw.trim()) {
    throw new Error("A valid checkout return URL is required");
  }
  const url = new URL(raw);
  if (url.username || url.password ||
      (url.protocol !== "https:" && !isLoopbackCheckoutUrl(url)) ||
      (!isLoopbackCheckoutUrl(url) && !runtime.allowedOrigins.includes(url.origin) && url.origin !== runtime.storefrontOrigin)) {
    throw new Error("Use your registered storefront or localhost for checkout");
  }
  // The browser supplies its page URL, not the API's Host/forwarded headers.
  // Loopback is a navigation destination only; no server request is made to it.
  url.searchParams.delete("session_id");
  url.searchParams.set("checkout", "cancelled");
  const cancelUrl = url.href;
  url.searchParams.set("checkout", "success");
  url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  return { cancelUrl, successUrl: url.href.replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}") };
}
