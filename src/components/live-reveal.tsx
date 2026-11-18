"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Art, LiveModal } from "@/components/live-catalog";
import { PackArtwork } from "@/components/pack-artwork";
import { packArtwork, packPoster } from "@/lib/pack-artwork";
import Image from "next/image";
import {
  pendingAutoSellIndices,
  shouldAutoSellPull,
  shouldSkipOpening,
  type OpeningPreferences,
} from "@/lib/opening-preferences";
import { assetImage, usd, settlementSummary } from "@/lib/live-commerce";
import {
  rarityAccent,
  rarityTone,
  revealClues,
  revealStages,
} from "@/lib/reveal";
import { useRevealSounds } from "@/components/use-reveal-sounds";
import type { BoxPlay, CatalogItem } from "@/lib/types";

type Choice = "claim" | "sell_back";
type Props = {
  play: Pick<BoxPlay, "id" | "quantity" | "rewards">;
  item: CatalogItem;
  decisions: Choice[];
  busy: string;
  error: string;
  preferences: OpeningPreferences;
  demo?: boolean;
  onOpen: () => void;
  onChoose: (index: number, choice: Choice) => void;
  onSettle: () => void;
  onClose: () => void;
};

export function LiveReveal({
  play,
  item,
  decisions,
  busy,
  error,
  preferences,
  demo = false,
  onOpen,
  onChoose,
  onSettle,
  onClose,
}: Props) {
  const fast = preferences.mode === "turbo";
  const sound = useRevealSounds();
  const openingRequested = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [cursor, setCursor] = useState(() =>
    Math.max(
      0,
      play.rewards.findIndex((_, index) => !decisions[index]),
    ),
  );
  const [view, setView] = useState<"auto" | "pull" | "grid" | "review">(() =>
    play.rewards.length > 0 &&
    play.rewards.every((_, index) => !!decisions[index])
      ? "review"
      : play.quantity > 1 && !fast
        ? "grid"
        : "auto",
  );
  const [revealed, setRevealed] = useState<number[]>(() =>
    play.rewards.flatMap((_, index) => (decisions[index] ? [index] : [])),
  );
  const grid = view === "grid";
  const markRevealed = (index: number) =>
    setRevealed((previous) =>
      previous.includes(index) ? previous : [...previous, index],
    );
  const review =
    view === "review" ||
    (view === "auto" &&
      !!play.rewards.length &&
      shouldSkipOpening(preferences, play.quantity));
  const selectedCount = play.rewards.filter(
    (_, index) => !!decisions[index],
  ).length;
  const summary = settlementSummary(decisions, play.rewards);
  const reward = play.rewards[cursor];
  const allChosen =
    !!play.rewards.length && selectedCount === play.rewards.length;

  useEffect(() => {
    if (!review || busy) return;
    // Auto-sell selects eligible pulls; only the summary's confirm button settles
    // them. Never overwrite a saved choice or make a choice merely from Skip.
    for (const index of pendingAutoSellIndices(
      play.rewards,
      decisions,
      preferences,
    ))
      onChoose(index, "sell_back");
  }, [review, busy, play.rewards, decisions, preferences, onChoose]);

  useEffect(() => {
    // Preload only actual awarded assets; reveal speed never affects outcomes.
    for (const pull of play.rewards) {
      const src = assetImage(pull.product);
      if (src) {
        const image = new window.Image();
        image.src = src;
      }
    }
  }, [play.rewards]);

  useEffect(() => {
    // Pay/Confirm has already created this order. Start its idempotent opening
    // once, then let the customer physically rip the awarded packs.
    if (play.rewards.length || busy || error || openingRequested.current)
      return;
    openingRequested.current = true;
    onOpen();
  }, [play.rewards.length, busy, error, onOpen]);

  const advance = () => {
    scroller.current?.scrollTo({ top: 0 });
    markRevealed(cursor);
    if (play.quantity > 1 && !fast) {
      setView("grid");
      return;
    }
    const next = play.rewards.findIndex(
      (_, index) => index > cursor && !decisions[index],
    );
    if (next >= 0) setCursor(next);
    else setView("review");
  };
  const showReview = () => {
    sound.interaction("select");
    scroller.current?.scrollTo({ top: 0 });
    setRevealed(play.rewards.map((_, index) => index));
    setView("review");
  };

  return (
    <LiveModal
      title={review ? "Your pulls" : item.name}
      className="vr-modal"
      header={null}
      dismissible={!busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="vr-shell vr-native"
        style={
          {
            "--pack-color": packArtwork(item)?.materials?.body_top || "#007AC2",
          } as CSSProperties
        }
      >
        <header className="vr-toolbar">
          <button
            className="vr-close"
            aria-label="Close reveal"
            disabled={!!busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
          <span>
            {demo && "Demo · "}
            {review
              ? "Your pulls"
              : grid
                ? `${item.name} · ${revealed.length} / ${play.quantity}`
                : play.rewards.length
                  ? `${Math.min(cursor + 1, play.quantity)} of ${play.quantity}`
                  : item.name}
          </span>
          <div className="vr-toolbar-actions">
            <button
              className="vr-sound"
              aria-label={sound.enabled ? "Mute sound" : "Enable sound"}
              aria-pressed={sound.enabled}
              title="Sound on / off (M)"
              onClick={sound.toggle}
            >
              {sound.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            {!!play.rewards.length && (
              <button
                className="vr-skip"
                disabled={!!busy}
                title={review ? "Back to individual pulls" : "Reveal all pulls"}
                onClick={() => {
                  if (review) {
                    scroller.current?.scrollTo({ top: 0 });
                    setView(play.quantity > 1 ? "grid" : "pull");
                  } else showReview();
                }}
              >
                {review ? (
                  "Back"
                ) : (
                  <>
                    {grid ? "Reveal all" : "Skip"}
                    <SkipForward size={15} />
                  </>
                )}
              </button>
            )}
          </div>
        </header>
        <div className="vr-scroller" ref={scroller}>
          {error && (
            <p className="lc-error vr-error" role="alert">
              {error}
            </p>
          )}
          {!play.rewards.length ? (
            <div className="vr-pending">
              <div className="vr-idle-box" aria-hidden="true">
                <PackArtwork item={item} controls={false} priority />
              </div>
              {error && !busy ? (
                <button className="vr-primary" onClick={onOpen}>
                  Retry opening
                </button>
              ) : (
                <span className="vr-open-hint" role="status">
                  <LoaderCircle className="vr-spinner" size={16} />
                  {busy || "Opening your packs…"}
                </span>
              )}
            </div>
          ) : grid ? (
            <div className="vr-pack-grid-view">
              <div className="vr-pack-grid" aria-label="Your packs">
                {play.rewards.map((pull, index) => {
                  const shown = revealed.includes(index) || !!decisions[index];
                  return (
                    <article
                      className="vr-pack-slot"
                      key={pull.index}
                      style={
                        {
                          "--rarity": rarityAccent(pull.rarity),
                        } as CSSProperties
                      }
                      data-revealed={shown || undefined}
                    >
                      <button
                        type="button"
                        className="vr-grid-pack"
                        disabled={!!busy}
                        aria-label={
                          shown
                            ? `Inspect pull ${index + 1}: ${String(pull.product.name || "Collectible")}`
                            : `Rip pack ${index + 1}`
                        }
                        onClick={() => {
                          void sound.unlock();
                          setCursor(index);
                          setView("pull");
                        }}
                      >
                        {shown ? (
                          <Art
                            src={assetImage(pull.product)}
                            name={String(pull.product.name || "Pull")}
                          />
                        ) : (
                          <Image
                            src={packPoster(item) || "/brand/dyli-mark.svg"}
                            alt=""
                            fill
                            sizes="(max-width: 600px) 42vw, 240px"
                            unoptimized
                            draggable={false}
                          />
                        )}
                        <span className="vr-grid-pack-number">
                          {shown ? pull.rarity || "Pull" : `Pack ${index + 1}`}
                        </span>
                      </button>
                      {shown ? (
                        <>
                          <h3>{String(pull.product.name || "Your pull")}</h3>
                          <div className="vr-review-choices">
                            {pull.buyback_amount > 0 && (
                              <button
                                type="button"
                                disabled={!!busy}
                                aria-pressed={decisions[index] === "sell_back"}
                                onClick={() => {
                                  sound.interaction("sell");
                                  onChoose(index, "sell_back");
                                }}
                              >
                                Sell · {usd(pull.buyback_amount)}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={!!busy}
                              aria-pressed={decisions[index] === "claim"}
                              onClick={() => {
                                sound.interaction("vault");
                                onChoose(index, "claim");
                              }}
                            >
                              Vault
                              <Check size={14} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <p>Tap to rip</p>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="vr-grid-footer">
                <span>
                  {revealed.length} of {play.quantity} revealed
                </span>
                <button
                  type="button"
                  className="vr-primary"
                  disabled={!!busy}
                  onClick={showReview}
                >
                  {revealed.length === play.quantity
                    ? "Review choices"
                    : "Reveal all"}
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          ) : review ? (
            <div className="vr-review">
              <div className="vr-bulk-choices">
                <span>
                  {play.quantity} {play.quantity === 1 ? "pull" : "pulls"} ·{" "}
                  {selectedCount} selected
                </span>
                <div>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => {
                      sound.interaction("vault");
                      play.rewards.forEach((_, index) =>
                        onChoose(index, "claim"),
                      );
                    }}
                  >
                    <Check size={15} />
                    Vault all
                  </button>
                  {play.rewards.some((pull) => pull.buyback_amount > 0) && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => {
                        sound.interaction("sell");
                        play.rewards.forEach((pull, index) => {
                          if (pull.buyback_amount > 0)
                            onChoose(index, "sell_back");
                        });
                      }}
                    >
                      Sell available
                    </button>
                  )}
                </div>
              </div>
              <div className="vr-review-grid">
                {play.rewards.map((pull, index) => (
                  <motion.article
                    className="vr-review-card"
                    key={pull.index}
                    initial={
                      reduced ? false : { opacity: 0, y: 16, scale: 0.96 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      duration: 0.28,
                      delay: Math.min(index * 0.055, 0.4),
                    }}
                    data-decision={decisions[index]}
                    style={
                      { "--rarity": rarityAccent(pull.rarity) } as CSSProperties
                    }
                  >
                    <button
                      className="vr-review-image"
                      aria-label={`Inspect ${String(pull.product.name || "pull")}`}
                      onClick={() => {
                        scroller.current?.scrollTo({ top: 0 });
                        setCursor(index);
                        setView("pull");
                      }}
                      disabled={!!busy}
                    >
                      <Art
                        src={assetImage(pull.product)}
                        name={String(pull.product.name || "Your pull")}
                      />
                      <span className="vr-rarity-tag">
                        {pull.rarity || "Pull"}
                      </span>
                    </button>
                    <h3>{String(pull.product.name || "Your pull")}</h3>
                    <div className="vr-review-choices">
                      {pull.buyback_amount > 0 && (
                        <button
                          aria-pressed={decisions[index] === "sell_back"}
                          disabled={!!busy}
                          onClick={() => {
                            sound.interaction("sell");
                            onChoose(index, "sell_back");
                          }}
                        >
                          <span>Sell</span>
                          <strong>{usd(pull.buyback_amount)}</strong>
                        </button>
                      )}
                      <button
                        aria-pressed={decisions[index] === "claim"}
                        disabled={!!busy}
                        onClick={() => {
                          sound.interaction("vault");
                          onChoose(index, "claim");
                        }}
                      >
                        <span>Vault</span>
                        <Check size={16} />
                      </button>
                    </div>
                  </motion.article>
                ))}
              </div>
              <footer className="vr-review-footer">
                <div className="vr-review-totals">
                  {summary.sold > 0 && (
                    <span>
                      <small>To balance</small>
                      <strong className="vr-cash">+{summary.cash}</strong>
                    </span>
                  )}
                  {summary.claimed > 0 && (
                    <span>
                      <small>To vault</small>
                      <strong>
                        {summary.claimed}{" "}
                        {summary.claimed === 1 ? "item" : "items"}
                      </strong>
                    </span>
                  )}
                </div>
                <button
                  className="vr-primary"
                  disabled={!!busy || !allChosen}
                  onClick={() => {
                    sound.interaction("confirm");
                    onSettle();
                  }}
                >
                  {busy ? (
                    <>
                      <LoaderCircle className="vr-spinner" size={18} />
                      {busy}
                    </>
                  ) : allChosen ? (
                    <>
                      {summary.action}
                      <ArrowRight size={18} />
                    </>
                  ) : (
                    `Choose ${play.quantity - selectedCount} more`
                  )}
                </button>
              </footer>
            </div>
          ) : reward ? (
            <RewardReveal
              key={`${play.id}:${cursor}`}
              reward={reward}
              item={item}
              fast={fast}
              decision={decisions[cursor]}
              busy={busy}
              sound={sound}
              startImmediately={false}
              alreadyRevealed={revealed.includes(cursor)}
              onRevealed={() => markRevealed(cursor)}
              autoSell={
                !decisions[cursor] && shouldAutoSellPull(reward, preferences)
              }
              onChoose={(choice) => onChoose(cursor, choice)}
              onNext={advance}
              isLast={cursor === play.rewards.length - 1}
            />
          ) : null}
          {!review && !grid && play.rewards.length > 1 && (
            <div className="vr-pull-rail" aria-label="Your pulls">
              {play.rewards.map((pull, index) => (
                <button
                  key={pull.index}
                  aria-label={`View pull ${index + 1}`}
                  aria-current={index === cursor ? "step" : undefined}
                  disabled={!!busy}
                  onClick={() => {
                    setCursor(index);
                    setView("pull");
                  }}
                >
                  {decisions[index] ? (
                    <>
                      <Art
                        src={assetImage(pull.product)}
                        name={String(pull.product.name || "Pull")}
                      />
                      <Check size={12} />
                    </>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </LiveModal>
  );
}

function RewardReveal({
  reward,
  item,
  fast,
  decision,
  busy,
  autoSell,
  onChoose,
  onNext,
  isLast,
  sound,
  startImmediately,
  alreadyRevealed,
  onRevealed,
}: {
  reward: BoxPlay["rewards"][number];
  item: CatalogItem;
  fast: boolean;
  decision?: Choice;
  busy: string;
  autoSell: boolean;
  onChoose: (choice: Choice) => void;
  onNext: () => void;
  isLast: boolean;
  sound: ReturnType<typeof useRevealSounds>;
  startImmediately: boolean;
  alreadyRevealed: boolean;
  onRevealed: () => void;
}) {
  const reduced = useReducedMotion();
  const metadata = useMemo(
    () => revealClues(reward.product, reward.rarity),
    [reward.product, reward.rarity],
  );
  // Freeze this pull's timeline: saving an auto-sell choice must not restart it.
  const [stages] = useState(() =>
    revealStages(reward.product, reward.rarity, fast, autoSell),
  );
  const [autoSelected] = useState(autoSell);
  const [stage, setStage] = useState(() =>
    decision || alreadyRevealed || reduced
      ? stages.length
      : fast || startImmediately
        ? 0
        : -1,
  );
  const [stamp, setStamp] = useState<Choice | null>(null);
  const chosen = useRef(false);
  const onNextRef = useRef(onNext);
  const started = useRef(0);
  const current = stages[stage];
  const shown = stage >= stages.length;
  const tone = rarityTone(reward.rarity);
  const revealCallback = useRef(onRevealed);
  useEffect(() => {
    revealCallback.current = onRevealed;
  }, [onRevealed]);
  useEffect(() => {
    if (shown) revealCallback.current();
  }, [shown]);
  const { enabled, ready, play, interaction } = sound;
  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);
  useEffect(() => {
    if (!stamp || busy) return;
    const timer = setTimeout(
      () => onNextRef.current(),
      reduced ? 50 : autoSelected ? 1200 : 720,
    );
    return () => clearTimeout(timer);
  }, [stamp, reduced, autoSelected, busy]);
  useEffect(() => {
    started.current = performance.now();
    if (!current || busy || current.kind === "box") return;
    const timer = setTimeout(
      () => setStage((index) => index + 1),
      reduced ? 30 : current.duration,
    );
    return () => clearTimeout(timer);
  }, [stage, current, busy, reduced]);
  useEffect(() => {
    if (!enabled || !ready || busy || stage < 0 || (shown && autoSelected))
      return;
    return play(
      shown ? "result" : current.kind,
      tone,
      stage,
      performance.now() - started.current,
    );
  }, [stage, shown, current, enabled, ready, busy, tone, play, autoSelected]);
  useEffect(() => {
    if (!shown || !autoSell || busy || chosen.current) return;
    const timer = setTimeout(
      () => {
        chosen.current = true;
        interaction("sell");
        onChoose("sell_back");
        setStamp("sell_back");
      },
      reduced ? 50 : 250,
    );
    return () => clearTimeout(timer);
  }, [shown, autoSell, busy, reduced, onChoose, interaction]);
  const choose = (choice: Choice) => {
    if (busy || chosen.current) return;
    chosen.current = true;
    interaction(choice === "claim" ? "vault" : "sell");
    onChoose(choice);
    setStamp(choice);
  };
  return (
    <div
      className={`vr-reward ${shown ? "vr-reward-ready" : ""}`}
      style={{ "--rarity": rarityAccent(reward.rarity) } as CSSProperties}
    >
      <div
        className="vr-stage"
        data-stage={current?.kind || (shown ? "result" : "idle")}
      >
        <div
          className={`vr-aura ${shown ? "vr-aura-open" : ""}`}
          aria-hidden="true"
        />
        {stage < 0 ? (
          <div className="vr-reveal-rip">
            <PackArtwork
              item={item}
              mode="rip"
              active={!busy}
              onStart={() => {
                void sound.unlock();
              }}
              onComplete={() => setStage(stages[0]?.kind === "box" ? 1 : 0)}
              priority
            />
            <p className="vr-rip-help">Tap or drag across the top to reveal</p>
          </div>
        ) : !shown ? (
          <div key={stage} className="vr-sequence" aria-live="polite">
            {current.kind === "box" ? (
              <PackArtwork
                item={item}
                mode="rip"
                interactive={false}
                autoOpen
                active={!busy}
                onComplete={() => setStage((index) => index + 1)}
                priority
              />
            ) : current.kind === "rarity" ? (
              <div className="vr-rarity-reveal">
                <div className="vr-rarity-ring" aria-hidden="true" />
                <strong>{reward.rarity}</strong>
              </div>
            ) : (
              <div className="vr-clue">
                <small>{current.detail?.label}</small>
                <strong>{current.detail?.value}</strong>
              </div>
            )}
          </div>
        ) : (
          <motion.div
            className="vr-product-art"
            initial={reduced ? false : { opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7 }}
          >
            <Art
              src={assetImage(reward.product)}
              name={String(reward.product.name || "Your pull")}
              priority
            />
          </motion.div>
        )}
        <AnimatePresence>
          {stamp && (
            <motion.div
              className={`vr-stamp ${stamp === "sell_back" ? "vr-stamp-sell" : ""}`}
              role="status"
              initial={reduced ? false : { scale: 1.6, opacity: 0, rotate: -9 }}
              animate={{ scale: 1, opacity: 1, rotate: -5 }}
              exit={{ opacity: 0 }}
            >
              <Check size={22} />
              <strong>
                {stamp === "sell_back"
                  ? `Sell selected · ${usd(reward.buyback_amount)}`
                  : "Vault selected"}
              </strong>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {shown && (
        <div className="vr-reward-details">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="vr-rarity-tag">
              {reward.rarity || "Your pull"}
            </span>
            <h2>{String(reward.product.name || "Your pull")}</h2>
            <div className="vr-product-clues">
              {metadata
                .filter((entry) => entry.label !== "Rarity")
                .map((entry) => (
                  <span key={entry.label}>{entry.value}</span>
                ))}
            </div>
            <div className="vr-decision-buttons">
              {reward.buyback_amount > 0 && (
                <button
                  className="vr-sell"
                  aria-pressed={decision === "sell_back"}
                  disabled={!!busy || !!stamp}
                  onClick={() => choose("sell_back")}
                >
                  <span>Sell</span>
                  <strong>{usd(reward.buyback_amount)}</strong>
                </button>
              )}
              <button
                className="vr-vault"
                aria-pressed={decision === "claim"}
                disabled={!!busy || !!stamp}
                onClick={() => choose("claim")}
              >
                <span>Vault</span>
                <ArrowRight size={18} />
              </button>
            </div>
            {decision && !stamp && (
              <button
                className="vr-quiet vr-next"
                disabled={!!busy}
                onClick={onNext}
              >
                {isLast ? "Review choices" : "Next pull"}
                <ArrowRight size={15} />
              </button>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
