import { BoxLiveSounds } from "./reveal-sounds";

const storageKey = "dyli_box_sounds_enabled_v1";
const serverSnapshot = { enabled: true, ready: false };
let snapshot = serverSnapshot;
let context: AudioContext | null = null;
let interactions: BoxLiveSounds | null = null;
const listeners = new Set<() => void>();
const players = new Set<BoxLiveSounds>();

function update(value: typeof snapshot) {
  if (value.enabled === snapshot.enabled && value.ready === snapshot.ready) return;
  snapshot = value;
  listeners.forEach(listener => listener());
}
function stopAll() { interactions?.stop(); players.forEach(player => player.stop()); }
function readPreference() {
  try { update({ ...snapshot, enabled: !["false", "0"].includes(localStorage.getItem(storageKey) || "") }); }
  catch { /* Sound preferences still work when storage is blocked. */ }
  if (!snapshot.enabled) stopAll();
}
export const getRevealSoundSnapshot = () => snapshot;
export const getServerRevealSoundSnapshot = () => serverSnapshot;
export async function unlockRevealSounds() {
  try {
    if (!context) context = new AudioContext();
    if (context.state === "suspended") await context.resume();
    update({ ...snapshot, ready: context.state === "running" });
  } catch { /* Audio support and autoplay permissions must never block a purchase. */ }
}
export function toggleRevealSounds() {
  const enabled = !snapshot.enabled;
  update({ ...snapshot, enabled });
  try { localStorage.setItem(storageKey, String(enabled)); } catch { /* Session-only preference. */ }
  if (enabled) void unlockRevealSounds();
  else stopAll();
}
function gesture() { if (snapshot.enabled) void unlockRevealSounds(); }
function visibility() { if (document.hidden) stopAll(); }
function keyboard(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
  if (event.key.toLowerCase() === "m") { event.preventDefault(); toggleRevealSounds(); }
  else gesture();
}
export function subscribeRevealSounds(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    readPreference();
    window.addEventListener("storage", readPreference);
    window.addEventListener("pointerdown", gesture, { passive: true });
    window.addEventListener("keydown", keyboard);
    document.addEventListener("visibilitychange", visibility);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    stopAll();
    window.removeEventListener("storage", readPreference);
    window.removeEventListener("pointerdown", gesture);
    window.removeEventListener("keydown", keyboard);
    document.removeEventListener("visibilitychange", visibility);
  };
}
export function createRevealSoundPlayer() {
  let player: BoxLiveSounds | null = null;
  let generation = 0;
  return {
    play(...args: Parameters<BoxLiveSounds["play"]>) {
      if (!snapshot.enabled || !context || context.state !== "running" || document.hidden) return;
      if (!player) { player = new BoxLiveSounds(context); players.add(player); }
      const current = player;
      const serial = ++generation;
      try { current.play(...args); } catch { current.stop(); }
      return () => { if (generation === serial) current.stop(); };
    },
    dispose() {
      generation++;
      if (player) { players.delete(player); player.dispose(); player = null; }
    },
  };
}
export function revealInteraction(kind: Parameters<BoxLiveSounds["interaction"]>[0]) {
  if (!snapshot.enabled || !context || context.state !== "running" || document.hidden) return;
  try {
    interactions ||= new BoxLiveSounds(context);
    interactions.interaction(kind);
  } catch { /* Optional feedback cannot affect settlement. */ }
}
