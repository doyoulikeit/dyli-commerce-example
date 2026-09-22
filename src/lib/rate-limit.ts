import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { CommerceError, createCommerceClient } from "../../sdk/commerce-client.mjs";

type Env = Record<string, string | undefined>;
type Budget = "client-read" | "client-write" | "customer" | "upstream-read" | "upstream-write";

export class StorefrontLimitError extends Error {
  status: number;
  retryAfter: number;
  constructor(status: 429 | 503, retryAfter = 60) {
    super(status === 429 ? "Too many requests. Please wait a moment and try again." : "The storefront is temporarily unavailable. Please try again shortly.");
    this.name = "StorefrontLimitError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function rateLimitResponse(error: unknown) {
  if (!(error instanceof StorefrontLimitError)) return null;
  return Response.json({ error: error.message }, {
    status: error.status,
    headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "private, no-store" },
  });
}

export async function takeBudget(budget: Budget, subject = "storefront", options: {
  env?: Env;
  fetch?: typeof fetch;
  report?: (event: Record<string, unknown>) => void;
} = {}) {
  const env = options.env || process.env;
  const report = options.report || ((event) => console.warn(JSON.stringify(event)));
  const apiKey = env.DYLI_API_KEY?.trim();
  if (!apiKey) {
    if (env.NODE_ENV !== "production" && env.VERCEL !== "1") return;
    throw new StorefrontLimitError(503);
  }
  const started = Date.now();
  try {
    // Bypass commerce() to avoid recursion. DYLI keeps counters in its Supabase;
    // this app never receives database credentials or stores raw identities.
    const client = createCommerceClient({
      apiKey, baseUrl: env.DYLI_COMMERCE_BASE_URL, fetch: options.fetch, timeoutMs: 2000,
    });
    const subjectHash = createHmac("sha256", apiKey).update(subject).digest("hex");
    const result = await client.request<{ allowed: boolean }>("/storefront/limits", {
      method: "POST", body: { budget, subject_hash: subjectHash },
    });
    if (result.allowed === false) throw new StorefrontLimitError(429);
    if (result.allowed !== true) throw new StorefrontLimitError(503);
  } catch (error) {
    if (error instanceof StorefrontLimitError && error.status === 429) throw error;
    if (error instanceof CommerceError && error.status === 429) {
      const retry = Number(error.payload.retry_after_seconds);
      throw new StorefrontLimitError(429, Number.isInteger(retry) && retry > 0 && retry <= 60 ? retry : 60);
    }
    // Keep credentials, identities and upstream response bodies out of logs.
    report({
      event: "storefront_rate_limit_unavailable", budget, action: "continue",
      reason: error instanceof CommerceError ? "upstream_response"
        : error instanceof Error && error.name === "TimeoutError" ? "timeout"
        : error instanceof StorefrontLimitError ? "invalid_configuration_or_response" : "network",
      duration_ms: Date.now() - started,
      ...(error instanceof CommerceError ? { upstream_status: error.status, request_id: error.requestId } : {}),
    });
    // This extra storefront guard is best-effort. Authentication, ownership,
    // payment verification and DYLI's own API quotas still run on the request.
    // Never retry the protected operation here: it may submit a transaction.
  }
}

export function clientLimitSubject(request: Request, env: Env = process.env) {
  // Only trust headers the hosting proxy overwrites. Never trust arbitrary XFF.
  const header = env.VERCEL === "1" ? "x-vercel-forwarded-for" : env.STOREFRONT_CLIENT_IP_HEADER;
  const value = header ? request.headers.get(header)?.trim() : undefined;
  return value && isIP(value) ? value : "unidentified-client";
}

export async function limitRequest(request: Request) {
  const method = request.method.toUpperCase();
  await takeBudget(["GET", "HEAD", "OPTIONS"].includes(method) ? "client-read" : "client-write", clientLimitSubject(request));
}

export async function limitUpstream(method = "GET") {
  await takeBudget(["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) ? "upstream-read" : "upstream-write");
}
