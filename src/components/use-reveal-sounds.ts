"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createRevealSoundPlayer, getRevealSoundSnapshot, getServerRevealSoundSnapshot, revealInteraction, subscribeRevealSounds, toggleRevealSounds, unlockRevealSounds } from "@/lib/reveal-audio";

export function useRevealSounds() {
  const state = useSyncExternalStore(subscribeRevealSounds, getRevealSoundSnapshot, getServerRevealSoundSnapshot);
  const player = useRef<ReturnType<typeof createRevealSoundPlayer> | null>(null);
  const play = useCallback((...args: Parameters<ReturnType<typeof createRevealSoundPlayer>["play"]>) => {
    player.current ||= createRevealSoundPlayer();
    return player.current.play(...args);
  }, []);
  useEffect(() => () => { player.current?.dispose(); player.current = null; }, []);
  return { ...state, play, interaction: revealInteraction, toggle: toggleRevealSounds, unlock: unlockRevealSounds };
}
