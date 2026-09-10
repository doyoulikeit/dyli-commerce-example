import type { ApiRecord } from "./types";

const record = (value: unknown): ApiRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as ApiRecord : {};

// The key's account/config response is server-to-server, not a browser DTO.
// In particular, webhook URLs may themselves contain credentials.
export function publicStorefrontReadiness(payload: ApiRecord): ApiRecord {
  const capabilities = record(payload.capabilities);
  const box = record(capabilities.box_play);
  const partner = record(payload.partner);
  const rules = record(partner.catalog_rules);
  return {
    capabilities: {
      payments: Array.isArray(capabilities.payments)
        ? capabilities.payments.filter(value => value === "usdc" || value === "stripe_card") : [],
      box_play: { contract_version: box.contract_version === "gacha" ? "gacha" : null },
    },
    partner: {
      display_name: typeof partner.display_name === "string" ? partner.display_name : null,
      catalog_rules: {
        show_explore: rules.show_explore !== false,
        show_primary: rules.show_primary !== false,
        show_secondary: rules.show_secondary !== false,
      },
    },
  };
}
