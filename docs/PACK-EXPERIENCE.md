# Pack artwork and opening UI

The example uses DYLI's fonts, colors and pack designs, with shared live/demo browsing and pack details. Your app name still comes from the registered Commerce app or `NEXT_PUBLIC_STOREFRONT_NAME`. The logo, theme tokens and layouts are in `src/components/brand-identity.tsx` and `src/components/commerce-theme.css`.

## Use the pack assets

`pack.artwork` is optional. When present it supplies the public GLB, rendered front texture, flat poster and material map. It also identifies the portable DYLI renderer. The model is shared across designs, about 341 KB. All asset URLs are content-hashed and cacheable, with no API key or customer token required.

- `src/lib/pack-artwork.ts` validates asset URLs and preserves ordinary image fallbacks.
- `src/components/pack-artwork.tsx` is the React wrapper. Use `mode="preview"` for sealed artwork and `mode="rip"` for the visual opening. The imperative `open()` method animates a tear; `onComplete` advances presentation.
- `sdk/pack-renderer.mjs` is a pinned, framework-independent renderer, with Three.js included. Its source URL and SHA-256 are recorded in `sdk/pack-renderer.version.json` and verified by tests. Replace both together when upgrading to a reviewed DYLI version. Do not dynamically execute arbitrary product-provided scripts.
- For a custom frontend, use `createPackScene(element, { artwork, mode, onComplete })`, await `init()`, and dispose the instance on unmount. The mount needs an explicit height. `setActive(false)` pauses drawing.

Full asset contract and framework-independent usage: [DYLI artwork guide](https://www.dyli.io/docs/api/commerce-artwork#3d-pack-artwork).

## Mobile and performance

Catalog grids use flat images. The renderer loads in a separate chunk only when a visible preview or reveal needs it. Desktop previews can animate automatically; mobile previews are opt in. Offscreen/hidden scenes pause, and their resources are released on unmount. Reduced motion, failed WebGL and slow loading keep the poster and a normal reveal button. Pack details have a contained scroll area and fixed checkout footer on mobile. Theme preferences are stored locally without changing a customer's account settings.

## Payment and result boundaries

The opening animation never pays, selects a reward or finalizes a choice. The existing checkout/recovery layer obtains the paid server result first. Skipping goes to review without choosing or settling anything. “Vault all” and “Sell available” only select choices; the customer must still confirm. Items without an available buyback cannot be selected for sale.

Live mode uses real money and inventory. Use demo mode or the isolated fixtures below for presentation checks. A production checkout smoke test still needs an explicitly authorized customer and purchase.

## Verify safely

Run `npm test`, `npm run lint`, `npm run build` and `npm run source:check` before publishing. For visual checks, `tests/browser/server.mjs` builds the actual live components with isolated wallet and API transports. It never broadcasts transactions. Set:

- `ESBUILD_PACKAGE_PATH`: your installed esbuild entry point.
- `VERIFY_OUTPUT`: a temporary build directory outside tracked source.
- `VERIFY_FIXTURE_DIR` (optional): a read-only snapshot directory containing `catalog.json` and `pack-<id>.json`. Without it, the harness reads the catalog from the local app on port 3107.
- `VERIFY_ASSET_ROOT` (optional): the DYLI platform's `public` directory to exercise unpublished artwork assets locally.

Start `node tests/browser/server.mjs`, then open `http://localhost:3108`. All wallet sends, buybacks and orders in this harness are simulated. Catalog/artwork reads can be real. Never copy credentials into fixtures or expose the fixture server as a live storefront.
