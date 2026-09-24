import { apiErrorResponse, commerce } from "@/lib/dyli";
import { AuthError, authErrorResponse } from "@/lib/privy-server";
import { requireLiveContext, requestKey } from "@/lib/live-server";
import type { ApiRecord } from "@/lib/types";
import { ensureCommunitySettings } from "@/lib/community-server";

const uuid =
  /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const integer = /^(0|[1-9][0-9]{0,77})$/;
const respond = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "private, no-store" } });
const object = (value: unknown): ApiRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : {};

// A deliberately small allowlist, never an arbitrary authenticated proxy.
function marketQuery(body: ApiRecord) {
  const params = new URLSearchParams({
    kind: body.kind === "offer" ? "offer" : "listing",
  });
  params.set("q", String(body.q || "").slice(0, 100));
  for (const key of ["brand", "category", "subcategory", "seller", "min_price", "max_price", "sort"]) {
    if (body[key] === undefined || body[key] === "") continue;
    if (typeof body[key] !== "string" || body[key].length > 80)
      throw new AuthError(400, "Invalid marketplace filter");
    params.set(key, body[key].trim());
  }
  for (const key of ["min_price", "max_price"]) {
    const value = params.get(key);
    if (value !== null && (!/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/.test(value) || Number(value) > 1000000))
      throw new AuthError(400, "Enter a price between 0 and 1,000,000");
  }
  if (params.has("min_price") && params.has("max_price") && Number(params.get("min_price")) > Number(params.get("max_price")))
    throw new AuthError(400, "Minimum price must not exceed maximum price");
  if (params.has("sort") && !["newest", "price_low", "price_high"].includes(params.get("sort")!))
    throw new AuthError(400, "Choose a valid sort order");
  if (body.tokenId !== undefined) {
    if (!integer.test(String(body.tokenId)))
      throw new AuthError(400, "Choose a valid collectible");
    params.set("token_id", String(body.tokenId));
  }
  const offset = Number(body.offset || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
    throw new AuthError(400, "Invalid page");
  params.set("offset", String(offset));
  return params;
}

export async function GET(request: Request) {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const params = marketQuery(query);
    await ensureCommunitySettings();
    // Discovery is public. Writes and personal history require a verified login.
    return respond(await commerce(`/community/market?${params}`));
  } catch (error) {
    return authErrorResponse(error) || apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = object(await request.json());
    const { identity } = await requireLiveContext(
      request,
      String(body.walletAddress || ""),
    );
    const external = identity.externalCustomerId;
    const action = String(body.action || "");
    // Receipt recovery remains available even if an owner is changing settings.
    if (["market", "collectors", "holdings", "trades", "prepare"].includes(action)) await ensureCommunitySettings();
    if (action === "market") {
      const params = marketQuery(body);
      if (body.mine === true) params.set("external_customer_id", external);
      return respond(await commerce(`/community/market?${params}`));
    }
    if (action === "collectors") {
      return respond(
        await commerce(
          `/community/collectors?q=${encodeURIComponent(String(body.q || "").slice(0, 50))}`,
        ),
      );
    }
    if (action === "holdings") {
      const username = String(body.collector || ""),
        page = Number(body.page || 1);
      if (
        !/^[a-zA-Z0-9_-]{1,50}$/.test(username) ||
        !Number.isInteger(page) ||
        page < 1 ||
        page > 100
      )
        throw new AuthError(400, "Choose a valid collector");
      return respond(
        await commerce(
          `/community/collectors/${encodeURIComponent(username)}/holdings?page=${page}`,
        ),
      );
    }
    if (action === "trades" || action === "history") {
      const params = marketQuery(body);
      const view = String(body.view || "all");
      if (!["all", "incoming", "outgoing", "history"].includes(view))
        throw new AuthError(400, "Choose a valid trade view");
      return respond(
        await commerce(
          `/community/${action === "trades" ? "trades" : "actions"}?external_customer_id=${encodeURIComponent(external)}&offset=${params.get("offset")}&view=${view}`,
        ),
      );
    }
    if (action === "prepare") {
      const input = object(body.input);
      // Only action terms cross the boundary. Identity always comes from login.
      const terms = Object.fromEntries(
        [
          "kind",
          "token_id",
          "quantity",
          "unit_amount",
          "expiration",
          "order_id",
          "expected_amount",
          "trade_id",
          "collector",
          "give",
          "receive",
          "give_usdc",
          "receive_usdc",
        ]
          .filter((key) => input[key] !== undefined)
          .map((key) => [key, input[key]]),
      );
      return respond(
        await commerce("/community/actions", {
          method: "POST",
          headers: {
            "Idempotency-Key": `community:${requestKey(body.idempotencyKey)}`,
          },
          body: JSON.stringify({ ...terms, external_customer_id: external }),
        }),
      );
    }
    if (action === "decline") {
      const id = String(body.tradeId || "");
      if (!integer.test(id)) throw new AuthError(400, "Choose a valid trade");
      return respond(
        await commerce(`/community/trades/${id}/decline`, {
          method: "POST",
          body: JSON.stringify({ external_customer_id: external }),
        }),
      );
    }
    if (action !== "get" && action !== "confirm")
      throw new AuthError(400, "Unknown marketplace action");
    const id = String(body.id || "");
    if (!uuid.test(id))
      throw new AuthError(400, "A valid action ID is required");
    const payload = await commerce(`/community/actions/${id}`);
    const saved = object(payload.action);
    if (
      saved.external_customer_id !== external ||
      String(saved.wallet_address).toLowerCase() !==
        identity.walletAddress.toLowerCase()
    ) {
      throw new AuthError(403, "This action does not belong to your account");
    }
    if (action === "get") return respond(payload);
    const hash = String(body.txHash || "");
    if (!/^0x[a-f\d]{64}$/i.test(hash))
      throw new AuthError(400, "A valid transaction reference is required");
    return respond(
      await commerce(`/community/actions/${id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ tx_hash: hash }),
      }),
    );
  } catch (error) {
    return authErrorResponse(error) || apiErrorResponse(error);
  }
}
