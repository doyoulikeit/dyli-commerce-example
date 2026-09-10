import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommerceRuntime, parseAbstractPaymaster, registeredCheckoutOrigin, checkoutReturnUrls, shopEnabled } from '../src/lib/commerce-runtime.ts';
import { getGeneralPaymasterInput } from 'viem/zksync';

const bootstrap = {
  bootstrap_version: 1,
  auth: { mode: 'dyli_managed', available: true, app_id: 'public-app', app_secret: 'must-not-escape', allowed_origins: ['https://shop.example', 'http://localhost:3000'], storefront_origin: 'https://shop.example', sponsor_transactions: true },
  wallet: { chain_id: 11124 }, storefront: { name: 'Partner', boxes_only: true },
};
test('native paymaster is discovered from the key and only safe public parameters cross to the client', () => {
  const gas = { available: true, provider: 'abstract_paymaster', chain_id: 11124, paymaster: `0x${'b'.repeat(40)}`, paymaster_input: getGeneralPaymasterInput({ innerInput: '0x' }), secret: 'never-expose' };
  const wallet = { chain_id: 11124, gas_sponsorship: gas };
  const runtime = parseCommerceRuntime({ ...bootstrap, wallet });
  assert.equal(runtime.paymaster.address, gas.paymaster);
  assert.equal(runtime.paymaster.input, gas.paymaster_input);
  assert.equal(runtime.sponsorTransactions, false, 'never enable unrelated Privy sponsorship');
  assert.ok(!JSON.stringify(runtime).includes('never-expose'));
  for (const patch of [{ chain_id: 2741 }, { provider: 'other' }, { paymaster: `0x${'0'.repeat(40)}` }, { paymaster_input: '0x1234' }]) {
    assert.throws(() => parseAbstractPaymaster({ ...wallet, gas_sponsorship: { ...gas, ...patch } }));
  }
  assert.equal(parseAbstractPaymaster(undefined), null);
  assert.equal(parseAbstractPaymaster({ ...wallet, gas_sponsorship: { ...gas, available: false } }), null);
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
