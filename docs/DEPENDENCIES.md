# Dependency review

Reviewed September 9, 2026. The locked dependency tree reports **28 moderate
findings, no high or critical findings**. That is an audit result, not a statement
that all code paths are safe. Most entries are packages inheriting one of three
transitive advisories.

| Root advisory | How it arrives | Assessment |
| --- | --- | --- |
| [decode-uri-component](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Privy React → wallet connectors → WalletConnect → query-string 7 | Malformed URL input can consume excessive CPU. The installed decoder is CommonJS 0.2.2; the fix is ESM 0.5.0. Do not force that replacement under query-string 7. Treat untrusted wallet links as exposed until the connector chain adopts the fix. |
| [stream-json](https://github.com/advisories/GHSA-528h-pc64-c93x) | Privy server auth → Solana web3 → jayson | The advisory targets nested-input filters. The inspected jayson code uses StreamValues/Verifier, not those filters; this storefront does not host a jayson JSON-RPC server. This reduces observed exposure but does not clear the dependency finding. A 1.x → 3.x override is not a compatible patch. |
| [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | jayson and MetaMask's dependency chain | The advisory concerns v3/v5/v6 with a supplied output buffer. Inspected jayson call sites use v4 with no arguments, and app code uses crypto.randomUUID. Wallet SDK bundles still need upstream review; do not globally replace UUID 8/9 with 11+. |

The latest Privy React release was also evaluated; it still reports these roots.
The release keeps the established auth version rather than introducing a wallet
upgrade that does not resolve them. No new forced transitive overrides were added.
The existing reviewed Axios and ws pins remain in place.

## Maintaining the example

- Run `npm audit` against the committed lockfile, including development dependencies.
- Review upstream Privy/WalletConnect releases for compatible fixes. The deprecated
  server-auth package will need a separately tested migration to Privy's Node SDK.
- Test sign-in, embedded and external wallets, card checkout, payment recovery,
  openings and redemptions before accepting an auth/wallet dependency change.
- Never run `npm audit fix --force` to get a clean number. CI fails on high/critical
  advisories; moderate findings still require review, not blanket suppression.

Public source availability is not a security certification. Keep the lockfile,
review these findings before deploying and follow [abuse controls](ABUSE-CONTROLS.md).
