import { createCommerceClient } from '../sdk/commerce-client.mjs';

// GET-only preflight: no config changes, payments or wallet actions.
const checks = [];
const check = (ok, label) => checks.push({ ok, label });
const originArg = process.argv.find(value => value.startsWith('--origin='))?.slice(9);
try {
  if (!process.env.DYLI_API_KEY?.trim()) throw Error('missing_settings');
  const client = createCommerceClient({ apiKey: process.env.DYLI_API_KEY, baseUrl: process.env.DYLI_COMMERCE_BASE_URL });
  const [root, bootstrap] = await Promise.all([client.readiness(), client.bootstrap()]);
  const capability = root.capabilities || {};
  check(bootstrap.bootstrap_version === 1, 'Bootstrap v1 available');
  check(Boolean(bootstrap.integration?.application_id && bootstrap.partner?.slug), 'Application discovered from the Commerce key');
  check(capability.box_play?.contract_version === 'gacha' && capability.box_play?.max_quantity === 10, 'Bulk gacha protocol (1–10)');
  check(capability.writes?.enabled === true && capability.box_play?.ready === true, 'Box writes configured (not an end-to-end certification)');
  check(Array.isArray(capability.payments) && capability.payments.length > 0, 'At least one payment method enabled');
  const mode = process.env.DYLI_AUTH_MODE || bootstrap.auth?.mode;
  if (mode === 'existing') {
    check(bootstrap.auth?.mode === 'existing', 'Partner-owned authentication registered; no DYLI Privy configuration required');
    check(Boolean(bootstrap.auth?.storefront_origin), 'Checkout return origin registered');
    console.log('ACTION: implement and acceptance-test the client wallet/auth adapter and server identity verifier. This checker cannot certify your authentication.');
  } else if (mode === 'partner' || mode === 'privy') {
    check(Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.PRIVY_SECRET_KEY), 'Partner-owned Privy credentials paired');
    check(Boolean(process.env.STOREFRONT_ORIGIN), 'Canonical card-return origin set');
  } else {
    check(bootstrap.auth?.available === true, 'DYLI-managed sign-in configured for this partner');
    const origin = originArg || process.env.STOREFRONT_ORIGIN || 'http://localhost:3000';
    check(bootstrap.auth?.allowed_origins?.includes(origin) === true, 'Requested storefront origin registered with DYLI');
  }
  const expected = process.env.DYLI_EXPECTED_ENVIRONMENT;
  if (expected) check(root.environment === expected, 'Connected environment matches DYLI_EXPECTED_ENVIRONMENT');
  console.log(`Environment: ${root.environment === 'lab' ? 'lab' : 'production'}; wallet chain: ${Number(bootstrap.wallet?.chain_id) || 'unknown'}`);
  if (root.environment !== 'lab') console.log('Production connection: this checker does not submit payments or transactions. Use an isolated lab for acceptance testing.');
  if (['true', 'force'].includes(process.env.NEXT_PUBLIC_DEMO_MODE)) console.log('POC mode is enabled; real-money local routes remain disabled.');
  console.log('Auth verification, wallet policy, webhook delivery and real settlement still need acceptance verification.');
} catch (error) {
  // Never print response bodies, URLs, credentials or provider errors.
  check(false, error?.status === 404 ? 'Connected API does not expose Commerce bootstrap v1; deploy the upgraded API to your assigned sandbox' : error?.status ? `DYLI preflight returned HTTP ${error.status}; check key scope, API version and environment` : error?.message === 'missing_settings' ? 'Set DYLI_API_KEY in .env.local' : 'Setup incomplete: check your Commerce key, base URL, Node version and network');
}
for (const result of checks) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.label}`);
process.exitCode = checks.some(result => !result.ok) ? 1 : 0;
