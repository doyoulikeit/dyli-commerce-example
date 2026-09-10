"use client";

import { Box, Zap } from "lucide-react";
import { useId } from "react";
import type { OpeningPreferences } from "@/lib/opening-preferences";

export type { RevealMode } from "@/lib/opening-preferences";

export function RevealModeSelector({ value, onChange, disabled = false, quantity = 1 }: {
  value: OpeningPreferences; onChange: (preferences: OpeningPreferences) => void; disabled?: boolean; quantity?: number;
}) {
  const descriptionId = useId();
  return <section className="vr-preferences" aria-label="Opening preferences">
    <div className="vr-mode" role="group" aria-label="Opening mode" aria-describedby={descriptionId}>
      <button type="button" aria-pressed={value.mode === "normal"} disabled={disabled} onClick={() => onChange({ ...value, mode: "normal" })}><Box size={17} />Normal</button>
      <button type="button" aria-pressed={value.mode === "turbo"} disabled={disabled} onClick={() => onChange({ ...value, mode: "turbo" })}><Zap size={17} />Turbo</button>
    </div>
    <p id={descriptionId} className="vr-mode-description">{value.mode === "normal"
      ? "Open each box yourself, then choose whether to vault or sell."
      : "See your item right away, with auto-sell for the rarities you choose."}</p>
    {value.mode === "turbo" && <div className="vr-preference-list">
      {([['common', 'Commons'], ['uncommon', 'Uncommons'], ['rare', 'Rares']] as const).map(([rarity, label]) => <label className="vr-preference" key={rarity}>
        <span>Auto-sell {label}</span>
        <input type="checkbox" role="switch" checked={value.autoSell[rarity]} disabled={disabled}
          onChange={event => onChange({ ...value, autoSell: { ...value.autoSell, [rarity]: event.target.checked } })} />
      </label>)}
      {quantity > 1 && <label className="vr-preference"><span>Auto Skip<small>Jump straight to the summary for multi-pulls.</small></span>
        <input type="checkbox" role="switch" checked={value.autoSkip} disabled={disabled} onChange={event => onChange({ ...value, autoSkip: event.target.checked })} />
      </label>}
      <p className="vr-preference-note">Review and confirm your sales in the summary.</p>
    </div>}
  </section>;
}
