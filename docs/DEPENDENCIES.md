# Dependency review

Reviewed November 19, 2026. The production dependency audit (`npm audit --omit=dev`) reports **0 critical, 28 high and 12 moderate package findings**. Several packages inherit the same upstream advisory. These results do not certify a deployment or prove that an advisory is reachable in this app.

## Patched in this review

- Next.js and its ESLint configuration are pinned to **16.4.6**. This includes the [typed-array cache RCE fix](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) and [image-processing RCE fix](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw). The resolved Sharp version is **0.35.5**. Image optimization remains disabled for partner-controlled artwork.
- Axios is pinned to **1.21.1**, follow-redirects to **1.16.3**, and source-map-js to **1.2.2**.
- Zod 4 dependencies resolve to **4.6.7**. Zod 3 consumers retain their compatible major version.

## Remaining upstream findings

| Root advisory | How it arrives | Assessment |
| --- | --- | --- |
| [decode-uri-component](https://github.com/advisories/GHSA-qr28-fpjm-wq7f) | Privy React and wallet connectors → WalletConnect → query-string 7 | Malformed URL input can consume excessive CPU. The installed decoder is CommonJS 0.2.2; the patched 0.5.1 release is ESM. A forced replacement under query-string 7 changes the module contract. Treat untrusted wallet links as exposed until a reviewed connector upgrade removes this dependency. |
| [Zod constrained collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | Alchemy, Privy and wallet SDKs depend on Zod 3 | The advisory reports versions below 4.6.6. Zod 4 consumers are patched; replacing Zod 3 globally would cross a major API boundary. Review actual inputs and upgrade the owning SDKs before clearing this finding. |
| [stream-json](https://github.com/advisories/GHSA-528h-pc64-c93x) | Privy server auth → Solana web3 → jayson | The advisory targets nested-input filters. This storefront does not host a jayson JSON-RPC server. That reduces observed exposure but does not clear the dependency finding. |
| [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | jayson and wallet SDK dependencies | App code uses crypto.randomUUID. Wallet SDK bundles still need upstream review; do not globally replace older UUID major versions. |

## Maintaining the example

- Run `npm audit` against the committed lockfile, including development dependencies, and record unresolved findings rather than suppressing them.
- Review compatible Privy, WalletConnect and Alchemy upgrades. Moving from the deprecated server-auth package to Privy's Node SDK needs its own integration checks.
- Test sign-in, embedded and external wallets, card checkout, payment recovery, openings and redemptions before accepting an auth or wallet SDK upgrade.
- Never run `npm audit fix --force` solely to obtain a clean count. A passing build and local tests do not certify real-money flows.

Public source availability is not a security certification. Review these findings before deploying and follow [abuse controls](ABUSE-CONTROLS.md).
