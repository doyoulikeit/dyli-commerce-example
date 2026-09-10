import type { ApiRecord } from "./types.ts";

export function revealClues(product: ApiRecord, rarity?: string | null) {
  const name = typeof product.name === "string" ? product.name : "";
  const year = String(product.year || product.release_year || name.match(/\b(?:19|20)\d{2}\b/)?.[0] || "");
  const match = name.match(/\b(PSA|CGC|BGS|TAG|SGC)\s+(\d+(?:\.\d+)?)\b/i);
  const grade = product.grade || match?.[2];
  const grader = product.grader || match?.[1];
  return [
    ...(year ? [{ label: "Year", value: year }] : []),
    ...(grade && grader ? [{ label: "Grade", value: `${grader} ${grade}` }] : []),
    ...(rarity ? [{ label: "Rarity", value: rarity }] : []),
  ];
}

export function rarityAccent(rarity?: string | null) {
  const colors: Record<string, string> = { common: "#818b9d", uncommon: "#15a684", rare: "#4285ef", epic: "#9b68df", legendary: "#d9a32e", mythical: "#ed6298", mythic: "#ed6298" };
  return colors[rarity?.trim().toLowerCase() || ""] || colors.common;
}
