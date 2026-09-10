export type RevealMode = "normal" | "turbo";
export type AutoSellRarity = "common" | "uncommon" | "rare";
export type OpeningPreferences = {
  version: 1;
  mode: RevealMode;
  autoSell: Record<AutoSellRarity, boolean>;
  autoSkip: boolean;
};

export const openingPreferenceKey = (account: string) =>
  `vaulted:opening:v1:${account.trim().toLowerCase()}`;

// Only presentation preferences live here. Money, rewards and permission to
// settle remain in the verified purchase flow; auto-sell is opt-in.
export function normalizeOpeningPreferences(value?: unknown): OpeningPreferences {
  const input = value && typeof value === "object" ? value as Partial<OpeningPreferences> : {};
  const valid = input.version === 1;
  return {
    version: 1,
    mode: valid && input.mode === "turbo" ? "turbo" : "normal",
    autoSell: {
      common: valid && input.autoSell?.common === true,
      uncommon: valid && input.autoSell?.uncommon === true,
      rare: valid && input.autoSell?.rare === true,
    },
    autoSkip: valid && input.autoSkip === true,
  };
}

export function parseOpeningPreferences(raw: string | null) {
  try { return normalizeOpeningPreferences(raw ? JSON.parse(raw) : null); }
  catch { return normalizeOpeningPreferences(); }
}

export function shouldAutoSellPull(
  reward: { rarity?: string | null; buyback_amount: number },
  preferences: OpeningPreferences,
) {
  const rarity = reward.rarity?.trim().toLowerCase();
  return preferences.mode === "turbo" && Number.isFinite(reward.buyback_amount) &&
    reward.buyback_amount > 0 &&
    (rarity === "common" || rarity === "uncommon" || rarity === "rare") &&
    preferences.autoSell[rarity] === true;
}

export const shouldSkipOpening = (preferences: OpeningPreferences, quantity: number) =>
  preferences.mode === "turbo" && preferences.autoSkip && quantity > 1;

export function pendingAutoSellIndices(
  rewards: Array<{ rarity?: string | null; buyback_amount: number }>,
  decisions: Array<"claim" | "sell_back">,
  preferences: OpeningPreferences,
) {
  return rewards.flatMap((reward, index) => !decisions[index] && shouldAutoSellPull(reward, preferences) ? [index] : []);
}
