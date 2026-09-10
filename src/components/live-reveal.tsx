"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, LoaderCircle, SkipForward, X } from "lucide-react";
import { Art, LiveModal } from "@/components/live-catalog";
import { pendingAutoSellIndices, shouldAutoSellPull, shouldSkipOpening, type OpeningPreferences } from "@/lib/opening-preferences";
import { assetImage, usd, settlementSummary } from "@/lib/live-commerce";
import { rarityAccent, revealClues } from "@/lib/reveal";
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
    scroller.current?.scrollTo({ top: 0 });
    setView("review");
  };

  return <LiveModal title={review ? "Your pulls" : item.name} className="vr-modal" header={null} dismissible={!busy} onClose={() => { if (!busy) onClose(); }}>
    <div className="vr-shell">
      <header className="vr-toolbar">
        <button className="vr-close" aria-label="Close reveal" disabled={!!busy} onClick={onClose}><X size={20} /></button>
        <span>{review ? "Your pulls" : play.rewards.length ? `${Math.min(cursor + 1, play.quantity)} of ${play.quantity}` : item.name}</span>
        {!!play.rewards.length && <button className="vr-skip" disabled={!!busy} onClick={() => {
          if (review) { scroller.current?.scrollTo({ top: 0 }); setView("pull"); }
          else showReview();
        }}>{review ? "Back" : <>Skip<SkipForward size={15} /></>}</button>}
      </header>
      <div className="vr-scroller" ref={scroller}>
      {error && <p className="lc-error vr-error" role="alert">{error}</p>}
      {!play.rewards.length ? <div className="vr-pending">
        <motion.div animate={busy && !reduced ? { y: [0, -8, 0] } : { y: 0 }} transition={{ duration: 2, repeat: busy && !reduced ? Infinity : 0 }}><Art src={item.image} name={item.name} priority /></motion.div>
        <div className="vr-opening-controls">
          <button className="vr-primary" disabled={!!busy} onClick={onOpen}>{busy ? <><LoaderCircle className="vr-spinner" size={18} />{busy}</> : <>Open {play.quantity > 1 ? `${play.quantity} boxes` : "box"}<ArrowRight size={18} /></>}</button>
        </div>
      </div> : review ? <div className="vr-review">
        <div className="vr-review-grid">
          {play.rewards.map((pull, index) => <article className="vr-review-card" key={pull.index} style={{ "--rarity": rarityAccent(pull.rarity) } as CSSProperties}>
            <button className="vr-review-image" aria-label={`Inspect ${String(pull.product.name || "pull")}`} onClick={() => { scroller.current?.scrollTo({ top: 0 }); setCursor(index); setView("pull"); }} disabled={!!busy}><Art src={assetImage(pull.product)} name={String(pull.product.name || "Your pull")} /><span className="vr-rarity-tag">{pull.rarity || "Pull"}</span></button>
            <h3>{String(pull.product.name || "Your pull")}</h3>
            <div className="vr-review-choices">
              {pull.buyback_amount > 0 && <button aria-pressed={decisions[index] === "sell_back"} disabled={!!busy} onClick={() => onChoose(index, "sell_back")}><span>Sell</span><strong>{usd(pull.buyback_amount)}</strong></button>}
              <button aria-pressed={decisions[index] === "claim"} disabled={!!busy} onClick={() => onChoose(index, "claim")}><span>Vault</span><Check size={16} /></button>
            </div>
          </article>)}
        </div>
        <footer className="vr-review-footer">
          <div className="vr-review-totals">{summary.sold > 0 && <span><small>To balance</small><strong className="vr-cash">+{summary.cash}</strong></span>}{summary.claimed > 0 && <span><small>To vault</small><strong>{summary.claimed} {summary.claimed === 1 ? "item" : "items"}</strong></span>}</div>
          <button className="vr-primary" disabled={!!busy || !allChosen} onClick={onSettle}>{busy ? <><LoaderCircle className="vr-spinner" size={18} />{busy}</> : allChosen ? <>{summary.action}<ArrowRight size={18} /></> : `Choose ${play.quantity - selectedCount} more`}</button>
        </footer>
      </div> : reward ? <RewardReveal key={`${play.id}:${cursor}`} reward={reward} item={item} fast={fast} decision={decisions[cursor]} busy={busy}
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

function RewardReveal({ reward, item, fast, decision, busy, autoSell, onChoose, onNext, isLast }: {
  reward: BoxPlay["rewards"][number]; item: CatalogItem; fast: boolean; decision?: Choice; busy: string; autoSell: boolean;
  onChoose: (choice: Choice) => void; onNext: () => void; isLast: boolean;
}) {
  const reduced = useReducedMotion();
  const metadata = revealClues(reward.product, reward.rarity);
  const clues = fast ? [] : metadata;
  // -1: charging box; 0..n: real metadata clues; n: full product.
  const [stage, setStage] = useState(decision || reduced ? clues.length : -1);
  const [stamp, setStamp] = useState<Choice | null>(null);
  const chosen = useRef(false);
  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useEffect(() => {
    if (stamp) { const timer = setTimeout(() => onNextRef.current(), reduced ? 50 : 650); return () => clearTimeout(timer); }
  }, [stamp, reduced]);
  useEffect(() => {
    if (stage >= clues.length) return;
    const timer = setTimeout(() => setStage(current => current + 1), reduced ? 30 : fast ? 180 : stage < 0 ? 1100 : 850);
    return () => clearTimeout(timer);
  }, [stage, clues.length, fast, reduced]);
  const shown = stage >= clues.length;
  useEffect(() => {
    if (!shown || !autoSell || busy || chosen.current) return;
    const timer = setTimeout(() => {
      chosen.current = true;
      onChoose("sell_back");
      setStamp("sell_back");
    }, reduced ? 50 : 500);
    return () => clearTimeout(timer);
  }, [shown, autoSell, busy, reduced, onChoose]);
  const clue = clues[stage];
  const choose = (choice: Choice) => {
    if (busy || chosen.current) return;
    chosen.current = true;
    onChoose(choice);
    setStamp(choice);
  };
  return <div className={`vr-reward ${shown ? "vr-reward-ready" : ""}`} style={{ "--rarity": rarityAccent(reward.rarity) } as CSSProperties}>
    <div className="vr-stage">
      <div className={`vr-aura ${shown ? "vr-aura-open" : ""}`} aria-hidden="true" />
      <AnimatePresence mode="wait">
        {stage < 0 ? <motion.div className="vr-box" key="box" animate={reduced ? {} : { scale: [0.92, 1, 1.08, 1.02, 1.16, 0.1], rotate: [0, -3, 3, -5, 5, 0], y: [0, -5, -5, 0, -12, 45], opacity: [1, 1, 1, 1, 1, 0] }} transition={{ duration: fast ? 0.18 : 1.05 }} exit={{ opacity: 0 }}><Art src={item.image} name={item.name} /></motion.div>
          : !shown ? <motion.div className="vr-clue" key={`clue-${stage}`} initial={{ opacity: 0, y: 16, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.22 }}><small>{clue?.label}</small><strong>{clue?.value}</strong><span className="vr-clue-dots" aria-hidden="true">{clues.map((_, i) => <i key={i} data-active={i <= stage} />)}</span></motion.div>
          : <motion.div className="vr-product-art" key="product" initial={reduced ? false : { opacity: 0, y: 38, rotateY: -65, scale: 0.88 }} animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }} transition={{ type: "spring", stiffness: 145, damping: 19 }}><Art src={assetImage(reward.product)} name={String(reward.product.name || "Your pull")} priority /></motion.div>}
      </AnimatePresence>
      {stamp && <motion.div className={`vr-stamp ${stamp === "sell_back" ? "vr-stamp-sell" : ""}`} role="status" initial={reduced ? false : { scale: 1.6, opacity: 0, rotate: -9 }} animate={{ scale: 1, opacity: 1, rotate: -5 }}><Check size={22} /><strong>{stamp === "sell_back" ? `+${usd(reward.buyback_amount)}` : "To your vault"}</strong></motion.div>}
    </div>
    {shown && <div className="vr-reward-details">
      <motion.div initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <span className="vr-rarity-tag">{reward.rarity || "Your pull"}</span>
        <h2>{String(reward.product.name || "Your pull")}</h2>
        <div className="vr-product-clues">{metadata.filter(entry => entry.label !== "Rarity").map(entry => <span key={entry.label}>{entry.value}</span>)}</div>
        <div className="vr-decision-buttons">
          {reward.buyback_amount > 0 && <button className="vr-sell" disabled={!!busy || !!stamp} onClick={() => choose("sell_back")}><span>Sell</span><strong>{usd(reward.buyback_amount)}</strong></button>}
          <button className="vr-vault" disabled={!!busy || !!stamp} onClick={() => choose("claim")}><span>Vault</span><ArrowRight size={18} /></button>
        </div>
        {decision && !stamp && <button className="vr-quiet vr-next" disabled={!!busy} onClick={onNext}>{isLast ? "Review choices" : "Next pull"}<ArrowRight size={15} /></button>}
      </motion.div>
    </div>}
  </div>;
}
