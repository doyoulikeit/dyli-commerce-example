# Security

Report suspected vulnerabilities privately to [support@dyli.io](mailto:support@dyli.io) with the subject “Commerce security report”. Include affected versions and safe reproduction steps. Do not post credentials, customer data or payment details in a public issue. Do not test with other customers' accounts or funds.

## Deploying your storefront

- Use the latest reviewed release and commit the lockfile. Run `npm ci`, `npm test`, `npm run lint`, `npm run build` and `npm audit` before launch.
- Keep Commerce keys, auth secrets and private RPC credentials server-side. `.env.local` must not be committed. Rotate any credential exposed through Git, logs, screenshots or an issue—even after removing it.
- Use HTTPS and register your exact domains with DYLI and your login provider. Restrict browser-visible Maps/RPC keys to your domains and required APIs.
- The default sign-in verifies the customer's session and linked wallet on the server. Implement and review both adapters before using an existing login. Browser IDs, storage and success callbacks are not proof of identity, payment or ownership.
- Do not proxy account configuration, analytics or arbitrary Commerce paths to customers. Keep server-side tenant/customer ownership checks on every new route.
- Configure the [shared request limits and abuse alerts](docs/ABUSE-CONTROLS.md), including public catalog routes. Production fails closed without the shared counter store. Add host-level WAF limits as well; DYLI key limits do not replace storefront protection.
- Keep uncertain payment and withdrawal attempts recoverable. Confirm receipts before retrying or refunding. Never use production funds for automated tests.
- The starter serves CDN images directly. If enabling image optimization, use a patched framework and a narrow host allowlist. Its framing policy permits same-origin only; review any change needed for an embedded storefront.

The tests are regression checks, not an independent penetration test or a guarantee of safety. Dependency findings must be assessed before deployment. Publishing this source does not grant access to DYLI, inventory, third-party brands, artwork or payment services.

See the [dependency review](docs/DEPENDENCIES.md) for remaining advisory risks and
the [licensing notice](NOTICE.md) for branding and artwork boundaries.
