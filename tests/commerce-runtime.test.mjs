import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommerceRuntime, parsePackSponsorship, registeredCheckoutOrigin, checkoutReturnUrls, shopEnabled } from '../src/lib/commerce-runtime.ts';

const bootstrap = {
  bootstrap_version: 1,
  auth: { mode: 'dyli_managed', available: true, app_id: 'public-app', app_secret: 'must-not-escape', allowed_origins: ['https://shop.example', 'http://localhost:3000'], storefront_origin: 'https://shop.example', sponsor_transactions: true },
  wallet: { chain_id: 84532 }, storefront: { name: 'Partner', boxes_only: true },
};
test('managed Base pack sponsorship exposes only public capability metadata', () => {
 const gas = { available: true, provider: 'alchemy_gas_manager', chain_id: 84532, account_mode: 'eip7702', scope: 'paid_pack_openings', requires_dyli_login: false, secret: 'never-expose' };
 const wallet = { chain_id: 84532, registration: { ready: true }, gas_sponsorship: gas };
 const runtime = parseCommerceRuntime({ ...bootstrap, wallet });
 assert.deepEqual(runtime.packSponsorship, { chainId: 84532, provider: gas.provider, scope: gas.scope });
 assert.equal(runtime.walletRegistration, true);
 assert.equal(runtime.sponsorTransactions, false);
 assert.ok(!JSON.stringify(runtime).includes('never-expose'));
 for (const patch of [{ chain_id: 8453 }, { provider: 'other' }, { account_mode: 'other' }, { scope: 'all_transactions' }, { requires_dyli_login: true }])
   assert.throws(() => parsePackSponsorship({ ...wallet, gas_sponsorship: { ...gas, ...patch } }));
 assert.equal(parsePackSponsorship(undefined), null);
 assert.equal(parsePackSponsorship({ ...wallet, gas_sponsorship: { available: false } }), null);
});
test('existing auth discovers a registered origin without Privy, provider secrets or sponsorship', () => {
  const runtime = parseCommerceRuntime({ ...bootstrap, auth: { mode: 'existing', available: true, provider: 'custom', storefront_origin: 'https://shop.example', secret: 'must-not-escape' } });
  assert.equal(runtime.authMode, 'existing');
  assert.equal(runtime.appId, '');
  assert.equal(runtime.sponsorTransactions, false);
  assert.ok(!JSON.stringify(runtime).includes('must-not-escape'));
  assert.equal(registeredCheckoutOrigin(runtime, undefined, 'https://attacker.example/api', true), 'https://shop.example');
  assert.throws(() => registeredCheckoutOrigin(runtime, 'https://other.example', 'https://shop.example', true));
});
test('runtime discovery is public-only and keeps sponsorship disabled by default', () => {
  const runtime = parseCommerceRuntime(bootstrap);
  assert.equal(runtime.name, 'Partner');
  assert.equal(runtime.boxesOnly, true);
  assert.equal(runtime.sponsorTransactions, false);
  assert.ok(!JSON.stringify(runtime).includes('must-not-escape'));
});
test('Box-only partner discovery does not fetch disabled Shop endpoints or require an env override', () => {
  assert.equal(shopEnabled({ partner: { catalog_rules: { show_boxes: true, show_primary: false, show_secondary: false } } }), false);
  assert.equal(shopEnabled({ partner: { catalog_rules: { show_explore: false, show_primary: true } } }), false);
  assert.equal(shopEnabled({ partner: { catalog_rules: { show_explore: true, show_primary: true } } }), true);
  assert.equal(shopEnabled({}, true), false);
});
test('unsupported or incomplete bootstrap never enables live auth', () => {
  for (const patch of [{ bootstrap_version: 2 }, { wallet: { chain_id: 1 } }, { auth: { ...bootstrap.auth, available: false } }, { auth: { ...bootstrap.auth, allowed_origins: [] } }]) {
    assert.throws(() => parseCommerceRuntime({ ...bootstrap, ...patch }));
  }
});
test('managed return origin ignores Host in production and restricts overrides', () => {
  const runtime = parseCommerceRuntime(bootstrap);
  assert.equal(registeredCheckoutOrigin(runtime, undefined, 'https://attacker.example/api/checkout', true), 'https://shop.example');
  assert.equal(registeredCheckoutOrigin(runtime, undefined, 'http://localhost:3000/api/checkout', false), 'http://localhost:3000');
  for (const value of ['https://attacker.example', 'http://remote.example', 'https://shop.example/path', 'https://user:pass@shop.example']) {
    assert.throws(() => registeredCheckoutOrigin(runtime, value, 'https://shop.example', true));
  }
});

test('checkout returns to the actual local page even when the canonical env points at Vercel', () => {
  const runtime = parseCommerceRuntime(bootstrap);
  for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3001', 'http://[::1]:4000']) {
    const result = checkoutReturnUrls(runtime, `${origin}/boxes?category=pokemon&checkout=cancelled&session_id=old#pulls`, 'https://shop.example');
    assert.equal(result.successUrl, `${origin}/boxes?category=pokemon&checkout=success&session_id={CHECKOUT_SESSION_ID}#pulls`);
    assert.equal(result.cancelUrl, `${origin}/boxes?category=pokemon&checkout=cancelled#pulls`);
  }
});

test('all auth modes validate the return URL; host spoofing and unregistered remote domains fail closed', () => {
  for (const authMode of ['partner', 'existing', 'dyli_managed']) {
    const runtime = { ...parseCommerceRuntime(bootstrap), authMode };
    assert.match(checkoutReturnUrls(runtime, 'https://shop.example/boxes').successUrl, /^https:\/\/shop.example\/boxes\?/);
    assert.match(checkoutReturnUrls(runtime, undefined).successUrl, /^https:\/\/shop.example\//);
    for (const value of ['https://evil.example', 'http://shop.example', 'http://localhost.evil.example', 'http://127.0.0.1.evil.example', 'https://shop.example@evil.example', 'https://x:y@shop.example', '//shop.example', 'javascript:alert(1)', {}, 'https://shop.example/' + 'x'.repeat(1800)]) {
      assert.throws(() => checkoutReturnUrls(runtime, value));
    }
    assert.throws(() => checkoutReturnUrls(runtime, undefined, 'https://evil.example'));
  }
});
