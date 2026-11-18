import type { CatalogItem } from "./types";
import type { DemoPull } from "./demo-pulls";
import {
  normalizeOpeningPreferences,
  type OpeningPreferences,
} from "./opening-preferences";

export type DemoOpening = {
  id: string;
  item: CatalogItem;
  rewards: DemoPull[];
  decisions: Array<"claim" | "sell_back">;
  revealed: boolean;
  total: number;
  preferences: OpeningPreferences;
};

// A saved draw only resumes while its matching virtual purchase is unfinished.
// A completed activity entry prevents replay if a tab closes during cleanup.
export function restoreDemoOpening(
  raw: string | null,
  activity: Array<{ id: string; status: string }>,
): DemoOpening | null {
  if (!raw || raw.length > 1_000_000) return null;
  try {
    const run = JSON.parse(raw);
    if (
      !run ||
      typeof run !== "object" ||
      typeof run.id !== "string" ||
      !activity.some(
        (entry) => entry.id === run.id && entry.status === "Opening",
      ) ||
      !Number.isInteger(run.total) ||
      run.total < 1 ||
      run.total > 10 ||
      !run.item ||
      typeof run.item.name !== "string" ||
      typeof run.item.id !== "string" ||
      typeof run.item.key !== "string" ||
      !run.item.raw ||
      typeof run.item.raw !== "object" ||
      !Array.isArray(run.rewards) ||
      run.rewards.length !== run.total ||
      !run.rewards.every(
        (pull: DemoPull) =>
          pull &&
          ["id", "name", "image", "brand", "grade", "tier"].every(
            (key) => typeof pull[key as keyof DemoPull] === "string",
          ) &&
          [pull.value, pull.buyback, pull.odds].every(
            (value) => Number.isFinite(value) && value >= 0,
          ),
      )
    )
      return null;
    const decisions: DemoOpening["decisions"] = [];
    if (Array.isArray(run.decisions))
      run.decisions
        .slice(0, run.total)
        .forEach((choice: unknown, index: number) => {
          if (
            choice === "claim" ||
            (choice === "sell_back" && run.rewards[index].buyback > 0)
          )
            decisions[index] = choice;
        });
    return {
      ...run,
      decisions,
      revealed: run.revealed === true,
      preferences: normalizeOpeningPreferences(run.preferences),
    };
  } catch {
    return null;
  }
}
