import type { ApiRecord } from "./types.ts";

export function revealClues(product: ApiRecord, rarity?: string | null) {
  const name = typeof product.name === "string" ? product.name : "";
  const year = String(
    product.year ||
      product.release_year ||
      name.match(/\b(?:19|20)\d{2}\b/)?.[0] ||
      "",
  );
  const match = name.match(/\b(PSA|CGC|BGS|TAG|SGC)\s+(\d+(?:\.\d+)?)\b/i);
  const grade = product.grade || match?.[2];
  const grader = product.grader || match?.[1];
  return [
    ...(typeof product.brand === "string" && product.brand.trim()
      ? [{ label: "Brand", value: product.brand.trim() }]
      : []),
    ...(year ? [{ label: "Year", value: year }] : []),
    ...(grade && grader
      ? [{ label: "Grade", value: `${grader} ${grade}` }]
      : []),
    ...(rarity ? [{ label: "Rarity", value: rarity }] : []),
  ];
}

export type ActivityRarityTone = "common" | "uncommon" | "rare" | "premium";
export type RevealStage = {
  kind: "box" | "detail" | "rarity" | "result";
  duration: number;
  detail?: { label: string; value: string };
};

export function rarityTone(rarity?: string | null): ActivityRarityTone {
  const label = rarity?.trim().toLowerCase() || "";
  if (
    /legend|mythic|epic|secret|rainbow|hyper|ultra|chase|grail|jackpot|god pack/.test(
      label,
    )
  )
    return "premium";
  if (/rare|holo|foil|hit/.test(label)) return "rare";
  return label.includes("uncommon") ? "uncommon" : "common";
}

export function openingBeats(product: ApiRecord) {
  const brand =
    typeof product.brand === "string"
      ? product.brand.trim().replace(/^pokemon$/i, "Pokémon")
      : "";
  const category =
    typeof product.category === "string" ? product.category.trim() : "";
  const sports = /sports|basketball|baseball|football|hockey/i.test(
    `${category} ${brand}`,
  );
  const clues = revealClues(product);
  const grade = clues.find((clue) => clue.label === "Grade");
  const detail =
    grade ||
    (product.condition
      ? { label: "Condition", value: String(product.condition) }
      : null);
  return [
    ...(!sports && (brand || category)
      ? [{ label: "Category", value: brand || category }]
      : []),
    ...(detail ? [detail] : []),
  ];
}

export function revealStages(
  product: ApiRecord,
  rarity: string | null | undefined,
  fast = false,
  autoSell = false,
): RevealStage[] {
  if (fast && autoSell) return [];
  const tier = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
    "mythical",
  ].indexOf(rarity?.toLowerCase() || "common");
  return [
    ...(!fast
      ? [
          { kind: "box" as const, duration: 3800 },
          ...openingBeats(product).map((detail, index) => ({
            kind: "detail" as const,
            duration: index === 0 ? 1050 : 1150 + (tier >= 3 ? 250 : 0),
            detail,
          })),
        ]
      : []),
    ...(rarity
      ? [
          {
            kind: "rarity" as const,
            duration: fast ? 500 : 1350 + Math.max(0, tier) * 260,
          },
        ]
      : []),
  ];
}

export function rarityAccent(rarity?: string | null) {
  const colors: Record<string, string> = {
    common: "#818b9d",
    uncommon: "#15a684",
    rare: "#4285ef",
    epic: "#9b68df",
    legendary: "#d9a32e",
    mythical: "#ed6298",
    mythic: "#ed6298",
  };
  return colors[rarity?.trim().toLowerCase() || ""] || colors.common;
}
