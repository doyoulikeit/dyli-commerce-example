"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { LiveModal } from "./live-catalog";
import type { ApiRecord } from "@/lib/types";

export const emptyMarketFilters = { brand: "", category: "", subcategory: "", min_price: "", max_price: "", seller: "", sort: "newest" };
export type MarketFiltersValue = typeof emptyMarketFilters;

export function MarketSort({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="cm-sort"><select aria-label="Sort marketplace" value={value} onChange={event => onChange(event.target.value)}>
    <option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option>
  </select></label>;
}

type Props = { value: MarketFiltersValue; facets: ApiRecord; onChange: (value: MarketFiltersValue) => void };
const filterCount = (value: MarketFiltersValue) => Object.entries(value).filter(([key, selected]) => key !== "sort" && selected).length;

function FilterFields({ value, facets, onChange }: Props) {
  const change = (key: keyof MarketFiltersValue, selected: string) => onChange({ ...value, [key]: selected });
  return <div className="cm-filter-fields">
      {([['brand', 'brands', 'Brand'], ['category', 'categories', 'Category'], ['subcategory', 'subcategories', 'Type']] as const).map(([key, facet, label]) => {
        const options = Array.isArray(facets[facet]) ? facets[facet].filter((item): item is string => typeof item === "string") : [];
        return <label key={key}>{label}<select value={value[key]} onChange={event => change(key, event.target.value)}>
          <option value="">All {label === "Category" ? "categories" : label === "Type" ? "types" : "brands"}</option>{[...new Set([...options, ...(value[key] ? [value[key]] : [])])].map(item => <option key={item} value={item}>{item}</option>)}
        </select></label>;
      })}
      <fieldset className="cm-filter-price"><legend>Price</legend><div>
        <label><span>Min</span><input aria-label="Minimum price" type="number" inputMode="decimal" min="0" max="1000000" step="0.01" placeholder="$0" value={value.min_price} onChange={event => change("min_price", event.target.value)} /></label>
        <span aria-hidden="true">to</span>
        <label><span>Max</span><input aria-label="Maximum price" type="number" inputMode="decimal" min="0" max="1000000" step="0.01" placeholder="Any" value={value.max_price} onChange={event => change("max_price", event.target.value)} /></label>
      </div></fieldset>
      <label>Collector<input placeholder="Username" maxLength={50} value={value.seller} onChange={event => change("seller", event.target.value)} /></label>
    </div>;
}

export function MarketFilterSidebar({ value, facets, onChange }: Props) {
  return <aside className="cm-filter-sidebar" aria-label="Marketplace filters">
    <div className="cm-filter-title"><h2>Filters</h2>{filterCount(value) > 0 && <button className="cm-clear" onClick={() => onChange({ ...emptyMarketFilters, sort: value.sort })}>Reset</button>}</div>
    <FilterFields value={value} facets={facets} onChange={onChange} />
  </aside>;
}

function FilterSheet({ value, facets, onChange, onClose }: Props & { onClose: () => void }) {
  const [draft, setDraft] = useState(value);
  const invalid = draft.min_price !== "" && draft.max_price !== "" && Number(draft.min_price) > Number(draft.max_price);
  return <LiveModal title="Filters" onClose={onClose} className="cm-filter-sheet">
    <form onSubmit={event => { event.preventDefault(); if (!invalid) { onChange(draft); onClose(); } }}>
      <div className="cm-filter-sheet-content"><FilterFields value={draft} facets={facets} onChange={setDraft} />
        {invalid && <p className="cm-error" role="alert">Maximum price must be at least the minimum.</p>}
      </div>
      <footer><button type="button" className="lc-secondary" onClick={() => setDraft({ ...emptyMarketFilters, sort: draft.sort })}>Reset</button>
        <button type="submit" className="lc-primary" disabled={invalid}>Show results</button></footer>
    </form>
  </LiveModal>;
}

export function MarketFilterButton(props: Props) {
  const [open, setOpen] = useState(false), count = filterCount(props.value);
  return <>
    <button className="cm-filter-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><SlidersHorizontal size={17} /> Filters {count > 0 && <span>{count}</span>}</button>
    {open && <FilterSheet {...props} onClose={() => setOpen(false)} />}
  </>;
}
