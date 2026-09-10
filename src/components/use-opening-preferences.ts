"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { normalizeOpeningPreferences, openingPreferenceKey, parseOpeningPreferences, type OpeningPreferences } from "@/lib/opening-preferences";

const eventName = "vaulted:opening-preferences";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(eventName, listener);
  };
}

export function useOpeningPreferences(account: string) {
  const key = account ? openingPreferenceKey(account) : null;
  // A blocked storage API should not stop someone choosing settings this visit.
  const [temporary, setTemporary] = useState<{ key: string | null; raw: string } | null>(null);
  const saved = useSyncExternalStore(subscribe, () => {
    try { return key ? localStorage.getItem(key) : null; } catch { return null; }
  }, () => null);
  const raw = temporary?.key === key ? temporary.raw : saved;
  const preferences = useMemo(() => parseOpeningPreferences(raw), [raw]);
  const update = (next: OpeningPreferences) => {
    const raw = JSON.stringify(normalizeOpeningPreferences(next));
    try {
      if (!key) throw new Error("Account is loading");
      localStorage.setItem(key, raw);
      setTemporary(null);
      window.dispatchEvent(new Event(eventName));
    } catch { setTemporary({ key, raw }); }
  };
  return { preferences, update };
}
