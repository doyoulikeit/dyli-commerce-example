import type { ApiRecord } from "@/lib/types";

type Env = Record<string, string | undefined>;

// Server-owned configuration. Never accept these rules from a shopper's request.
export function storefrontPolicy(env: Env = process.env) {
  const rawIds = env.INCLUDED_IDS?.trim();
  const includedIds = rawIds
    ? [...new Set(rawIds.split(",").map((id) => id.trim()))]
    : [];
  if (includedIds.length > 100 || includedIds.some((id) =>
    !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) {
    throw new Error("INCLUDED_IDS must contain up to 100 comma-separated positive box IDs");
  }
  const flat = env.FLAT_FEE?.trim();
  const percent = env.PERCENT_FEE?.trim();
  if (flat && percent) throw new Error("Set FLAT_FEE or PERCENT_FEE, not both");
  const raw = flat || percent;
  let feeRules: ApiRecord | undefined;
  if (raw) {
    const value = Number(raw);
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(value) ||
      value < 0 || value > (flat ? 100000 : 100)) {
      throw new Error("Box fees must be non-negative amounts with up to two decimals (percentage: 0–100)");
    }
    feeRules = {
      enabled: value > 0,
      type: flat ? "fixed" : "percent",
      fixed_amount: flat ? value : 0,
      percent: percent ? value : 0,
      per_unit: true,
      minimum: null,
      maximum: null,
      label: "Platform fee",
    };
  }
  return { includedIds, feeRules };
}

export function boxIsIncluded(id: unknown, env: Env = process.env) {
  const { includedIds } = storefrontPolicy(env);
  return includedIds.length === 0 || includedIds.includes(String(id));
}
