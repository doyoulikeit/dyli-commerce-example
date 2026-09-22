"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, LoaderCircle, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { Art, LiveModal } from "@/components/live-catalog";
import { pendingAutoSellIndices, shouldAutoSellPull, shouldSkipOpening, type OpeningPreferences } from "@/lib/opening-preferences";
import { assetImage, usd, settlementSummary } from "@/lib/live-commerce";
import { rarityAccent, rarityTone, revealClues, revealStages } from "@/lib/reveal";
import { useRevealSounds } from "@/components/use-reveal-sounds";
import type { BoxPlay, CatalogItem } from "@/lib/types";

type Choice = "claim" | "sell_back";
type Props = {
  play: BoxPlay; item: CatalogItem; decisions: Choice[]; busy: string; error: string;
  preferences: OpeningPreferences;
  onOpen: () => void; onChoose: (index: number, choice: Choice) => void;
  onSettle: () => void; onClose: () => void;
};

export function LiveReveal({ play, item, decisions, busy, error, preferences, onOpen, onChoose, onSettle, onClose }: Props) {
  const fast = preferences.mode === "turbo";
  const sound = useRevealSounds();
  const [opened, setOpened] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [cursor, setCursor] = useState(() => Math.max(0, play.rewards.findIndex((_, index) => !decisions[index])));
  const [view, setView] = useState<"auto" | "pull" | "review">(() => play.rewards.length > 0 && play.rewards.every((_, index) => !!decisions[index]) ? "review" : "auto");
  const review = view === "review" || (view === "auto" && !!play.rewards.length && shouldSkipOpening(preferences, play.quantity));
  const selectedCount = play.rewards.filter((_, index) => !!decisions[index]).length;
  const summary = settlementSummary(decisions, play.rewards);
  const reward = play.rewards[cursor];
  const allChosen = !!play.rewards.length && selectedCount === play.rewards.length;

  useEffect(() => {
    if (!review || busy) return;
    // Auto-sell selects eligible pulls; only the summary's confirm button settles
    // them. Never overwrite a saved choice or make a choice merely from Skip.
    for (const index of pendingAutoSellIndices(play.rewards, decisions, preferences)) onChoose(index, "sell_back");
  }, [review, busy, play.rewards, decisions, preferences, onChoose]);

  useEffect(() => {
    // Preload only actual awarded assets; reveal speed never affects outcomes.
    for (const pull of play.rewards) {
      const src = assetImage(pull.product);
      if (src) { const image = new window.Image(); image.src = src; }
    }
  }, [play.rewards]);

  const advance = () => {
    scroller.current?.scrollTo({ top: 0 });
    const next = play.rewards.findIndex((_, index) => index > cursor && !decisions[index]);
    if (next >= 0) setCursor(next);
    else setView("review");
  };
  const showReview = () => {
    sound.interaction("select");
    scroller.current?.scrollTo({ top: 0 });
    setView("review");
  };

  return <LiveModal title={review ? "Your pulls" : item.name} className="vr-modal" header={null} dismissible={!busy} onClose={() => { if (!busy) onClose(); }}>
    <div className="vr-shell">
      <header className="vr-toolbar">
        <button className="vr-close" aria-label="Close reveal" disabled={!!busy} onClick={onClose}><X size={20} /></button>
        <span>{review ? "Your pulls" : play.rewards.length ? `${Math.min(cursor + 1, play.quantity)} of ${play.quantity}` : item.name}</span>
        <div className="vr-toolbar-actions"><button className="vr-sound" aria-label={sound.enabled ? "Mute sound" : "Enable sound"} aria-pressed={sound.enabled} title="Sound on / off (M)" onClick={sound.toggle}>{sound.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
        {!!play.rewards.length && <button className="vr-skip" disabled={!!busy} title={review ? "Back to individual pulls" : "Reveal all pulls"} onClick={() => {
          if (review) { scroller.current?.scrollTo({ top: 0 }); setView("pull"); }
          else showReview();
        }}>{review ? "Back" : <>Skip<SkipForward size={15} /></>}</button>}</div>
      </header>
      <div className="vr-scroller" ref={scroller}>
      {error && <p className="lc-error vr-error" role="alert">{error}</p>}
      {!play.rewards.length ? <div className="vr-pending">
        <button className="vr-idle-box" aria-label={play.quantity > 1 ? `Open ${play.quantity} boxes` : "Open box"} disabled={!!busy} onClick={() => { void sound.unlock(); setOpened(true); onOpen(); }}>
          <Art src={item.image} name={item.name} priority />
        </button>
        <span className="vr-open-hint" role="status">{busy ? <><LoaderCircle className="vr-spinner" size={14} />{busy}</> : "Click to open the box"}</span>
      </div> : review ? <div className="vr-review">
        <div className="vr-review-grid">
          {play.rewards.map((pull, index) => <motion.article className="vr-review-card" key={pull.index} initial={reduced ? false : { opacity: 0, y: 16, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .28, delay: Math.min(index * .055, .4) }} data-decision={decisions[index]} style={{ "--rarity": rarityAccent(pull.rarity) } as CSSProperties}>
            <button className="vr-review-image" aria-label={`Inspect ${String(pull.product.name || "pull")}`} onClick={() => { scroller.current?.scrollTo({ top: 0 }); setCursor(index); setView("pull"); }} disabled={!!busy}><Art src={assetImage(pull.product)} name={String(pull.product.name || "Your pull")} /><span className="vr-rarity-tag">{pull.rarity || "Pull"}</span></button>
            <h3>{String(pull.product.name || "Your pull")}</h3>
            <div className="vr-review-choices">
              {pull.buyback_amount > 0 && <button aria-pressed={decisions[index] === "sell_back"} disabled={!!busy} onClick={() => { sound.interaction("sell"); onChoose(index, "sell_back"); }}><span>Sell</span><strong>{usd(pull.buyback_amount)}</strong></button>}
              <button aria-pressed={decisions[index] === "claim"} disabled={!!busy} onClick={() => { sound.interaction("vault"); onChoose(index, "claim"); }}><span>Vault</span><Check size={16} /></button>
            </div>
          </motion.article>)}
        </div>
        <footer className="vr-review-footer">
          <div className="vr-review-totals">{summary.sold > 0 && <span><small>To balance</small><strong className="vr-cash">+{summary.cash}</strong></span>}{summary.claimed > 0 && <span><small>To vault</small><strong>{summary.claimed} {summary.claimed === 1 ? "item" : "items"}</strong></span>}</div>
          <button className="vr-primary" disabled={!!busy || !allChosen} onClick={() => { sound.interaction("confirm"); onSettle(); }}>{busy ? <><LoaderCircle className="vr-spinner" size={18} />{busy}</> : allChosen ? <>{summary.action}<ArrowRight size={18} /></> : `Choose ${play.quantity - selectedCount} more`}</button>
        </footer>
      </div> : reward ? <RewardReveal key={`${play.id}:${cursor}`} reward={reward} item={item} fast={fast} decision={decisions[cursor]} busy={busy} sound={sound} startImmediately={opened && cursor === 0}
        autoSell={!decisions[cursor] && shouldAutoSellPull(reward, preferences)}
        onChoose={choice => onChoose(cursor, choice)} onNext={advance} isLast={cursor === play.rewards.length - 1} /> : null}
      {!review && play.rewards.length > 1 && <div className="vr-pull-rail" aria-label="Your pulls">
        {play.rewards.map((pull, index) => <button key={pull.index} aria-label={`View pull ${index + 1}`} aria-current={index === cursor ? "step" : undefined} disabled={!!busy} onClick={() => { setCursor(index); setView("pull"); }}>
          {decisions[index] ? <><Art src={assetImage(pull.product)} name={String(pull.product.name || "Pull")} /><Check size={12} /></> : <span>{index + 1}</span>}
        </button>)}
      </div>}
      </div>
    </div>
  </LiveModal>;
}

function RewardReveal({ reward, item, fast, decision, busy, autoSell, onChoose, onNext, isLast, sound, startImmediately }: {
  reward: BoxPlay["rewards"][number]; item: CatalogItem; fast: boolean; decision?: Choice; busy: string; autoSell: boolean;
  onChoose: (choice: Choice) => void; onNext: () => void; isLast: boolean;
  sound: ReturnType<typeof useRevealSounds>; startImmediately: boolean;
}) {
  const reduced = useReducedMotion();
  const metadata = useMemo(() => revealClues(reward.product, reward.rarity), [reward.product, reward.rarity]);
  // Freeze this pull's timeline: saving an auto-sell choice must not restart it.
  const [stages] = useState(() => revealStages(reward.product, reward.rarity, fast, autoSell));
  const [autoSelected] = useState(autoSell);
  const [stage, setStage] = useState(() => decision || reduced ? stages.length : fast || startImmediately ? 0 : -1);
  const [stamp, setStamp] = useState<Choice | null>(null);
  const chosen = useRef(false);
  const onNextRef = useRef(onNext);
  const started = useRef(0);
  const current = stages[stage];
  const shown = stage >= stages.length;
  const tone = rarityTone(reward.rarity);
  const { enabled, ready, play, interaction } = sound;
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useEffect(() => {
    if (!stamp || busy) return;
    const timer = setTimeout(() => onNextRef.current(), reduced ? 50 : autoSelected ? 1200 : 720);
    return () => clearTimeout(timer);
  }, [stamp, reduced, autoSelected, busy]);
  useEffect(() => {
    started.current = performance.now();
    if (!current || busy) return;
    const timer = setTimeout(() => setStage(index => index + 1), reduced ? 30 : current.duration);
    return () => clearTimeout(timer);
  }, [stage, current, busy, reduced]);
  useEffect(() => {
    if (!enabled || !ready || busy || stage < 0 || (shown && autoSelected)) return;
    return play(shown ? "result" : current.kind, tone, stage, performance.now() - started.current);
  }, [stage, shown, current, enabled, ready, busy, tone, play, autoSelected]);
  useEffect(() => {
    if (!shown || !autoSell || busy || chosen.current) return;
    const timer = setTimeout(() => {
      chosen.current = true;
      interaction("sell");
      onChoose("sell_back");
      setStamp("sell_back");
    }, reduced ? 50 : 250);
    return () => clearTimeout(timer);
  }, [shown, autoSell, busy, reduced, onChoose, interaction]);
  const choose = (choice: Choice) => {
    if (busy || chosen.current) return;
    chosen.current = true;
    interaction(choice === "claim" ? "vault" : "sell");
    onChoose(choice);
    setStamp(choice);
  };
  return <div className={`vr-reward ${shown ? "vr-reward-ready" : ""}`} style={{ "--rarity": rarityAccent(reward.rarity) } as CSSProperties}>
    <div className="vr-stage" data-stage={current?.kind || (shown ? "result" : "idle")}>
      <div className={`vr-aura ${shown ? "vr-aura-open" : ""}`} aria-hidden="true" />
      {stage < 0 ? <button className="vr-idle-box" aria-label="Open this box" disabled={!!busy} onClick={() => { void sound.unlock(); setStage(0); }}><Art src={item.image} name={item.name} /></button>
        : !shown ? <div key={stage} className="vr-sequence" aria-live="polite">
          {current.kind === "box" ? <div className="vr-box vr-box-opening"><Art src={item.image} name={item.name} /></div>
            : current.kind === "rarity" ? <div className="vr-rarity-reveal"><div className="vr-rarity-ring" aria-hidden="true" /><strong>{reward.rarity}</strong></div>
            : <div className="vr-clue"><small>{current.detail?.label}</small><strong>{current.detail?.value}</strong></div>}
        </div> : <motion.div className="vr-product-art" initial={reduced ? false : { opacity: 0, y: 12, scale: .92 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .7 }}><Art src={assetImage(reward.product)} name={String(reward.product.name || "Your pull")} priority /></motion.div>}
      <AnimatePresence>{stamp && <motion.div className={`vr-stamp ${stamp === "sell_back" ? "vr-stamp-sell" : ""}`} role="status" initial={reduced ? false : { scale: 1.6, opacity: 0, rotate: -9 }} animate={{ scale: 1, opacity: 1, rotate: -5 }} exit={{ opacity: 0 }}><Check size={22} /><strong>{stamp === "sell_back" ? `+${usd(reward.buyback_amount)}` : "To your vault"}</strong></motion.div>}</AnimatePresence>
    </div>
    {stage < 0 && <span className="vr-open-hint">Click to open the box</span>}
    {shown && <div className="vr-reward-details">
      <motion.div initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <span className="vr-rarity-tag">{reward.rarity || "Your pull"}</span>
        <h2>{String(reward.product.name || "Your pull")}</h2>
        <div className="vr-product-clues">{metadata.filter(entry => entry.label !== "Rarity").map(entry => <span key={entry.label}>{entry.value}</span>)}</div>
        <div className="vr-decision-buttons">
          {reward.buyback_amount > 0 && <button className="vr-sell" aria-pressed={decision === "sell_back"} disabled={!!busy || !!stamp} onClick={() => choose("sell_back")}><span>Sell</span><strong>{usd(reward.buyback_amount)}</strong></button>}
          <button className="vr-vault" aria-pressed={decision === "claim"} disabled={!!busy || !!stamp} onClick={() => choose("claim")}><span>Vault</span><ArrowRight size={18} /></button>
        </div>
        {decision && !stamp && <button className="vr-quiet vr-next" disabled={!!busy} onClick={onNext}>{isLast ? "Review choices" : "Next pull"}<ArrowRight size={15} /></button>}
      </motion.div>
    </div>}
  </div>;
}
