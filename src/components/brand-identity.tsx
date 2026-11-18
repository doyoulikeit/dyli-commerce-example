"use client";
import Image from "next/image";
import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

const themeEvent = "dyli-theme-change";
const readTheme = () => document.documentElement.dataset.theme === "dark";
const serverTheme = () => false;
function subscribeTheme(notify: () => void) {
  window.addEventListener(themeEvent, notify);
  return () => window.removeEventListener(themeEvent, notify);
}

export function CommerceLogo({
  name = "Vaulted",
  compact = false,
}: {
  name?: string;
  compact?: boolean;
}) {
  return (
    <span className="dyli-commerce-logo">
      <Image
        src="/brand/dyli-mark.svg"
        width={42}
        height={42}
        alt=""
        priority
      />
      {!compact && (
        <span>
          <strong>{name}</strong>
          {name.toUpperCase() !== "DYLI" && <small>powered by DYLI</small>}
        </span>
      )}
    </span>
  );
}

export function ThemeSwitch() {
  const dark = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  useEffect(() => {
    try {
      const value = localStorage.getItem("dyli-commerce-theme") === "dark";
      document.documentElement.dataset.theme = value ? "dark" : "light";
      window.dispatchEvent(new Event(themeEvent));
    } catch {
      /* Browsing works when storage is unavailable. */
    }
  }, []);
  return (
    <button
      type="button"
      className="dyli-theme-switch"
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      onClick={() => {
        const next = !dark;
        document.documentElement.dataset.theme = next ? "dark" : "light";
        window.dispatchEvent(new Event(themeEvent));
        try {
          localStorage.setItem("dyli-commerce-theme", next ? "dark" : "light");
        } catch {
          /* Optional preference. */
        }
      }}
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}
