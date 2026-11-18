"use client";

import Image from "next/image";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Box, Rotate3D } from "lucide-react";
import { packArtwork, packPoster } from "@/lib/pack-artwork";
import type { ApiRecord, CatalogItem } from "@/lib/types";
import type { PackScene } from "../../sdk/pack-renderer.mjs";

export type PackArtworkHandle = { open(): void };

type Props = {
  item: CatalogItem;
  detail?: ApiRecord;
  mode?: "preview" | "rip";
  interactive?: boolean;
  active?: boolean;
  priority?: boolean;
  controls?: boolean;
  className?: string;
  speed?: number;
  autoOpen?: boolean;
  onComplete?: () => void;
  onStart?: () => void;
};

export const PackArtwork = forwardRef<PackArtworkHandle, Props>(
  function PackArtwork(
    {
      item,
      detail,
      mode = "preview",
      interactive = true,
      active = true,
      priority = false,
      controls = true,
      className = "",
      speed = 1,
      autoOpen = false,
      onComplete,
      onStart,
    },
    ref,
  ) {
    const root = useRef<HTMLDivElement>(null);
    const mount = useRef<HTMLDivElement>(null);
    const scene = useRef<PackScene | null>(null);
    const callbacks = useRef({ onComplete, onStart });
    callbacks.current = { onComplete, onStart };
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [inView, setInView] = useState(false);
    const [visible, setVisible] = useState(true);
    const [allowed, setAllowed] = useState(false);
    const [requested, setRequested] = useState(false);
    const [reduced, setReduced] = useState(true);
    const [exiting, setExiting] = useState(false);
    const completion = useRef(false);
    const art = packArtwork(item, detail);
    const artKey = art ? JSON.stringify(art) : "";
    const poster = packPoster(item, detail);
    const running = active && inView && visible;
    const runningRef = useRef(running);
    runningRef.current = running;
    const shouldLoad =
      !!art &&
      !failed &&
      !reduced &&
      inView &&
      (mode === "rip" || allowed || requested);

    useEffect(() => {
      const motion = matchMedia("(prefers-reduced-motion: reduce)");
      const pointer = matchMedia("(hover: hover) and (pointer: fine)");
      const connection = (
        navigator as Navigator & {
          connection?: EventTarget & {
            saveData?: boolean;
            effectiveType?: string;
          };
        }
      ).connection;
      const sync = () => {
        setReduced(motion.matches);
        setAllowed(
          !motion.matches &&
            pointer.matches &&
            !connection?.saveData &&
            !["slow-2g", "2g", "3g"].includes(connection?.effectiveType || ""),
        );
        setVisible(!document.hidden);
      };
      sync();
      motion.addEventListener("change", sync);
      pointer.addEventListener("change", sync);
      connection?.addEventListener?.("change", sync);
      document.addEventListener("visibilitychange", sync);
      const observer =
        typeof IntersectionObserver !== "undefined"
          ? new IntersectionObserver(
              ([entry]) => setInView(entry.isIntersecting),
              { rootMargin: "80px" },
            )
          : null;
      if (observer && root.current) observer.observe(root.current);
      else setInView(true);
      return () => {
        observer?.disconnect();
        motion.removeEventListener("change", sync);
        pointer.removeEventListener("change", sync);
        connection?.removeEventListener?.("change", sync);
        document.removeEventListener("visibilitychange", sync);
      };
    }, []);

    useEffect(() => {
      if (!shouldLoad || !mount.current || !artKey) return;
      let cancelled = false,
        loadFailed = false;
      let instance: PackScene | null = null;
      setReady(false);
      setExiting(false);
      const fail = () => {
        if (cancelled || loadFailed) return;
        loadFailed = true;
        instance?.dispose();
        scene.current = null;
        setReady(false);
        setFailed(true);
      };
      const timeout = setTimeout(fail, 6500);
      // The runtime is vendored from DYLI's published renderer, rather than
      // evaluating a script URL returned by a catalog or third-party product.
      void import("../../sdk/pack-renderer.mjs")
        .then(({ createPackScene }) => {
          if (cancelled || loadFailed || !mount.current) return;
          instance = createPackScene(mount.current, {
            artwork: JSON.parse(artKey),
            mode,
            interactive,
            speed,
            active: runningRef.current,
            onReady() {
              if (!cancelled && !loadFailed) {
                clearTimeout(timeout);
                setReady(true);
                instance?.setActive(runningRef.current);
              }
            },
            onStart() {
              if (!cancelled) callbacks.current.onStart?.();
            },
            onExit() {
              if (!cancelled) setExiting(true);
            },
            onComplete() {
              if (!cancelled && !completion.current) {
                completion.current = true;
                callbacks.current.onComplete?.();
              }
            },
            onError: fail,
          });
          scene.current = instance;
          return instance.init();
        })
        .catch(fail);
      return () => {
        cancelled = true;
        clearTimeout(timeout);
        instance?.dispose();
        if (scene.current === instance) scene.current = null;
      };
    }, [artKey, shouldLoad, mode, interactive, speed]);

    useEffect(() => {
      scene.current?.setActive(running);
    }, [running]);

    const open = () => {
      if (!active || completion.current) return;
      if (ready && scene.current) scene.current.open();
      else {
        completion.current = true;
        callbacks.current.onComplete?.();
      }
    };
    useEffect(() => {
      if (!autoOpen || mode !== "rip" || !active || completion.current) return;
      if (ready && scene.current) {
        scene.current.open();
        return;
      }
      // Reduced motion, failed WebGL and unavailable artwork use a short visual
      // fallback. This advances presentation only; the server chose the reward.
      if (!artKey || failed || reduced) {
        const timer = setTimeout(() => {
          if (!completion.current) {
            completion.current = true;
            callbacks.current.onComplete?.();
          }
        }, 650);
        return () => clearTimeout(timer);
      }
    }, [autoOpen, mode, active, ready, artKey, failed, reduced]);
    useImperativeHandle(ref, () => ({ open }));

    return (
      <div
        ref={root}
        className={`dyli-pack-art ${mode === "rip" ? "dyli-pack-rip" : ""} ${className}`}
        data-pack-renderer={ready ? "3d" : "poster"}
        data-exiting={exiting || undefined}
        style={{ "--pack-exit-duration": `${550 / speed}ms` } as CSSProperties}
        role={mode === "rip" && interactive && ready ? "button" : undefined}
        tabIndex={mode === "rip" && interactive && ready ? 0 : undefined}
        aria-label={
          mode === "rip" && interactive ? `Rip open ${item.name}` : undefined
        }
        onKeyDown={(event) => {
          if (
            mode === "rip" &&
            interactive &&
            ready &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            open();
          }
        }}
      >
        <div className="dyli-pack-poster" style={{ opacity: ready ? 0 : 1 }}>
          {poster ? (
            <Image
              src={poster}
              alt={item.name}
              fill
              sizes="(max-width: 640px) 80vw, 520px"
              priority={priority}
              unoptimized
              draggable={false}
            />
          ) : (
            <span className="dyli-pack-placeholder">
              <Box size={52} />
              <span>{item.name}</span>
            </span>
          )}
        </div>
        <div ref={mount} className="dyli-pack-canvas" aria-hidden="true" />
        {mode === "preview" &&
          controls &&
          art &&
          !ready &&
          !reduced &&
          !failed && (
            <button
              type="button"
              className="dyli-view-3d"
              onClick={() => setRequested(true)}
              disabled={requested}
            >
              <Rotate3D size={15} />
              {requested ? "Loading 3D" : "View in 3D"}
            </button>
          )}
        {mode === "rip" && !ready && (
          <button
            type="button"
            className="dyli-rip-fallback"
            disabled={!active}
            aria-label={`Reveal ${item.name}`}
            onClick={open}
          >
            <span>Tap to reveal</span>
          </button>
        )}
      </div>
    );
  },
);
